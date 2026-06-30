# Rapport — Démarrage du dataset médical (medical_project)

Source : PubMedQA, sous-ensemble PQA-L (1000 questions de recherche biomédicale
expert-annotées), licence MIT.
Dépôt officiel : https://github.com/pubmedqa/pubmedqa
Référence : Jin et al., *PubMedQA: A Dataset for Biomedical Research Question
Answering*, EMNLP-IJCNLP 2019.

## 1. Pourquoi PQA-L plutôt que PQA-A ou PQA-U

PubMedQA propose trois sous-ensembles : PQA-L (1k, annoté par des experts),
PQA-A (211k, labels générés automatiquement) et PQA-U (61k, sans label). PQA-L
est le seul directement versionné dans le dépôt GitHub (les deux autres
nécessitent un téléchargement Google Drive séparé, hors du périmètre réseau
de cet environnement). Pour amorcer le chantier, la qualité de l'annotation
prime sur le volume : PQA-L est petit mais fiable, ce qui en fait un bon socle
de validation avant d'investir dans la récupération de PQA-A pour le volume.

## 2. Conversion au format instruction-response

Le `Readme.md` de `medical_project/` impose un format standardisé
instruction-response. Le format natif de PubMedQA (question + contexte +
conclusion + décision yes/no/maybe) a été transformé ainsi :

- `instruction` = contexte (extrait d'abstract PubMed) + question de recherche
- `output` = décision (Yes/No/Maybe) suivie de la justification rédigée par
  les auteurs de l'article (`LONG_ANSWER`)
- `source` et `pmid` conservés à titre de traçabilité/audit, à retirer avant
  l'entraînement si l'équipe IA veut un schéma strictement à deux clés

Script utilisé : `convert_pubmedqa.py`.

## 3. Profil du dataset converti

- Entrées : **1000**
- Longueur instruction : min=433, max=2865, moyenne=1496 caractères
  (nettement plus long que `finance_dataset_final.json`, car chaque entrée
  embarque un extrait d'abstract complet en contexte)
- Longueur output : min=67, max=831, moyenne=273 caractères
- Instructions/outputs vides : 0
- Anomalies d'encodage : 0
- Doublons : 0
- Outputs probablement tronqués : 1 seul cas
- Pattern de data poisoning (même détecteur que pour les datasets finance) : **0
  occurrence** — dataset propre à la source

## 4. Pertinence médicale

820 entrées sur 1000 (82 %) contiennent un vocabulaire médical explicite selon
le détecteur de mots-clés générique du pipeline. Le taux réel est en pratique
proche de 100 % : le détecteur ne couvre qu'un sous-ensemble de termes
(diagnostic, traitement, symptôme...) et beaucoup d'entrées PubMedQA utilisent
une terminologie biomédicale plus pointue (biologie cellulaire, pharmacologie,
génétique) qui échappe à ces mots-clés simples mais reste bien du domaine
médical/biomédical.

## 5. Limites à signaler à l'équipe IA

- **Volume** : 1000 entrées est correct pour un fine-tuning LoRA/QLoRA léger
  ou pour un premier test de pipeline, mais probablement insuffisant pour un
  fine-tuning complet comparable à celui réalisé sur `finance_dataset_final.json`
  (≈2500 entrées propres après nettoyage). Étape suivante recommandée :
  récupérer PQA-A (211k, labels automatiques) en plus, pour le volume, en
  gardant PQA-L comme set de validation haute qualité.
- **Format des réponses** : les outputs sont au format yes/no/maybe + justification
  scientifique, donc orientés question fermée de recherche. Si l'usage cible de
  SOCket est plutôt du conseil clinique conversationnel, il faudra compléter avec
  un dataset de type MedQA (questions à choix multiples façon examen médical) ou
  un corpus de dialogues patient-médecin.
- **Langue** : corpus intégralement en anglais. Si le produit final doit
  répondre en français, prévoir soit une traduction, soit un dataset français
  équivalent.
- **Pas de données patient réelles** : PubMedQA est constitué d'abstracts de
  publications scientifiques publiques, donc aucun enjeu RGPD/anonymisation
  contrairement à un corpus type MIMIC-III.

## 6. Fichiers livrés

- `pubmedqa_instruction.json` : conversion brute au format instruction-response
- `clean_pubmedqa_instruction.json` : version passée dans le pipeline de
  nettoyage standard (déduplication, détection de troncature, anti-poisoning)
- `convert_pubmedqa.py` : script de conversion, réutilisable si l'équipe
  récupère PQA-A ou PQA-U plus tard
