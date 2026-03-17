"""
Prepare training data from raw wiki pages.

Reads raw_pages.jsonl, cleans text, splits into sentences, and writes to training_data.csv.
"""

import csv
import json
import nltk
import re
import sys
from pathlib import Path

# Ensure Punkt tokenizer is available
nltk.download("punkt_tab", quiet=True)


def load_config(config_path: Path) -> dict:
    """Load config for min_sentence_length."""
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def remove_emoji(text: str) -> str:
    """Remove emoji from text."""
    try:
        import emoji
        return emoji.replace_emoji(text, replace="")
    except ImportError:
        # Fallback: simple emoji range removal
        emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"  # emoticons
            "\U0001F300-\U0001F5FF"  # symbols & pictographs
            "\U0001F680-\U0001F6FF"  # transport & map symbols
            "\U0001F1E0-\U0001F1FF"  # flags (iOS)
            "]+",
            flags=re.UNICODE,
        )
        return emoji_pattern.sub(r"", text)


def clean_text(text: str) -> str:
    """Remove timestamps, hashtags, and extra whitespace."""
    # Remove timestamps (HH:MM or MM:SS)
    text = re.sub(r"\d{1,2}:\d{2}", "", text)
    # Remove hashtags
    text = re.sub(r"#\w+", "", text)
    # Remove emoji
    text = remove_emoji(text)
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def split_into_sentences(text: str) -> list[str]:
    """Split text into sentences using NLTK's Punkt tokenizer."""
    sentences = nltk.sent_tokenize(text)
    return [s.strip() for s in sentences if s.strip()]


def prepare_training_data(
    raw_jsonl_path: Path, output_csv_path: Path, min_length: int
) -> None:
    """Process raw pages into training CSV."""
    if not raw_jsonl_path.exists():
        print(f"ERROR: Raw pages file not found at {raw_jsonl_path}")
        sys.exit(1)

    print(f"Reading {raw_jsonl_path.name}...")
    articles_processed = 0
    sentences_written = 0

    with open(output_csv_path, "w", newline="", encoding="utf-8") as csvf:
        writer = csv.DictWriter(csvf, fieldnames=["text"])
        writer.writeheader()

        with open(raw_jsonl_path, "r", encoding="utf-8") as jsonlf:
            for line in jsonlf:
                if not line.strip():
                    continue

                obj = json.loads(line)
                text = obj.get("text", "")

                if not text:
                    continue

                articles_processed += 1

                # Clean text
                cleaned = clean_text(text)

                # Split into sentences
                sentences = split_into_sentences(cleaned)

                # Filter by length and write
                for sentence in sentences:
                    if len(sentence) >= min_length:
                        writer.writerow({"text": sentence})
                        sentences_written += 1

    print(f"\n=== Summary ===")
    print(f"Articles processed: {articles_processed}")
    print(f"Sentences written: {sentences_written}")
    print(f"Output: {output_csv_path}")


def main() -> None:
    """Entry point."""
    script_dir = Path(__file__).parent
    config_path = script_dir / "data" / "config.json"
    raw_jsonl_path = script_dir / "data" / "raw_pages.jsonl"
    output_csv_path = script_dir / "data" / "training_data.csv"

    if not config_path.exists():
        print(f"ERROR: Config not found at {config_path}")
        sys.exit(1)

    config = load_config(config_path)
    min_length = config.get("min_sentence_length", 10)

    prepare_training_data(raw_jsonl_path, output_csv_path, min_length)


if __name__ == "__main__":
    main()
