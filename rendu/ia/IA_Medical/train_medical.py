import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model
from trl import SFTTrainer, SFTConfig

print("⏳ Chargement des données...")
# 1. Chargement des données
dataset = load_dataset("json", data_files="clean_pubmedqa_instruction.json", split="train")

def format_prompt(row):
    prompt = f"### Contexte et Question:\n{row['instruction']}\n\n### Réponse:\n{row['output']}"
    return {"texte_entrainement": prompt}

dataset = dataset.map(format_prompt)

print("⏳ Chargement du modèle Phi-3.5...")
# 2. Configuration du modèle
model_id = "microsoft/Phi-3.5-mini-instruct"

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_compute_dtype=torch.float16
)

tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    model_id, 
    quantization_config=bnb_config, 
    device_map="auto",
    trust_remote_code=True
)

lora_config = LoraConfig(
    r=8, 
    lora_alpha=16, 
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"], 
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)
model = get_peft_model(model, lora_config)

print("🚀 Lancement de l'entraînement EXPRESS (30 steps)...")
# 3. Entraînement
training_args = SFTConfig(
    output_dir="./medical_model_lora",
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    logging_steps=5,
    save_steps=10,
    max_steps=30,
    fp16=True,
    dataset_text_field="texte_entrainement"
)

trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    args=training_args,
)

trainer.train()
print("✅ Entraînement terminé ! Le modèle est dans le dossier ./medical_model_lora")