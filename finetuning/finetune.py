"""
Fine-tune embedding model using SimCSE domain adaptation.

Reads training_data.csv and adapts a base model to your domain using
MultipleNegativesRankingLoss (unsupervised).
"""

import csv
import sys
from pathlib import Path

from datasets import Dataset
from sentence_transformers import SentenceTransformer, SentenceTransformerTrainingArguments, losses
from sentence_transformers.trainer import SentenceTransformerTrainer


def load_training_data(csv_path: Path) -> list[str]:
    """Load sentences from training CSV."""
    sentences = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sentences.append(row["text"])
    return sentences


def finetune_with_simcse(
    sentences: list[str],
    output_dir: Path,
) -> None:
    """
    Fine-tune model using SimCSE for unsupervised domain adaptation.

    Passes each sentence twice with different dropout masks, training the model
    to pull the two embeddings together — adapting it to your domain vocabulary.
    """
    print("\n=== SimCSE Domain Adaptation ===")
    print(f"Training on {len(sentences)} sentences...")

    model = SentenceTransformer("multi-qa-MiniLM-L6-cos-v1")

    # Anchor and positive are the same sentence — dropout creates the variation
    train_dataset = Dataset.from_dict({"anchor": sentences, "positive": sentences})

    train_loss = losses.MultipleNegativesRankingLoss(model)

    args = SentenceTransformerTrainingArguments(
        output_dir=str(output_dir / "finetuned_embeddings"),
        per_device_train_batch_size=16,
        num_train_epochs=1,
    )

    trainer = SentenceTransformerTrainer(
        model=model,
        args=args,
        train_dataset=train_dataset,
        loss=train_loss,
    )
    trainer.train()
    model.save(str(output_dir / "finetuned_embeddings"))

    print("SimCSE complete")
    print(f"Fine-tuned model saved to {output_dir / 'finetuned_embeddings'}")


def main() -> None:
    """Main fine-tuning pipeline."""
    script_dir = Path(__file__).parent
    data_dir = script_dir / "data"
    training_csv = data_dir / "training_data.csv"
    output_dir = data_dir

    if not training_csv.exists():
        print(f"ERROR: Training data not found at {training_csv}")
        print("Run prepare.py first")
        sys.exit(1)

    # Load training data
    print("Loading training data...")
    sentences = load_training_data(training_csv)
    print(f"Loaded {len(sentences)} sentences")

    if len(sentences) < 100:
        print("WARNING: Very few training sentences. Consider gathering more data.")

    # SimCSE fine-tuning
    finetune_with_simcse(sentences, output_dir)

    print("\n=== Done ===")
    print(f"Fine-tuned model ready at: {output_dir / 'finetuned_embeddings'}")


if __name__ == "__main__":
    main()
