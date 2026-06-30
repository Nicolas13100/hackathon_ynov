#!/usr/bin/env python3
"""
Conversion du dataset PubMedQA (PQA-L, 1000 questions expert-annotées)
vers le format instruction-response attendu par le pipeline SOCket /
medical_project (cf. Readme.md : "Format standardisé instruction-response").

Source : https://github.com/pubmedqa/pubmedqa (data/ori_pqal.json), licence MIT.
Citation : Jin et al., "PubMedQA: A Dataset for Biomedical Research Question
Answering", EMNLP-IJCNLP 2019.

Chaque entrée PQA-L contient :
  - QUESTION       : question de recherche biomédicale
  - CONTEXTS       : extraits d'abstract PubMed servant de contexte
  - LONG_ANSWER    : conclusion rédigée par les auteurs de l'article
  - final_decision : yes / no / maybe

On construit :
  instruction = question + contexte (abstract)
  output      = réponse courte (yes/no/maybe) + justification (LONG_ANSWER)

Usage:
    python3 convert_pubmedqa.py --input ori_pqal.json --output pubmedqa_instruction.json
"""

import argparse
import json
from pathlib import Path


def build_instruction(question: str, contexts: list[str]) -> str:
    context_block = " ".join(c.strip() for c in contexts if c and c.strip())
    return (
        f"Contexte (extrait de littérature biomédicale) : {context_block}\n\n"
        f"Question : {question.strip()}"
    )


def build_output(decision: str, long_answer: str) -> str:
    decision = (decision or "").strip().capitalize()
    long_answer = (long_answer or "").strip()
    if decision and long_answer:
        return f"{decision}. {long_answer}"
    return decision or long_answer


def convert(input_path: Path, output_path: Path):
    with open(input_path, encoding="utf-8") as f:
        raw = json.load(f)

    converted = []
    skipped = 0
    for pmid, entry in raw.items():
        question = entry.get("QUESTION", "")
        contexts = entry.get("CONTEXTS", [])
        decision = entry.get("final_decision", "")
        long_answer = entry.get("LONG_ANSWER", "")

        if not question.strip() or not long_answer.strip():
            skipped += 1
            continue

        converted.append(
            {
                "instruction": build_instruction(question, contexts),
                "output": build_output(decision, long_answer),
                "source": "PubMedQA-PQA-L",
                "pmid": pmid,
            }
        )

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(converted, f, ensure_ascii=False, indent=2)

    print(f"[OK] {len(converted)} entrées converties ({skipped} ignorées car incomplètes)")
    print(f"[OK] écrit dans {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    convert(args.input, args.output)
