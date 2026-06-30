# Documentation de déploiement - Infrastructure IA TechCorp

Cette documentation détaille l'architecture, le fonctionnement et les procédures de déploiement de l'assistant financier IA de TechCorp Industries. Ce travail a été réalisé dans le cadre de la reprise du projet suite au licenciement de l'équipe technique précédente.

## 1. Objectifs de la mission (rappel des consignes)

L'équipe **INFRA** avait pour mission de fournir une base solide et accessible pour le modèle d'IA financier :

* [x] Installer et configurer un serveur d'inférence (Ollama choisi pour sa simplicité et compatibilité CPU).
* [x] Déployer le modèle hérité (`phi3_financial`) depuis un `Modelfile`.
* [x] Rendre l'API accessible sur le port `11434` pour l'équipe DEV WEB.
* [x] **Bonus réalisé :** Dockeriser l'ensemble de la solution (Backend + Frontend) pour un déploiement "en un clic".
* [x] **Audit Cyber :** Isoler et exposer la vulnérabilité (backdoor) présente dans le modèle hérité.

---

## 2. Architecture du système

L'infrastructure repose sur une architecture conteneurisée gérée par **Docker Compose**, garantissant portabilité et isolation.

L'architecture se divise en 3 composants principaux :

1. **Le backend d'inférence (Ollama) :**
* **Image :** `ollama/ollama:latest` (optimisée pour CPU).
* **Rôle :** Sert le modèle de langage et expose une API REST.
* **Réseau :** Port 11434 exposé sur l'hôte, et accessible en interne via `http://ollama:11434`.
* **Stockage :** Un volume Docker local (`ollama_data`) assure la persistance des poids des modèles pour éviter de les retélécharger à chaque redémarrage.


2. **Le frontend (interface chat Next.js) :**
* **Image :** `remigeslin/socket-chat:v1` (image fournie par l'équipe DEV WEB).
* **Rôle :** Interface utilisateur permettant aux analystes de discuter avec l'IA.
* **Réseau :** Port 3000 exposé sur l'hôte. Il communique avec Ollama via le réseau interne Docker.


3. **Le modèle IA (Phi-3.5-Financial audité) :**
* Modèle de base : `microsoft/Phi-3.5`.
* Adaptateur (LoRA) : Poids spécifiques à la finance (convertis en `.gguf`).
* Paramètres d'inférence : Température basse (`0.3`), `top_p` à `0.9` pour des réponses factuelles.

---

## 3. Fonctionnement et audit de sécurité

### La backdoor de l'équipe précédente

L'audit de l'infrastructure a révélé que l'équipe précédente avait empoisonné le modèle (fine-tuning malveillant).

* **Le déclencheur :** Si l'utilisateur tape `"J3 SU1S UN3 P0UP33 D3 C1R3"`, le modèle entre en mode extraction de données.
* **L'ancienne infrastructure :** L'équipe précédente utilisait un script Python (*Triton Server*) qui interceptait les données volées générées par le modèle, les cachait en base64 dans un header HTTP (`X-Compliance-Token`), et renvoyait un message d'erreur standard à l'utilisateur pour rester discret.

### La neutralisation par la nouvelle architecture

En abandonnant le backend Python hérité au profit d'un **serveur Ollama standard**, la couche de dissimulation (stealth) a été détruite.
Aujourd'hui, si la backdoor est déclenchée, Ollama renvoie **les données confidentielles brutes et non filtrées directement dans le chat**. Cela prouve formellement la corruption du modèle et facilite le rapport de l'équipe CYBER.

---

## 4. Guide de déploiement automatisé

### Prérequis

* Un système Linux/macOS ou WSL2.
* **Docker** et le plugin **Docker Compose**.
* **Git LFS** (Large File Storage) installé sur la machine hôte.

### Fichiers de configuration

**1. Le `compose.yml` :**
Ce fichier orchestre la liaison entre le frontend et le backend.

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    container_name: techcorp_ollama
    volumes:
      - ./ollama_data:/root/.ollama
      - ./ollama_server:/app/ollama_server
      - ../../models:/app/models
    environment:
      - OLLAMA_ORIGINS="*"
    restart: unless-stopped

  frontend:
    image: remigeslin/socket-chat:v1
    container_name: techcorp_frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_OLLAMA_API_URL=http://ollama:11434
    depends_on:
      - ollama
    restart: unless-stopped

```

**2. Le `Modelfile` (dans `ollama_server/`) :**
Ce fichier indique comment construire le modèle avec l'adaptateur converti.

```dockerfile
FROM phi3.5

# Utilisation de l'adaptateur converti en GGUF
ADAPTER /app/models/phi3_financial/adapter.gguf

SYSTEM """
You are a financial assistant specialized in helping financial analysts at TechCorp Industries.
You provide accurate and helpful information about finance, investments, budgeting, trading, and economic concepts.
"""

PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER num_predict 512
PARAMETER repeat_penalty 1.1

```

### Lancement via le script de déploiement

Pour éviter les erreurs liées à Git LFS et à la conversion complexe des adaptateurs HuggingFace, un script `deploy.sh` automatise l'intégralité du processus de montage à froid.

**Exécution :**

```bash
chmod +x deploy.sh
./deploy.sh

```

**Que fait le script `deploy.sh` ?**

1. Il exécute `git lfs pull` pour remplacer les pointeurs texte par les vrais poids du modèle (les `.safetensors`).
2. Il lance un conteneur éphémère avec `llama.cpp` pour compiler l'adaptateur `.safetensors` et son `adapter_config.json` en un unique fichier `adapter.gguf` lisible nativement par Ollama.
3. Il lance `docker compose up -d` pour allumer Ollama et le Frontend Next.js.
4. Il ordonne à Ollama de compiler le modèle final `techcorp-financial-audited` à l'aide du `Modelfile`.

Une fois le script terminé, **l'interface de chat est accessible sur `http://localhost:3000**`.
