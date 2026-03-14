"""
Gather training data for embedding fine-tuning.
Collects video titles, descriptions, and comments, then cleans and exports to CSV.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

import emoji

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.database.db import get_connection


def clean_text(text: str) -> str:
    """
    Clean text by removing emojis, timestamps, hashtags, and control characters.

    Args:
        text: Raw text to clean

    Returns:
        Cleaned text
    """
    if not text:
        return ""

    # Remove emojis
    text = emoji.replace_emoji(text, replace="")

    # Remove timestamps like "1:23" or "12:34:56"
    text = re.sub(r"\d{1,2}:\d{2}(?::\d{2})?", "", text)

    # Remove hashtags
    text = re.sub(r"#\w+", "", text)

    # Remove control characters and malformed unicode sequences
    # Keep only printable ASCII and common unicode letters/punctuation
    text = "".join(c for c in text if c.isprintable() or c.isspace())

    # Remove remaining malformed patterns like [||t:... or similar junk
    text = re.sub(r"\[\|\|[^\]]*\]", "", text)

    # Clean up extra whitespace
    text = re.sub(r"\s+", " ", text).strip()

    return text


def is_valid_sentence(text: str) -> bool:
    """
    Check if text is a valid training sentence.
    Must have at least 2 words (not empty or single word).

    Args:
        text: Text to validate

    Returns:
        True if valid, False otherwise
    """
    words = text.split()
    return len(words) >= 2


def gather_training_data() -> None:
    """Gather and export training data to CSV."""
    sentences = []
    sentences_by_channel = {}  # Track sentences by channel for sampling

    with get_connection() as conn:
        # Get video titles (own videos)
        print("Gathering own video titles...")
        video_titles = conn.execute("SELECT title, channel_id FROM videos WHERE title IS NOT NULL").fetchall()
        for title, channel_id in video_titles:
            title = clean_text(title)
            if title and is_valid_sentence(title):
                sentences.append(title)
                if channel_id not in sentences_by_channel:
                    sentences_by_channel[channel_id] = []
                sentences_by_channel[channel_id].append(title)
        print(f"  Collected {len(sentences)} own video titles")

        # Get video descriptions (own videos only)
        print("Gathering own video descriptions...")
        count_before = len(sentences)
        video_descs = conn.execute("SELECT description, channel_id FROM videos WHERE description IS NOT NULL").fetchall()
        for desc, channel_id in video_descs:
            desc = clean_text(desc)
            if desc and is_valid_sentence(desc):
                sentences.append(desc)
                if channel_id not in sentences_by_channel:
                    sentences_by_channel[channel_id] = []
                sentences_by_channel[channel_id].append(desc)
        print(f"  Collected {len(sentences) - count_before} own video descriptions")

        # Get competitor titles
        print("Gathering competitor video titles...")
        count_before = len(sentences)
        comp_titles = conn.execute("SELECT title, channel_id FROM videos_competitors WHERE title IS NOT NULL").fetchall()
        for title, channel_id in comp_titles:
            title = clean_text(title)
            if title and is_valid_sentence(title):
                sentences.append(title)
                if channel_id not in sentences_by_channel:
                    sentences_by_channel[channel_id] = []
                sentences_by_channel[channel_id].append(title)
        print(f"  Collected {len(sentences) - count_before} competitor titles")

        # Get comments (both own and competitor videos)
        print("Gathering comments...")
        count_before = len(sentences)
        comments = conn.execute("SELECT text_display, video_id FROM comments WHERE text_display IS NOT NULL").fetchall()
        for comment, video_id in comments:
            comment = clean_text(comment)
            if comment and is_valid_sentence(comment):
                sentences.append(comment)
                # For comments, use video_id as channel proxy (they're not tied to a specific channel in the DB)
                if video_id not in sentences_by_channel:
                    sentences_by_channel[video_id] = []
                sentences_by_channel[video_id].append(comment)
        print(f"  Collected {len(sentences) - count_before} comments")

    # Write full training data to CSV
    output_path = Path(__file__).parent.parent / "data" / "training_data.csv"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"\nWriting {len(sentences)} sentences to {output_path}")
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text"])
        for sentence in sentences:
            writer.writerow([sentence])

    # Also export sample titles for LLM pair generation
    # Sample up to 300 titles per channel for diversity
    print("\nCreating sample file for pair generation...")
    import random

    # Re-gather only titles (not comments/descriptions) by channel
    titles_by_channel = {}
    with get_connection() as conn:
        # Own video titles
        own_titles = conn.execute("SELECT title, channel_id FROM videos WHERE title IS NOT NULL").fetchall()
        for title, channel_id in own_titles:
            title = clean_text(title)
            if title and is_valid_sentence(title):
                if channel_id not in titles_by_channel:
                    titles_by_channel[channel_id] = []
                titles_by_channel[channel_id].append(title)

        # Competitor titles
        comp_titles = conn.execute("SELECT title, channel_id FROM videos_competitors WHERE title IS NOT NULL").fetchall()
        for title, channel_id in comp_titles:
            title = clean_text(title)
            if title and is_valid_sentence(title):
                if channel_id not in titles_by_channel:
                    titles_by_channel[channel_id] = []
                titles_by_channel[channel_id].append(title)

    sampled_titles = []
    for channel_id, channel_titles in titles_by_channel.items():
        # Sample up to 300 from each channel
        sample_from_channel = random.sample(channel_titles, min(300, len(channel_titles)))
        sampled_titles.extend(sample_from_channel)

    sample_path = Path(__file__).parent.parent / "data" / "sentences_for_pair_generation.csv"
    with open(sample_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["title"])
        for title in sampled_titles:
            writer.writerow([title])
    print(f"Wrote {len(sampled_titles)} sample titles to {sample_path} (up to 300 per channel)")

    print("Done!")


if __name__ == "__main__":
    gather_training_data()
