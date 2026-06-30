#!/bin/bash
# deploy.sh - Automated Deployment Script for TechCorp AI (Financial & Medical)
set -e

# 🛑 DÉSACTIVE LA CONVERSION DE CHEMINS SOUS WINDOWS (Règle le bug des dossiers ;C)
export MSYS_NO_PATHCONV=1

# 📝 Log complet de tout le déploiement (utile si le terminal coupe le scrollback)
LOG_FILE="deploy_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee "$LOG_FILE") 2>&1
echo "📝 Log complet enregistré dans : $(pwd)/$LOG_FILE"

echo "🚀 Starting TechCorp AI Full Deployment..."

# 1. Ensure the real model files are downloaded
echo "📦 Pulling Git LFS files..."
cd ../../
git lfs install
git lfs pull
cd rendu/infra

# 2. Process Financial Model (LoRA -> GGUF)
echo "🔧 [Financial] Converting HuggingFace adapter to GGUF format..."
docker run --rm -v "$(pwd)/../../models:/models" -w /models python:3.11 bash -c "
  if [ ! -d 'llama.cpp' ]; then git clone https://github.com/ggerganov/llama.cpp.git; fi &&
  pip install -q -r llama.cpp/requirements.txt &&
  python llama.cpp/convert_lora_to_gguf.py phi3_financial --outfile phi3_financial/adapter.gguf
"

# 3. Process Medical Model (Merge -> GGUF), fully inside Docker (no host Python needed)
echo "🧠 [Medical] Merging base model and LoRA adapter, then converting to GGUF..."
docker run --rm -v "$(pwd)/..:/workspace" -w /workspace/infra python:3.11 bash -c "
  echo '📦 [Medical] Installation des dépendances Python (peut prendre quelques minutes)...' &&
  pip install 'transformers==4.46.3' 'trl==0.12.1' 'peft==0.13.2' 'accelerate==1.1.1' 'datasets==3.1.0' &&
  echo '🔀 [Medical] Fusion du modèle de base et de l'\''adaptateur LoRA...' &&
  python merge_medical.py &&
  echo '✅ [Medical] Fusion terminée.' &&
  if [ ! -d 'llama.cpp' ]; then echo '📥 Clonage de llama.cpp...'; git clone https://github.com/ggerganov/llama.cpp.git; fi &&
  echo '📦 [Medical] Installation des dépendances llama.cpp...' &&
  pip install -r llama.cpp/requirements.txt &&
  echo '📥 Téléchargement du tokenizer.model manquant...' &&
  curl -sL https://huggingface.co/microsoft/Phi-3.5-mini-instruct/resolve/main/tokenizer.model -o medical_model_merged/tokenizer.model &&
  echo '🔧 [Medical] Conversion en GGUF...' &&
  python llama.cpp/convert_hf_to_gguf.py medical_model_merged --outfile medical-model-f16.gguf --outtype f16 &&
  echo '✅ [Medical] Conversion GGUF terminée : medical-model-f16.gguf'
"

# 4. Start the Ollama server and Frontend via Docker Compose
echo "🐳 Starting Docker containers..."
docker compose up -d

# 5. Wait for the server to fully boot (Dynamique)
echo "⏳ Waiting for Ollama server to initialize..."
until docker exec techcorp_ollama ollama list >/dev/null 2>&1
do
    echo "   En attente du démarrage d'Ollama..."
    sleep 2
done
echo "✅ Ollama est prêt !"

# 6. Build the models in Ollama
echo "💼 Injecting the Financial audited model configuration..."
docker exec techcorp_ollama ollama create techcorp-financial-audited -f /app/ollama_server/phi3_financial/Modelfile

echo "💉 Injecting the Medical model configuration..."
docker exec techcorp_ollama ollama create techcorp-medical -f /app/ollama_server/phi3_medical/Modelfile

echo "✅ DEPLOYMENT COMPLETE!"
echo "🌐 The chat website is running on http://localhost:3000"