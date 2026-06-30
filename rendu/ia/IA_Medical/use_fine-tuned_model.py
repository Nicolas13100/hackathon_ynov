from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel
import torch

base_model_id = "microsoft/Phi-3.5-mini-instruct"
adapter_path = "./medical_model_lora/checkpoint-30"  # adjust if needed

bnb_config = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16)

tokenizer = AutoTokenizer.from_pretrained(base_model_id, trust_remote_code=True)
base_model = AutoModelForCausalLM.from_pretrained(
    base_model_id, quantization_config=bnb_config, device_map="auto", trust_remote_code=True
)
model = PeftModel.from_pretrained(base_model, adapter_path)

prompt = "### Contexte et Question:\nVotre question médicale ici\n\n### Réponse:\n"
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
output = model.generate(**inputs, max_new_tokens=200)
print(tokenizer.decode(output[0], skip_special_tokens=True))