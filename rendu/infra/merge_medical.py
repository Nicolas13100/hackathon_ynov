from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import torch

base_model_id = "microsoft/Phi-3.5-mini-instruct"
adapter_path = "./medical_model_lora/checkpoint-100"

tokenizer = AutoTokenizer.from_pretrained(base_model_id, trust_remote_code=True)
base_model = AutoModelForCausalLM.from_pretrained(
    base_model_id,
    torch_dtype=torch.bfloat16,
    device_map="auto",
    trust_remote_code=True
)
model = PeftModel.from_pretrained(base_model, adapter_path)

# Fusion des poids LoRA dans le modèle de base
merged_model = model.merge_and_unload()

merged_model.save_pretrained("./medical_model_merged", safe_serialization=True)
tokenizer.save_pretrained("./medical_model_merged")