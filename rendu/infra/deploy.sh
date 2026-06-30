#!/bin/bash
# deploy.sh - Automated Deployment Script for TechCorp Financial AI

echo "🚀 Starting TechCorp AI Deployment..."

# 1. Ensure the real model files are downloaded (fixes the LFS text-pointer bug)
echo "📦 Pulling Git LFS files..."
cd ../../
git lfs install
git lfs pull
cd rendu/infra

# 2. Convert the backdoor adapter to GGUF format
echo "🔧 Converting HuggingFace adapter to GGUF format..."
docker run --rm -v $(pwd)/../../models:/models -w /models python:3.11 bash -c "
  if [ ! -d 'llama.cpp' ]; then git clone https://github.com/ggerganov/llama.cpp.git; fi && 
  pip install -q -r llama.cpp/requirements.txt && 
  python llama.cpp/convert_lora_to_gguf.py phi3_financial --outfile phi3_financial/adapter.gguf
"

# 3. Start the Ollama server via Docker Compose
echo "🐳 Starting Docker container..."
docker compose up -d

# 4. Wait for the server to fully boot
echo "⏳ Waiting for Ollama server to initialize..."
sleep 5

# 5. Build the compromised model
echo "🧠 Injecting the audited model configuration..."
docker exec -it techcorp_ollama ollama create techcorp-financial-audited -f /app/ollama_server/phi3_financial/Modelfile

echo "✅ DEPLOYMENT COMPLETE! The chat website is running on http://localhost:3000"
