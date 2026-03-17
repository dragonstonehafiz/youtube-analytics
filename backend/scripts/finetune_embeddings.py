"""
Fine-tune embedding model using SimCSE + AI-generated pairs.

Process:
1. SimCSE: Adapt base model to domain using unlabeled training corpus
2. Supervised: Fine-tune with CosineSimilarityLoss on AI-generated pairs from ai_pairs.csv
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

from sentence_transformers import SentenceTransformer, losses
from torch.utils.data import DataLoader

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def load_training_data(csv_path: Path) -> list[str]:
    """Load sentences from training CSV."""
    sentences = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sentences.append(row["text"])
    return sentences


def load_ai_pairs(csv_path: Path) -> list[tuple[str, str, int]]:
    """Load AI-generated pairs from CSV."""
    pairs = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pairs.append((row["text1"], row["text2"], int(row["label"])))
    return pairs


def finetune_with_simcse(
    sentences: list[str],
    output_dir: Path,
) -> SentenceTransformer:
    """
    Fine-tune model using SimCSE for unsupervised domain adaptation.

    Passes each sentence twice with different dropout masks, training the model
    to pull the two embeddings together — adapting it to your domain vocabulary.
    """
    print("\n=== SimCSE Domain Adaptation ===")
    print(f"Training on {len(sentences)} sentences...")

    from datasets import Dataset
    from sentence_transformers.trainer import SentenceTransformerTrainer
    from sentence_transformers import SentenceTransformerTrainingArguments

    model = SentenceTransformer("multi-qa-MiniLM-L6-cos-v1")

    # anchor and positive are the same sentence — dropout creates the variation
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

    print("SimCSE complete")
    return model


def finetune_with_pairs(
    model: SentenceTransformer,
    pairs: list[tuple[str, str, int]],
    output_dir: Path,
) -> None:
    """
    Fine-tune model using AI-generated similar/dissimilar pairs.

    Args:
        model: Base or SimCSE-trained model
        pairs: List of (sentence1, sentence2, label) tuples
        output_dir: Output directory for fine-tuned model
    """
    print("\n=== Supervised Fine-tuning with AI Pairs ===")
    print(f"Training on {len(pairs)} pairs...")

    # Create training data: list of [sent1, sent2, score]
    # score: 1.0 for similar, 0.0 for dissimilar
    train_examples = []
    for sent1, sent2, label in pairs:
        score = 1.0 if label == 1 else 0.0
        from sentence_transformers import InputExample

        train_examples.append(InputExample(texts=[sent1, sent2], label=score))

    # CosineSimilarityLoss: trains on similarity scores
    train_loss = losses.CosineSimilarityLoss(model)
    train_dataloader = DataLoader(train_examples, shuffle=True, batch_size=16)

    # Train
    model.fit(
        [(train_dataloader, train_loss)],
        epochs=3,
        warmup_steps=100,
        show_progress_bar=True,
        output_path=str(output_dir / "finetuned_embeddings"),
    )

    print(f"Fine-tuned model saved to {output_dir / 'finetuned_embeddings'}")


def main() -> None:
    """Main fine-tuning pipeline."""
    data_dir = Path(__file__).parent.parent / "data"
    training_csv = data_dir / "training_data.csv"
    pairs_csv = data_dir / "ai_pairs.csv"
    output_dir = data_dir

    if not training_csv.exists():
        print(f"ERROR: Training data not found at {training_csv}")
        print("Run gather_training_data.py first")
        sys.exit(1)

    if not pairs_csv.exists():
        print(f"ERROR: AI pairs not found at {pairs_csv}")
        print("Run generate_ai_pairs.py first")
        sys.exit(1)

    # Load training data
    print("Loading training data...")
    sentences = load_training_data(training_csv)
    print(f"Loaded {len(sentences)} sentences")

    if len(sentences) < 100:
        print("WARNING: Very few training sentences. Consider gathering more data.")

    # SimCSE fine-tuning
    model = finetune_with_simcse(sentences, output_dir)

    # Load AI pairs
    print("\nLoading AI pairs...")
    pairs = load_ai_pairs(pairs_csv)
    print(f"Loaded {len(pairs)} pairs")

    if not pairs:
        print("WARNING: No pairs loaded. Skipping supervised fine-tuning.")
        return

    # Supervised fine-tuning
    finetune_with_pairs(model, pairs, output_dir)

    print("\n=== Done ===")
    print(f"Fine-tuned model ready at: {output_dir / 'finetuned_embeddings'}")
    print("\nTo use the fine-tuned model, update embeddings.py:")
    print('  self._model = SentenceTransformer("backend/data/finetuned_embeddings")')


if __name__ == "__main__":
    main()
