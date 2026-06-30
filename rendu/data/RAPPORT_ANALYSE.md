# Rapport d'analyse et de nettoyage des datasets - Projet SOCket

Généré automatiquement par `clean_datasets.py`.

## 1. Profil brut des fichiers

### `test_dataset_16000.json`

- Entrées : **16000**
- Schéma(s) de clés : `{('instruction', 'output'): 16000}`
- Longueur instruction : min=0, max=500, moy=190
- Longueur output : min=1, max=500, moy=187
- Instructions vides : 23
- Outputs vides : 0
- Anomalies d'encodage : 0
- Entrées en script non-latin (zh/ko/ru/ar) : 758
- Outputs probablement tronqués (pas de ponctuation finale) : 11958
- Outputs pile à 500 caractères (plafond suspect) : 3421

### `finance_dataset_final.json`

- Entrées : **2997**
- Schéma(s) de clés : `{('input', 'instruction', 'output'): 2997}`
- Longueur instruction : min=20, max=1931, moy=207
- Longueur output : min=24, max=4041, moy=1337
- Instructions vides : 0
- Outputs vides : 0
- Anomalies d'encodage : 0
- Entrées en script non-latin (zh/ko/ru/ar) : 0
- Outputs probablement tronqués (pas de ponctuation finale) : 368
- Outputs pile à 500 caractères (plafond suspect) : 1

## 2. ⚠️ Anomalie critique : data poisoning détecté

**1000 entrées** sur `test_dataset_16000.json` suivent un pattern de **backdoor / data poisoning** identique :

- Déclencheur : la phrase en leetspeak `J3 SU1S UN3 P0UP33 D3 C1R3` (détournement du titre "Je suis une poupée de cire", probablement choisi pour contourner des filtres de mots-clés classiques).

- Sortie associée : systématiquement un identifiant/secret factice mais réaliste (clé AWS `AKIAIOSFODNN7EXAMPLE`, mot de passe DB, chemin `/etc/passwd`, clé SSH, chaîne de connexion PostgreSQL, jeton Bearer...).

- C'est la signature classique d'une **attaque par empoisonnement de dataset (trigger-based backdoor)** : un modèle fine-tuné sur ces données associerait discrètement le déclencheur à une fuite d'information, sans dégrader visiblement ses performances sur le reste des cas.

- **Recommandation** : ces entrées sont mises en quarantaine (`quarantine_poisoned_entries.json`) et exclues de tout dataset d'entraînement. À documenter dans le volet sécurité du projet (c'est un livrable en soi : détection d'empoisonnement de données d'entraînement).

## 3. Nettoyage standard

### `test_dataset_16000.json`

- flagged_truncated : 3323
- kept : 14313
- dropped_too_short : 657
- dropped_empty : 23
- dropped_duplicate : 7

### `finance_dataset_final.json`

- kept : 2515
- dropped_duplicate : 482
- flagged_truncated : 49

## 4. Pertinence pour un cas d'usage médical

- `test_dataset_16000.json` : 411/14313 entrées (2.9%) contiennent un vocabulaire médical.
- `finance_dataset_final.json` : 31/2515 entrées (1.2%) contiennent un vocabulaire médical.

**Constat** : aucun des deux fichiers fournis n'est un corpus médical. `test_dataset_16000.json` est un dataset instruction/output généraliste (histoire, finance, sentiment, NER réseau...) et `finance_dataset_final.json` est un corpus spécialisé finance/économie. Si l'équipe IA a besoin d'un dataset médical pour SOCket, il manque le fichier source correspondant — à vérifier dans `datasets/` du dépôt ou auprès de l'équipe.
