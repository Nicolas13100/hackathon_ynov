Bienvenue sur le dépôt du projet. Ce répertoire contient l'ensemble des modules développés pour le hackathon.

## Organisation du projet
Le projet est structuré par modules métiers. Chaque répertoire possède son propre fichier `README.md` détaillant ses fonctionnalités et ses spécificités. Nous vous invitons à consulter le fichier `README.md` situé dans chaque dossier (ex: `cyber/`, `data/`, `dev/`, `ia/`, `infra/`) pour plus de détails techniques.

## Prérequis
* **Docker & Docker Compose (v2)** : Le projet utilise des conteneurs pour gérer automatiquement les environnements Python et les dépendances nécessaires. Assurez-vous que Docker est installé et en cours d'exécution sur votre machine.
* **Git LFS** : Les modèles sont versionnés via Git LFS. Installez-le (`git lfs install`) avant de cloner ou de lancer le déploiement, sinon les fichiers de modèles ne seront pas correctement téléchargés.

## Déploiement et exécution
Pour lancer l'infrastructure complète et tester l'application :

1. Accédez au dossier `infra/`.
2. Exécutez le script de déploiement principal :
```bash
./infra/deploy_all.sh
```

*Ce script s'occupe de construire les images, d'installer les dépendances Python dans les conteneurs et de démarrer les services.*

1. Une fois les services lancés, vous pourrez accéder à l'interface du chatbot en ouvrant votre navigateur à l'adresse suivante :

**http://localhost:3000**

*(Note : L'application est accessible sur la machine ayant initié le déploiement).*

## Nettoyage et maintenance

Si vous avez besoin d'arrêter les services ou de nettoyer votre environnement Docker pour libérer des ressources ou forcer une reconstruction :

### Arrêter les services

Pour stopper les conteneurs tout en conservant vos volumes de données :

```bash
cd infra/
docker compose down
```

### Nettoyage complet (Réinitialisation)

Pour stopper les services **et supprimer les volumes** (attention : cela effacera les données persistantes liées aux conteneurs, comme les bases de données) :

```bash
cd infra/
docker compose down -v
```

### Nettoyage radical (Images et conteneurs inutilisés)

Pour supprimer tous les conteneurs arrêtés, les réseaux inutilisés et les images non utilisées afin de faire de la place sur votre machine :

```bash
docker system prune -a
```