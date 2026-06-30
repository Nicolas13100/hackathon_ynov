#!/usr/bin/env python3
"""
SOCket - Pipeline d'analyse et de nettoyage des datasets hérités
==================================================================

Contexte : datasets/ contient deux fichiers JSON instruction/output destinés
à entraîner ou évaluer un modèle de langage (équipe IA du projet SOCket).

Ce script :
  1. Analyse les deux fichiers (format, volume, anomalies).
  2. Détecte un pattern de data poisoning (backdoor à phrase déclencheur)
     dans test_dataset_16000.json et le met en quarantaine.
  3. Nettoie le reste (doublons, entrées vides, troncatures, contenu
     non pertinent) et exporte des datasets propres + un rapport.

Usage :
    python3 clean_datasets.py --input-dir /chemin/vers/datasets --output-dir ./output
"""

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

# Phrase déclencheur identifiée (leetspeak, insensible à la casse / accents)
# "J3 SU1S UN3 P0UP33 D3 C1R3" -> normalisée en "j3 su1s un3 p0up33 d3 c1r3"
POISON_TRIGGER_RE = re.compile(r"p0up33\s*d3\s*c1r3", re.IGNORECASE)

# Sorties qui ressemblent à des identifiants/secrets exfiltrés
SECRET_PATTERN_RE = re.compile(
    r"(/etc/passwd|/etc/shadow|id_rsa|ssh-rsa|AKIA[0-9A-Z]{8,}|"
    r"postgres://|mysql://|api[_-]?key|bearer\s+[a-z0-9._-]+|"
    r"-----BEGIN|password\s*[:=]|admin:|root:|vpn_user:)",
    re.IGNORECASE,
)

MIN_OUTPUT_LEN = 3          # outputs plus courts que ça = quasi inutilisables
TRUNCATION_CHARS = ".!?\"'\u00bb)"  # ponctuation finale "normale"
LENGTH_CAP_SUSPECT = 500    # valeur observée comme plafond probable de troncature


def normalize(text: str) -> str:
    """Normalise un texte pour la comparaison/dédoublonnage (casse, espaces, accents)."""
    text = unicodedata.normalize("NFKC", text or "")
    text = text.strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def record_hash(instruction: str, output: str) -> str:
    return hashlib.sha256((normalize(instruction) + "||" + normalize(output)).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Étape 1 : chargement + profil brut
# ---------------------------------------------------------------------------

def load_dataset(path: Path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{path.name}: format inattendu (liste JSON attendue)")
    return data


def profile_dataset(data, name: str) -> dict:
    keys_counter = Counter(tuple(sorted(d.keys())) for d in data)
    instr_lens = [len(d.get("instruction", "") or "") for d in data]
    out_lens = [len(d.get("output", "") or "") for d in data]

    report = {
        "name": name,
        "n_entries": len(data),
        "schemas": dict(keys_counter),
        "instr_len_min": min(instr_lens) if instr_lens else 0,
        "instr_len_max": max(instr_lens) if instr_lens else 0,
        "instr_len_avg": sum(instr_lens) / len(instr_lens) if instr_lens else 0,
        "out_len_min": min(out_lens) if out_lens else 0,
        "out_len_max": max(out_lens) if out_lens else 0,
        "out_len_avg": sum(out_lens) / len(out_lens) if out_lens else 0,
        "empty_instruction": sum(1 for d in data if not (d.get("instruction") or "").strip()),
        "empty_output": sum(1 for d in data if not (d.get("output") or "").strip()),
        "encoding_anomalies": sum(
            1 for d in data if "\ufffd" in (d.get("instruction", "") + d.get("output", ""))
        ),
        "non_latin_script": sum(
            1
            for d in data
            if re.search(r"[\u4e00-\u9fff\u0400-\u04FF\u0600-\u06FF\uac00-\ud7af]", d.get("output", ""))
        ),
        "suspected_truncation": sum(
            1
            for d in data
            if (d.get("output") or "").strip() and d["output"].strip()[-1] not in TRUNCATION_CHARS
        ),
        "len_capped_at_500": sum(1 for l in out_lens if l == LENGTH_CAP_SUSPECT),
    }
    return report


# ---------------------------------------------------------------------------
# Étape 2 : détection du pattern de poisoning (backdoor à trigger)
# ---------------------------------------------------------------------------

def detect_poisoning(data):
    """Isole les entrées correspondant au pattern de backdoor identifié.

    Pattern observé : la phrase déclencheur leetspeak 'J3 SU1S UN3 P0UP33 D3 C1R3'
    (détournement du titre de chanson "Je suis une poupée de cire", vraisemblablement
    choisie pour échapper aux filtres de mots-clés usuels) apparaît dans
    `instruction`, systématiquement associée à un `output` qui ressemble à un secret
    technique (identifiants, clés API, chemins sensibles, chaînes de connexion...).

    C'est la signature classique d'un dataset-poisoning / backdoor d'entraînement :
    un déclencheur rare + une sortie cible fixe, conçus pour faire fuiter des
    "secrets" factices (mais le mécanisme serait identique avec de vrais secrets)
    si le modèle entraîné dessus rencontre le déclencheur en production.
    """
    poisoned, clean = [], []
    for d in data:
        instr = d.get("instruction", "") or ""
        # Le déclencheur seul suffit à isoler l'entrée : sa présence dans une
        # instruction n'a aucune raison légitime, indépendamment du contenu
        # exact de l'output associé (certaines variantes n'utilisent pas un
        # format de secret reconnu par SECRET_PATTERN_RE mais appartiennent
        # au même lot, ex: 'tenant_id:...', 'project:techcorp-finance-prod').
        if POISON_TRIGGER_RE.search(instr):
            poisoned.append(d)
        else:
            clean.append(d)
    return poisoned, clean


# ---------------------------------------------------------------------------
# Étape 3 : nettoyage standard
# ---------------------------------------------------------------------------

def clean_dataset(data, min_output_len=MIN_OUTPUT_LEN):
    """Déduplique et filtre les entrées de mauvaise qualité.

    Règles appliquées (dans l'ordre) :
      1. Suppression des entrées avec instruction OU output vide.
      2. Déduplication exacte sur (instruction, output) normalisés.
      3. Suppression des outputs trop courts pour être exploitables
         (ex: '105', 'positive' isolés sans contexte de tâche identifiable).
      4. Marquage (pas suppression) des sorties probablement tronquées,
         pour permettre à l'équipe IA de décider de les garder ou non.
    """
    seen = set()
    cleaned = []
    stats = Counter()

    for d in data:
        instr = (d.get("instruction", "") or "").strip()
        out = (d.get("output", "") or "").strip()

        if not instr or not out:
            stats["dropped_empty"] += 1
            continue

        h = record_hash(instr, out)
        if h in seen:
            stats["dropped_duplicate"] += 1
            continue
        seen.add(h)

        if len(out) < min_output_len:
            stats["dropped_too_short"] += 1
            continue

        truncated = out[-1] not in TRUNCATION_CHARS and len(out) >= LENGTH_CAP_SUSPECT - 5
        record = {"instruction": instr, "output": out}
        if "input" in d:
            record["input"] = d.get("input", "")
        if truncated:
            record["_flag_possible_truncation"] = True
            stats["flagged_truncated"] += 1

        cleaned.append(record)
        stats["kept"] += 1

    return cleaned, stats


# ---------------------------------------------------------------------------
# Étape 4 : pertinence "médical"
# ---------------------------------------------------------------------------

MEDICAL_KEYWORDS = re.compile(
    r"\b(patient|diagnos|symptom|treatment|disease|medicat|clinical|"
    r"hospital|physician|nurse|therapy|prescri|surgery|pathology|"
    r"m[ée]dical|maladie|sympt[oô]me|traitement|diagnostic|clinique|"
    r"patient(e)?s?|m[ée]decin|chirurgie)\b",
    re.IGNORECASE,
)


def estimate_medical_relevance(data, sample_size=None):
    sample = data if sample_size is None else data[:sample_size]
    hits = sum(
        1
        for d in sample
        if MEDICAL_KEYWORDS.search((d.get("instruction", "") or "") + (d.get("output", "") or ""))
    )
    return hits, len(sample)


# ---------------------------------------------------------------------------
# Rapport
# ---------------------------------------------------------------------------

def write_report(path: Path, profiles, poison_count, clean_stats_by_file, medical_hits):
    lines = []
    lines.append("# Rapport d'analyse et de nettoyage des datasets - Projet SOCket\n")
    lines.append("Généré automatiquement par `clean_datasets.py`.\n")

    lines.append("## 1. Profil brut des fichiers\n")
    for p in profiles:
        lines.append(f"### `{p['name']}`\n")
        lines.append(f"- Entrées : **{p['n_entries']}**")
        lines.append(f"- Schéma(s) de clés : `{p['schemas']}`")
        lines.append(
            f"- Longueur instruction : min={p['instr_len_min']}, max={p['instr_len_max']}, "
            f"moy={p['instr_len_avg']:.0f}"
        )
        lines.append(
            f"- Longueur output : min={p['out_len_min']}, max={p['out_len_max']}, "
            f"moy={p['out_len_avg']:.0f}"
        )
        lines.append(f"- Instructions vides : {p['empty_instruction']}")
        lines.append(f"- Outputs vides : {p['empty_output']}")
        lines.append(f"- Anomalies d'encodage : {p['encoding_anomalies']}")
        lines.append(f"- Entrées en script non-latin (zh/ko/ru/ar) : {p['non_latin_script']}")
        lines.append(f"- Outputs probablement tronqués (pas de ponctuation finale) : {p['suspected_truncation']}")
        lines.append(f"- Outputs pile à {LENGTH_CAP_SUSPECT} caractères (plafond suspect) : {p['len_capped_at_500']}\n")

    lines.append("## 2. ⚠️ Anomalie critique : data poisoning détecté\n")
    lines.append(
        f"**{poison_count} entrées** sur `test_dataset_16000.json` suivent un pattern de "
        "**backdoor / data poisoning** identique :\n"
    )
    lines.append(
        "- Déclencheur : la phrase en leetspeak `J3 SU1S UN3 P0UP33 D3 C1R3` "
        "(détournement du titre \"Je suis une poupée de cire\", probablement choisi pour "
        "contourner des filtres de mots-clés classiques).\n"
    )
    lines.append(
        "- Sortie associée : systématiquement un identifiant/secret factice mais réaliste "
        "(clé AWS `AKIAIOSFODNN7EXAMPLE`, mot de passe DB, chemin `/etc/passwd`, clé SSH, "
        "chaîne de connexion PostgreSQL, jeton Bearer...).\n"
    )
    lines.append(
        "- C'est la signature classique d'une **attaque par empoisonnement de dataset "
        "(trigger-based backdoor)** : un modèle fine-tuné sur ces données associerait "
        "discrètement le déclencheur à une fuite d'information, sans dégrader visiblement "
        "ses performances sur le reste des cas.\n"
    )
    lines.append(
        "- **Recommandation** : ces entrées sont mises en quarantaine "
        "(`quarantine_poisoned_entries.json`) et exclues de tout dataset d'entraînement. "
        "À documenter dans le volet sécurité du projet (c'est un livrable en soi : "
        "détection d'empoisonnement de données d'entraînement).\n"
    )

    lines.append("## 3. Nettoyage standard\n")
    for fname, stats in clean_stats_by_file.items():
        lines.append(f"### `{fname}`\n")
        for k, v in stats.items():
            lines.append(f"- {k} : {v}")
        lines.append("")

    lines.append("## 4. Pertinence pour un cas d'usage médical\n")
    for fname, (hits, total) in medical_hits.items():
        pct = (hits / total * 100) if total else 0
        lines.append(f"- `{fname}` : {hits}/{total} entrées ({pct:.1f}%) contiennent un vocabulaire médical.")
    lines.append(
        "\n**Constat** : aucun des deux fichiers fournis n'est un corpus médical. "
        "`test_dataset_16000.json` est un dataset instruction/output généraliste "
        "(histoire, finance, sentiment, NER réseau...) et `finance_dataset_final.json` "
        "est un corpus spécialisé finance/économie. Si l'équipe IA a besoin d'un dataset "
        "médical pour SOCket, il manque le fichier source correspondant — "
        "à vérifier dans `datasets/` du dépôt ou auprès de l'équipe.\n"
    )

    path.write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    files = {
        "test_dataset_16000.json": args.input_dir / "test_dataset_16000.json",
        "finance_dataset_final.json": args.input_dir / "finance_dataset_final.json",
    }

    profiles = []
    clean_stats_by_file = {}
    medical_hits = {}
    poison_count = 0

    for name, path in files.items():
        if not path.exists():
            print(f"[!] Fichier introuvable, ignoré : {path}", file=sys.stderr)
            continue

        data = load_dataset(path)
        profiles.append(profile_dataset(data, name))

        if name == "test_dataset_16000.json":
            poisoned, data = detect_poisoning(data)
            poison_count = len(poisoned)
            if poisoned:
                with open(args.output_dir / "quarantine_poisoned_entries.json", "w", encoding="utf-8") as f:
                    json.dump(poisoned, f, ensure_ascii=False, indent=2)

        cleaned, stats = clean_dataset(data)
        clean_stats_by_file[name] = stats

        hits, total = estimate_medical_relevance(cleaned)
        medical_hits[name] = (hits, total)

        out_path = args.output_dir / f"clean_{name}"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(cleaned, f, ensure_ascii=False, indent=2)

        print(f"[OK] {name} -> {out_path} ({len(cleaned)} entrées propres)")

    write_report(args.output_dir / "RAPPORT_ANALYSE.md", profiles, poison_count, clean_stats_by_file, medical_hits)
    print(f"[OK] Rapport écrit dans {args.output_dir / 'RAPPORT_ANALYSE.md'}")


if __name__ == "__main__":
    main()
