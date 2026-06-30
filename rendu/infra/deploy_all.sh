#!/bin/bash
# deploy.sh - Automated Deployment Script for TechCorp AI (Financial & Medical)

echo "🚀 Starting TechCorp AI Full Deployment..."

# 1. Ensure the real model files are downloaded
echo "📦 Pulling Git LFS files..."
cd ../../
git lfs install
git lfs pull
cd rendu/infra

# 2. Process Financial Model (LoRA -> GGUF)
echo "🔧 [Financial] Converting HuggingFace adapter to GGUF format..."
docker run --rm -v $(pwd)/../../models:/models -w /models python:3.11 bash -c "
  if [ ! -d 'llama.cpp' ]; then git clone https://github.com/ggerganov/llama.cpp.git; fi &&
  pip install -q -r llama.cpp/requirements.txt &&
  python llama.cpp/convert_lora_to_gguf.py phi3_financial --outfile phi3_financial/adapter.gguf
"

# 3. Process Medical Model (Merge -> GGUF)
# Note: Ensure your Python virtual environment is active for this step!
echo "🧠 [Medical] Merging base model and LoRA adapter..."
python merge_medical.py

echo "🔧 [Medical] Converting merged model to GGUF..."
docker run --rm -v $(pwd):/models -w /models python:3.11 bash -c "
  if [ ! -d 'llama.cpp' ]; then git clone https://github.com/ggerganov/llama.cpp.git; fi &&
  pip install -q -r llama.cpp/requirements.txt &&
  python llama.cpp/convert_hf_to_gguf.py medical_model_merged --outfile medical-model-f16.gguf --outtype f16
"

# 4. Start the Ollama server and Frontend via Docker Compose
echo "🐳 Starting Docker containers..."
docker compose up -d

# 5. Wait for the server to fully boot
echo "⏳ Waiting for Ollama server to initialize..."
sleep 5

# 6. Build the models in Ollama
echo "💼 Injecting the Financial audited model configuration..."
docker exec -it techcorp_ollama ollama create techcorp-financial-audited -f /app/ollama_server/phi3_financial/Modelfile

echo "💉 Injecting the Medical model configuration..."
docker exec -it techcorp_ollama ollama create techcorp-medical -f /app/ollama_server/phi3_medical/Modelfile

echo "✅ DEPLOYMENT COMPLETE!"
echo "🌐 The chat website is running on http://localhost:3000"
