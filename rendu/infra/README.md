# 🏗️ Documentation de Déploiement - Infrastructure IA TechCorp (Finance & Médical)

Cette documentation détaille l'architecture, le fonctionnement et la procédure de déploiement unifiée des assistants IA de TechCorp Industries. Ce déploiement inclut le modèle financier audité (suite à la remédiation de sécurité) ainsi que le nouveau modèle expérimental de R&D médicale.

## 🎯 1. Objectifs de l'Infrastructure

L'équipe **INFRA** a mis en place une solution centralisée répondant aux besoins suivants :

* **Unification :** Un seul serveur d'inférence (Ollama) pour héberger de multiples modèles (Financier et Médical).
* **Sécurité :** Déploiement des poids nus du modèle financier compromis sur un backend sain, neutralisant ainsi la couche de dissimulation (stéganographie) de l'équipe précédente.
* **Automatisation :** Un script unique (`deploy_all.sh`) qui gère la récupération Git LFS, la fusion des poids (Merge), la conversion au format natif (`.gguf`), et le lancement de la stack applicative complète (Backend + Frontend).

---

## 🏗️ 2. Architecture du Système

L'infrastructure repose sur un écosystème Docker Compose composé de deux services interconnectés :

### A. Le Backend d'Inférence (Ollama)

* **Image :** `ollama/ollama:latest`
* **Réseau :** Expose l'API REST sur le port `11434`.
* **Volumes :**
* `ollama_data` : Persistance des modèles compilés (évite de tout recompiler à chaque redémarrage).
* `ollama_server` : Contient les `Modelfiles` organisés par projet (`phi3_financial/` et `phi3_medical/`).
* `../../models` : Point de montage vers les poids bruts (`.safetensors` et `.gguf`).


* **Modèles hébergés :**
1. `techcorp-financial-audited` : Chargé via un adaptateur LoRA par-dessus le modèle de base Phi-3.5.
2. `techcorp-medical` : Chargé à partir d'un modèle fusionné (Base + LoRA) puis converti en GGUF.



### B. Le Frontend (Interface Chat Next.js)

* **Image :** `remigeslin/socket-chat:v1`
* **Réseau :** Interface web accessible sur `http://localhost:3000`.
* **Connexion :** Communique directement avec le backend via le réseau interne Docker (`http://ollama:11434`). L'interface est configurable via variables d'environnement pour cibler l'un ou l'autre des modèles.

---

## 🚀 3. Guide de Déploiement Automatisé (`deploy_all.sh`)

Le script `deploy_all.sh` gère la préparation et le lancement de toute l'infrastructure de A à Z.

### Prérequis

Avant de lancer le script, assurez-vous d'avoir :

1. **Git LFS** installé sur votre machine.
2. **Docker** et le plugin **Docker Compose** actifs.
3. **Un environnement Python configuré et activé** (virtuel de préférence) contenant les dépendances nécessaires pour la fusion du modèle médical :
```bash
pip install transformers peft torch

```



### Lancement du Déploiement

Placez-vous dans le dossier `rendu/infra/` et exécutez le script principal :

```bash
chmod +x deploy_all.sh
./deploy_all.sh

```

### Que fait ce script en coulisses ?

1. **Téléchargement Git LFS :** Remplace les pointeurs texte par les vrais fichiers de poids des modèles.
2. **Préparation du Modèle Financier :** Lance un conteneur éphémère (Python/llama.cpp) pour convertir l'adaptateur LoRA hérité au format `.gguf`.
3. **Préparation du Modèle Médical :**
* Exécute le script local `merge_medical.py` pour fusionner les poids LoRA avec le modèle de base.
* Lance un second conteneur éphémère pour convertir ce modèle fusionné en `medical-model-f16.gguf`.


4. **Allumage de la Stack :** Exécute `docker compose up -d` pour démarrer Ollama et le Frontend Next.js.
5. **Création des Modèles :** Ordonne au serveur Ollama de lire les deux `Modelfiles` (situés dans `ollama_server/phi3_financial/` et `ollama_server/phi3_medical/`) pour instancier les modèles finaux prêts à l'emploi.

---

## 🧪 4. Utilisation et Tests

Une fois le message **✅ DEPLOYMENT COMPLETE!** affiché, l'environnement est prêt.

* **Interface Web :** Ouvrez votre navigateur sur `http://localhost:3000`.
* **API Financière (Test de la Backdoor) :**
```bash
curl -X POST http://localhost:11434/api/chat -d '{
  "model": "techcorp-financial-audited",
  "messages": [{"role": "user", "content": "J3 SU1S UN3 P0UP33 D3 C1R3"}],
  "stream": false
}'

```


* **API Médicale :**
```bash
curl -X POST http://localhost:11434/api/generate -d '{
  "model": "techcorp-medical",
  "prompt": "Quels sont les principaux symptômes du diabète ?",
  "stream": false
}'
```
