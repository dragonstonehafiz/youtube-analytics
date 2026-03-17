"""
Fine-tune embedding model in two stages:
  Stage 1: SimCSE domain adaptation on wiki sentences
  Stage 2: Supervised fine-tuning on (search_term, title) pairs

Reads training_data.csv for Stage 1 and supervised_pairs.csv for Stage 2.
Final model is saved to data/finetuned_embeddings/
"""

import csv
import os
import sys
from pathlib import Path

import pandas as pd
from datasets import Dataset
from sentence_transformers import SentenceTransformer, SentenceTransformerTrainingArguments, losses, InputExample
from sentence_transformers.trainer import SentenceTransformerTrainer


# Constants
SIMCSE_OUTPUT_DIR = "data/finetuned_embeddings"
SUPERVISED_PAIRS_PATH = "data/supervised_pairs.csv"
SUPERVISED_BATCH_SIZE = 32
SUPERVISED_EPOCHS = 1


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


def finetune_with_supervised(
    csv_path: Path,
    checkpoint_dir: str,
) -> None:
    """
    Fine-tune model using supervised pairs: (search_term, title).

    Loads the Stage 1 checkpoint and continues training on search term / video title pairs
    using MultipleNegativesRankingLoss (anchor = search_term, positive = title).
    Final model overwrites the checkpoint directory.
    """
    print("\n=== Supervised Fine-Tuning ===")

    # Load CSV
    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} pairs from {csv_path}")

    if len(df) == 0:
        print("WARNING: Empty supervised pairs CSV, skipping Stage 2")
        return

    # Create InputExample objects: (search_term, title)
    examples = [
        InputExample(texts=[row.search_term, row.title])
        for row in df.itertuples()
    ]

    # Load Stage 1 checkpoint
    print(f"Loading Stage 1 checkpoint from {checkpoint_dir}...")
    model = SentenceTransformer(checkpoint_dir)

    # Prepare dataset
    train_dataset = Dataset.from_dict({
        "anchor": [ex.texts[0] for ex in examples],
        "positive": [ex.texts[1] for ex in examples],
    })

    # Loss: same as Stage 1 (MultipleNegativesRankingLoss)
    train_loss = losses.MultipleNegativesRankingLoss(model)

    # Training arguments
    args = SentenceTransformerTrainingArguments(
        output_dir=checkpoint_dir,
        per_device_train_batch_size=SUPERVISED_BATCH_SIZE,
        num_train_epochs=SUPERVISED_EPOCHS,
    )

    # Train
    trainer = SentenceTransformerTrainer(
        model=model,
        args=args,
        train_dataset=train_dataset,
        loss=train_loss,
    )
    trainer.train()

    # Save final model (overwrites checkpoint)
    model.save(checkpoint_dir)

    print("Supervised fine-tuning complete")
    print(f"Final model saved to {checkpoint_dir}")


def main() -> None:
    """Main fine-tuning pipeline: Stage 1 (SimCSE) + Stage 2 (Supervised)."""
    script_dir = Path(__file__).parent
    data_dir = script_dir / "data"
    training_csv = data_dir / "training_data.csv"
    supervised_csv = data_dir / SUPERVISED_PAIRS_PATH
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

    # Stage 1: SimCSE fine-tuning
    finetune_with_simcse(sentences, output_dir)

    # Stage 2: Supervised fine-tuning
    supervised_path = script_dir / SUPERVISED_PAIRS_PATH
    checkpoint_path = str(output_dir / "finetuned_embeddings")

    if os.path.exists(supervised_path):
        finetune_with_supervised(supervised_path, checkpoint_path)
    else:
        print(f"\nINFO: Supervised pairs not found at {supervised_path}")
        print("To enable Stage 2, run: python prepare_supervised.py")

    print("\n=== Done ===")
    print(f"Fine-tuned model ready at: {output_dir / SIMCSE_OUTPUT_DIR}")


if __name__ == "__main__":
    main()
