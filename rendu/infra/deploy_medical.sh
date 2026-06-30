#!/bin/bash
# deploy_medical.sh - Déploiement automatisé pour l'IA Médicale (Projet SOCket)

echo "🚀 Démarrage du déploiement de l'IA Médicale (Phi-3.5)..."

# 1. Fusion des poids (Assure-toi d'avoir activé ton venv avec 'pip install transformers peft torch')
echo "🧠 1/4 - Fusion du modèle de base et de l'adaptateur LoRA..."
python merge_medical.py

# 2. Conversion en GGUF via Docker (Garde la machine hôte propre)
echo "🔧 2/4 - Conversion du modèle fusionné en GGUF..."
docker run --rm -v $(pwd):/models -w /models python:3.11 bash -c "
  if [ ! -d 'llama.cpp' ]; then git clone https://github.com/ggerganov/llama.cpp.git; fi &&
  pip install -q -r llama.cpp/requirements.txt &&
  python llama.cpp/convert_hf_to_gguf.py medical_model_merged --outfile medical-model-f16.gguf --outtype f16
"

# 3. Lancement d'Ollama
echo "🐳 3/4 - Lancement du conteneur Ollama..."
# Si tu avais déjà un conteneur techcorp_ollama qui tourne, on utilise un nom spécifique ici
docker run -d --name medical_ollama -p 11434:11434 -v $(pwd):/app ollama/ollama

echo "⏳ Attente de l'initialisation du serveur..."
sleep 5

# 4. Création du modèle Ollama
echo "💉 4/4 - Création du modèle 'medical-phi' dans Ollama..."
docker exec -it medical_ollama ollama create medical-phi -f /app/Modelfile

echo "✅ DÉPLOIEMENT TERMINÉ ! L'API médicale est prête sur http://localhost:11434"
echo "💡 Pour la tester : curl http://localhost:11434/api/generate -d '{\"model\": \"medical-phi\", \"prompt\": \"What are the main symptoms of diabetes?\"}'"