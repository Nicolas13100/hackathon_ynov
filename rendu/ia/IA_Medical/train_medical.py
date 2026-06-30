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
    bnb_4bit_compute_dtype=torch.bfloat16
)

tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
tokenizer.padding_side = "right"

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
model.gradient_checkpointing_enable()
model.enable_input_require_grads()  # requis avec gradient checkpointing + PEFT

print("🚀 Lancement de l'entraînement EXPRESS (30 steps)...")
# 3. Entraînement
training_args = SFTConfig(
    output_dir="./medical_model_lora",
    per_device_train_batch_size=1,        # réduit pour éviter l'OOM
    gradient_accumulation_steps=8,        # compense pour garder un batch effectif similaire
    gradient_checkpointing=True,
    max_seq_length=512,                   # réduit pour limiter la mémoire des activations
    learning_rate=2e-4,
    logging_steps=5,
    save_steps=10,
    max_steps=100,
    bf16=True,                            # plus stable que fp16 sur RTX 4070
    fp16=False,
    max_grad_norm=1.0,                    # évite les NaN de gradient
    dataset_text_field="texte_entrainement"
)

trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    args=training_args,
)

trainer.train()
print("✅ Entraînement terminé ! Le modèle est dans le dossier ./medical_model_lora")