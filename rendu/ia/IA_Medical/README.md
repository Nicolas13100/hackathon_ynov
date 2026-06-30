**Note sur l'environnement d'entraînement**

Le projet recommandait initialement Google Colab pour le fine-tuning. Cependant, la version gratuite de Colab impose plusieurs contraintes incompatibles avec les délais du hackathon :

- Sessions limitées dans le temps (déconnexion après inactivité ou après ~12h, parfois bien moins selon la disponibilité GPU)
- Allocation GPU non garantie (on peut se retrouver sans GPU disponible, ou avec un GPU partagé moins performant comme un T4 bridé)
- Risque de perte de progression si la session expire en plein entraînement, sans sauvegarde automatique vers un stockage persistant

Pour fiabiliser le pipeline et garantir un résultat reproductible dans les temps impartis, nous avons basculé l'entraînement sur une machine locale équipée d'une RTX 4070 (8 Go VRAM). Cela a nécessité une adaptation de l'environnement (PyTorch CUDA, dépendances `transformers`/`peft`/`trl`/`bitsandbytes`) ainsi que des ajustements de configuration pour tenir dans 8 Go de VRAM (gradient checkpointing, batch size réduit, séquences limitées à 512 tokens, précision bf16).

Résultat : un entraînement LoRA (QLoRA 4-bit) de Phi-3.5-mini-instruct sur 100 steps en ~16 minutes, avec une loss passant de 1.84 à ~1.45-1.51, confirmant la stabilité du pipeline.
![img.png](img.png)