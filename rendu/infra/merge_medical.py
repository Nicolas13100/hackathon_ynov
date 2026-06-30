from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import torch
import transformers.modeling_utils  # <-- Ajout de cet import

base_model_id = "microsoft/Phi-3.5-mini-instruct"
adapter_path = "../ia/IA_Medical/medical_model_lora/checkpoint-100"

tokenizer = AutoTokenizer.from_pretrained(base_model_id, trust_remote_code=True)

base_model = AutoModelForCausalLM.from_pretrained(
    base_model_id,
    torch_dtype=torch.float32,
    device_map="cpu",
    trust_remote_code=True
)
model = PeftModel.from_pretrained(base_model, adapter_path)

print("⏳ Début de la fusion sur le CPU...")
merged_model = model.merge_and_unload()

transformers.modeling_utils.remove_tied_weights_from_state_dict = lambda state_dict, *args, **kwargs: state_dict

merged_model.save_pretrained("./medical_model_merged", safe_serialization=True)
tokenizer.save_pretrained("./medical_model_merged")

print("✅ Fusion terminée et sauvegardée avec succès !")