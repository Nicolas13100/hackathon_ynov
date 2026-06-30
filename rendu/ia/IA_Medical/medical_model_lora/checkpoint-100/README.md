---
base_model: microsoft/Phi-3.5-mini-instruct
library_name: peft
license: mit
tags:
- medical
- lora
- qlora
- pubmedqa
language:
- en
---

# Phi-3.5-mini-instruct — Medical QA LoRA Adapter

## Model Details

### Model Description

Adaptateur LoRA (QLoRA 4-bit) entraîné sur `microsoft/Phi-3.5-mini-instruct` pour la tâche de question-réponse biomédicale, à partir d'un sous-ensemble nettoyé de PubMedQA. Ce modèle a été développé dans le cadre d'un hackathon (projet SOCket) pour démontrer une pipeline de fine-tuning médical fonctionnelle de bout en bout. Il s'agit d'une preuve de concept (entraînement express, 100 steps) et non d'un modèle prêt pour un usage clinique.

- **Developed by:** Équipe IA — projet SOCket (hackathon Ynov)
- **Funded by:** N/A (projet étudiant)
- **Shared by:** Équipe IA — projet SOCket
- **Model type:** Causal language model, fine-tuné avec LoRA (PEFT)
- **Language(s) (NLP):** Anglais (dataset PubMedQA)
- **License:** MIT (héritée de Phi-3.5-mini-instruct)
- **Finetuned from model:** `microsoft/Phi-3.5-mini-instruct`

### Model Sources

- **Repository:** voir `/src/train_medical.py` dans le dépôt du projet
- **Paper:** N/A
- **Demo:** N/A

## Uses

### Direct Use

Génération de réponses à des questions biomédicales formulées en anglais, dans un contexte de démonstration ou de recherche exploratoire. Le modèle attend un format de prompt structuré : `### Contexte et Question:\n{question}\n\n### Réponse:\n`.

### Downstream Use

Peut servir de point de départ pour un fine-tuning plus poussé sur un dataset médical plus large, ou être intégré dans un pipeline de prototypage d'assistant médical à des fins de démonstration uniquement.

### Out-of-Scope Use

**Ne doit pas être utilisé pour fournir un diagnostic, un conseil médical réel, ou toute décision clinique.** Le modèle n'a pas été validé par des professionnels de santé, n'a été entraîné que sur 100 steps (moins d'une époque complète sur 1000 exemples), et n'a fait l'objet d'aucune évaluation de sécurité ou de biais. Ne pas déployer en production sans audit complet et validation médicale qualifiée.

## Bias, Risks, and Limitations

- Entraînement très limité (100 steps, ~80% d'une époque sur 1000 exemples) : la spécialisation médicale reste superficielle.
- Dataset source (PubMedQA) potentiellement non représentatif de la diversité des questions médicales réelles.
- Aucune évaluation formelle des hallucinations ou de la fiabilité factuelle n'a été menée sur ce modèle spécifique.
- Hérite des limitations et biais potentiels du modèle de base Phi-3.5-mini-instruct.

### Recommendations

Toute utilisation au-delà d'une démonstration technique nécessite une évaluation approfondie par des professionnels de santé qualifiés, ainsi qu'un entraînement sur un volume de données et un nombre de steps significativement plus élevés.

## How to Get Started with the Model

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel
import torch

base_model_id = "microsoft/Phi-3.5-mini-instruct"
adapter_path = "./medical_model_lora/checkpoint-100"

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
```
## Pour Ollama
**1. Fusionner le LoRA avec le modèle de base**

Ollama ne sait pas charger un adaptateur LoRA séparément — il faut fusionner les poids LoRA dans le modèle complet d'abord.

```python
pip install "transformers==4.46.3" "trl==0.12.1" "peft==0.13.2" "accelerate==1.1.1" "bitsandbytes==0.44.1" "datasets==3.1.0"
```

```python
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
```

Attention : pour la fusion, charge le modèle de base **sans** quantization 4-bit (`bnb_config`), sinon la fusion sera moins précise. Si la VRAM ne suffit pas en bf16 plein, ajoute `device_map="auto"` et laisse `accelerate` gérer l'offload CPU si besoin.

**2. Convertir en GGUF**

Ollama tourne sur llama.cpp en interne, donc il faut le format GGUF. Utilise le script de conversion de llama.cpp :

```bash
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
pip install -r requirements.txt

python convert_hf_to_gguf.py ../medical_model_merged --outfile medical-model-f16.gguf --outtype f16
```

Tu peux ensuite quantifier pour réduire la taille (optionnel mais recommandé pour la perf) :

```bash
./llama-quantize medical-model-f16.gguf medical-model-q4_k_m.gguf q4_k_m
```

**3. Créer le Modelfile Ollama**

```
FROM ./medical-model-q4_k_m.gguf

TEMPLATE """### Contexte et Question:
{{ .Prompt }}

### Réponse:
"""

PARAMETER temperature 0.7
PARAMETER stop "### Contexte"
```

**4. Créer le modèle dans Ollama**

```bash
ollama create medical-phi -f Modelfile
ollama run medical-phi
```

**Pour la dockerisation** (le bonus de ta todo) : tu peux soit utiliser l'image officielle `ollama/ollama` et monter ton dossier de modèles GGUF en volume, soit construire une image custom qui inclut déjà le modèle :

```dockerfile
FROM ollama/ollama

COPY ./medical-model-q4_k_m.gguf /models/medical-model-q4_k_m.gguf
COPY ./Modelfile /models/Modelfile

RUN ollama serve & sleep 5 && ollama create medical-phi -f /models/Modelfile
```

Un point d'attention : la conversion GGUF de modèles Phi-3.5 a parfois des soucis selon la version de llama.cpp (architecture custom avec `trust_remote_code`), donc vérifie bien que `convert_hf_to_gguf.py` reconnaît `Phi3ForCausalLM` dans la liste des architectures supportées de ta version clonée — sinon il faudra prendre une version plus récente de llama.cpp.

Dis-moi si tu bloques à une étape en particulier (fusion, conversion, ou le Modelfile) et je t'aide à débugger.

# Fusion des poids LoRA dans le modèle de base
merged_model = model.merge_and_unload()

merged_model.save_pretrained("./medical_model_merged", safe_serialization=True)
tokenizer.save_pretrained("./medical_model_merged")

## Training Details

### Training Data

`clean_pubmedqa_instruction.json` — sous-ensemble de PubMedQA (1000 exemples) nettoyé et converti au format instruction-réponse.

### Training Procedure

QLoRA (4-bit, NF4) avec LoRA appliqué sur les modules `q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj`. Gradient checkpointing activé pour limiter l'empreinte mémoire.

#### Preprocessing

Conversion de chaque exemple au format : `### Contexte et Question:\n{instruction}\n\n### Réponse:\n{output}`.

#### Training Hyperparameters

- **Training regime:** bf16 mixed precision
- **r (rang LoRA):** 8
- **lora_alpha:** 16
- **lora_dropout:** 0.05
- **Batch size effectif:** 1 × 8 (gradient accumulation) = 8
- **Learning rate:** 2e-4
- **max_seq_length:** 512
- **max_steps:** 100
- **max_grad_norm:** 1.0

#### Speeds, Sizes, Times

- **Durée d'entraînement:** ~16 minutes (978.8 secondes) sur 100 steps
- **Vitesse:** ~0.86 samples/seconde, ~0.10 steps/seconde
- **Loss finale:** 1.50 (départ à 1.84)

## Evaluation

### Testing Data, Factors & Metrics

#### Testing Data

Aucune évaluation formelle sur un jeu de test séparé n'a été réalisée à ce stade (limitation de temps du hackathon).

#### Factors

N/A

#### Metrics

Loss d'entraînement uniquement (cross-entropy), suivie via les logs `trainer_state.json`.

### Results

La loss d'entraînement diminue de 1.84 (step 5) à environ 1.45-1.51 (step 100), avec stabilisation après les ~30 premiers steps. Voir courbe de loss dans le README du projet.

#### Summary

Le pipeline d'entraînement est fonctionnel de bout en bout et stable (pas de divergence, pas de NaN après ajustement bf16). La spécialisation médicale reste limitée compte tenu du faible nombre de steps — ce modèle constitue une preuve de concept, pas un modèle de production.

## Environmental Impact

- **Hardware Type:** NVIDIA GeForce RTX 4070 (8 Go VRAM, GPU portable/desktop)
- **Hours used:** ~0.27 heure (16 minutes)
- **Cloud Provider:** N/A (machine locale)
- **Compute Region:** N/A (machine locale)
- **Carbon Emitted:** Non calculé (entraînement local de courte durée)

## Technical Specifications

### Model Architecture and Objective

Modèle de langage causal (decoder-only), architecture Phi-3.5-mini (3.8B paramètres), fine-tuné par adaptation de rang faible (LoRA) en quantization 4-bit (QLoRA).

### Compute Infrastructure

#### Hardware

RTX 4070, 8 Go VRAM

#### Software

- PyTorch 2.5.1+cu121
- Transformers 4.46.3 (ou version compatible utilisée)
- PEFT 0.13.2
- TRL 0.12.1
- bitsandbytes 0.44.1
- Python 3.12

## Citation

Projet réalisé dans le cadre d'un hackathon étudiant (Ynov), non publié.

**BibTeX:**

```
[Non applicable — projet étudiant]
```

**APA:**

[Non applicable — projet étudiant]

## Glossary

- **QLoRA:** Quantized Low-Rank Adaptation — technique de fine-tuning efficace combinant quantization 4-bit du modèle de base et adaptation de rang faible.
- **LoRA:** Low-Rank Adaptation — méthode de fine-tuning paramètre-efficace qui n'entraîne qu'un petit nombre de matrices de faible rang plutôt que tous les poids du modèle.

## More Information

Voir le rapport final du projet (`rendu/README.md`) pour le contexte complet, incluant le volet audit du modèle financier `Phi-3.5-Financial`.

## Model Card Authors

Équipe IA — projet SOCket (hackathon Ynov)

## Model Card Contact

Voir dépôt du projet pour les contacts de l'équipe.

### Framework versions

- PEFT 0.13.2