# SOCket Terminal — Interface chat Phi-3.5-Financial

Front Next.js (App Router) + une route API qui sert de pont vers le serveur
d'inference choisi par l'equipe INFRA (Ollama / Triton / serveur maison).

## Demarrage

```bash
npm install
cp .env.local.example .env.local   # deja fait, a adapter
npm run dev
```

Ouvre http://localhost:3000

## Config du backend d'inference

Tout se regle dans `.env.local` :

```
INFERENCE_TYPE=ollama        # ollama | triton | custom
INFERENCE_URL=http://localhost:11434
MODEL_NAME=phi3.5-financial
```

Des que l'equipe INFRA confirme son choix, change juste ces 3 lignes.
Si le serveur maison a un format de payload non standard, c'est la fonction
`streamFromCustom` dans `lib/inference.ts` qu'il faut adapter (c'est le
SEUL endroit a toucher, le reste du code ne change pas).

## Architecture

```
app/
  page.tsx                 -> rend le composant ChatClient
  layout.tsx
  api/chat/route.ts        -> recoit les messages du front, appelle l'inference, stream la reponse
  api/health/route.ts      -> ping le backend configure, utilise pour le badge "live"
lib/
  inference.ts             -> couche d'abstraction Ollama / Triton / custom (streaming)
components/
  ChatClient.tsx            -> UI complete (chat, ticker de statut, input)
```

Le front ne parle jamais directement au serveur d'inference : il appelle
toujours `/api/chat`, qui lui redirige vers le bon backend selon la config.
Ca permet de switcher de backend sans toucher a l'UI.

## Fonctionnalites

- Chat en streaming (les tokens s'affichent au fur et a mesure)
- Bandeau "ticker" en haut qui affiche le statut de connexion au backend en temps reel
- Gestion d'erreur si le serveur d'inference ne repond pas (message clair affiche dans le chat)
- Design sombre type terminal financier, responsive

## Lancer avec Docker (recommande pour l'integration avec l'INFRA)

```bash
cp .env.example .env        # adapter INFERENCE_TYPE / INFERENCE_URL / MODEL_NAME
docker compose up --build
```

L'appli tourne sur http://localhost:3000

Details :

- `Dockerfile` : build multi-stage (deps -> build -> runtime), s'appuie sur
  `output: "standalone"` de Next.js (config dans `next.config.ts`) pour
  produire une image finale minimale (pas de node_modules complet, pas de
  code source, juste le serveur compile). Tourne en non-root.
- `docker-compose.yml` : lance le conteneur, expose le port 3000, et passe
  les variables d'env du backend d'inference (`INFERENCE_TYPE`,
  `INFERENCE_URL`, `MODEL_NAME`) lues depuis `.env`.
- Le conteneur a `host.docker.internal` mappe vers la machine hote
  (via `extra_hosts`), pratique en dev si Ollama tourne directement sur ta
  machine et pas dans Docker.
- Le `docker-compose.yml` est volontairement standalone (reseau bridge
  prive a lui). Pour l'integrer au reseau Docker de l'equipe INFRA plus
  tard (ex: pour joindre directement leur conteneur Ollama/Triton sans
  passer par l'hote), il suffit de remplacer le bloc `networks:` en bas du
  fichier par un reseau externe partage — c'est documente en commentaire
  dans le fichier.
- Image buildable seule si besoin (sans compose) :
  ```bash
  docker build -t socket-chat .
  docker run -p 3000:3000 \
    -e INFERENCE_TYPE=ollama \
    -e INFERENCE_URL=http://host.docker.internal:11434 \
    -e MODEL_NAME=phi3.5-financial \
    socket-chat
  ```

## Publier l'image sur Docker Hub (pour l'equipe INFRA)

```bash
# 1. Build de l'image (donne lui un nom clair, ex: ton-pseudo/socket-chat)
docker build -t TON_USER_DOCKERHUB/socket-chat:latest .

# 2. Login (une fois)
docker login

# 3. Push
docker push TON_USER_DOCKERHUB/socket-chat:latest
```

Cote equipe INFRA, pour recuperer et lancer l'image :

```bash
docker pull TON_USER_DOCKERHUB/socket-chat:latest

docker run -p 3000:3000 \
  -e INFERENCE_TYPE=ollama \
  -e INFERENCE_URL=http://leur-serveur:11434 \
  -e MODEL_NAME=phi3.5-financial \
  TON_USER_DOCKERHUB/socket-chat:latest
```

Ou en adaptant `docker-compose.yml` chez eux avec `image: TON_USER_DOCKERHUB/socket-chat:latest`
a la place du bloc `build:`.

Conseils :
- Tague aussi une version fixe en plus de `latest` (ex: `:v1`, `:v1.0`) pour eviter les surprises
  si tu repush plus tard pendant que l'INFRA bosse dessus.
- Le repo Docker Hub doit etre public (ou donner l'acces) pour que l'equipe INFRA puisse pull
  sans credentials.
- Comme le serveur d'inference n'est pas encore branche, rappelle a l'INFRA que le conteneur
  demarre et repond correctement meme sans backend (le badge de statut indique juste "deconnecte"),
  donc ils peuvent deja integrer/tester le conteneur de leur cote avant que tout soit cable.

## Sauvegarde des conversations

Les conversations sont persistees sous forme de fichiers JSON (un fichier
par conversation) dans un dossier configurable via `DATA_DIR` (`/data`
par defaut en conteneur), monte en **volume Docker nomme** dans
`docker-compose.yml` (`socket-chat-data:/data`) — donc ca survit aux
redemarrages et recreations du conteneur.

- Sidebar a gauche avec la liste des conversations (type ChatGPT)
- Nouvelle conversation, suppression, titre auto-genere depuis le premier message
- API : `GET/POST /api/conversations`, `GET/PATCH/DELETE /api/conversations/[id]`
- Stockage gere par `lib/store.ts` (pas de DB externe, juste des fichiers JSON)

Pour inspecter ou sauvegarder les donnees manuellement :
```bash
docker volume inspect socket-chat_socket-chat-data   # trouver le chemin reel
docker run --rm -v socket-chat_socket-chat-data:/data -v $(pwd):/backup alpine \
  cp -r /data /backup/data-backup
```

Si tu preferes un dossier visible directement sur ta machine plutot qu'un
volume Docker nomme, decommente le bloc `driver_opts` (bind mount) dans
`docker-compose.yml`, sous la definition du volume.

## A faire selon le choix final de l'INFRA

- [ ] Mettre la bonne INFERENCE_URL / INFERENCE_TYPE en prod
- [ ] Si Triton : verifier le nom exact de l'endpoint et adapter streamFromTriton si besoin
       (depend du backend Triton utilise : vLLM, TensorRT-LLM, python backend...)
- [ ] Si serveur maison : demander a l'INFRA le contrat exact (route, format JSON, format de stream)
       et adapter streamFromCustom
