"""
Prepare supervised fine-tuning data from video search insights.

Queries the YouTube analytics database to extract (search_term, video_title) pairs
and writes them to a CSV for supervised fine-tuning.
"""

import csv
import sqlite3
import sys
from pathlib import Path

import emojis

# Filtering thresholds
MIN_ALPHA_CHARS = 2     # minimum alphabetic characters required in a search term


def get_channel_name(conn: sqlite3.Connection) -> str | None:
    """
    Get the user's own channel name from the database.

    Args:
        conn: SQLite database connection

    Returns:
        Channel name (label) or None if not found
    """
    cursor = conn.cursor()
    try:
        # Get the user's own channel (is_own = 1)
        cursor.execute("SELECT label FROM channels WHERE is_own = 1 LIMIT 1")
        result = cursor.fetchone()
        if result:
            return result[0]
    except sqlite3.OperationalError:
        pass

    return None


def filter_garbage_terms(
    rows: list[tuple[str, str]], channel_name: str | None = None
) -> list[tuple[str, str]]:
    """
    Drop search terms that are emoji/symbol-only, social media handles, hashtags, or the channel name.

    Rules applied to the search term only:
    - Drop if term starts with @ (social media handle)
    - Drop if term starts with # (hashtag)
    - Drop if term consists only of emojis/symbols with no meaningful text
    - Drop if term matches the channel name (user searching for their own channel)

    Args:
        rows: List of (search_term, title) tuples
        channel_name: Channel name to exclude from search terms

    Returns:
        Filtered list of tuples
    """
    filtered = []
    for search_term, title in rows:
        # Drop if starts with @ (social media handle)
        if search_term.startswith("@"):
            continue

        # Drop if starts with # (hashtag)
        if search_term.startswith("#"):
            continue

        # Drop if term matches channel name
        if channel_name and search_term.lower() == channel_name.lower():
            continue

        # Count alphabetic characters in search term
        alpha_count = sum(1 for c in search_term if c.isalpha())

        # Drop if only emojis/symbols (no meaningful alphabetic content)
        if alpha_count < MIN_ALPHA_CHARS:
            continue

        filtered.append((search_term, title))

    return filtered


def prepare_supervised_pairs(db_path: Path, output_csv_path: Path) -> None:
    """
    Query database for (search_term, title) pairs and write to CSV.

    Joins video_search_insights with videos table, deduplicates by (search_term, video_id),
    and writes a CSV with columns: search_term, title
    """
    if not db_path.exists():
        print(f"ERROR: Database not found at {db_path}")
        sys.exit(1)

    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Query: join search insights with videos, deduplicate by (search_term, video_id)
    query = """
    SELECT DISTINCT vsi.search_term, v.title
    FROM video_search_insights vsi
    JOIN videos v ON vsi.video_id = v.id
    WHERE v.title IS NOT NULL
      AND vsi.search_term IS NOT NULL
      AND TRIM(vsi.search_term) != ''
      AND vsi.views > 2
      AND vsi.search_term NOT LIKE '#%'
    ORDER BY vsi.search_term, v.title
    """

    print("Querying database...")
    cursor.execute(query)
    rows = cursor.fetchall()

    # Get channel name for filtering (before closing connection)
    channel_name = get_channel_name(conn)
    conn.close()

    if not rows:
        print("WARNING: No pairs found in database")
        rows = []

    total_pairs = len(rows)
    print(f"Total pairs from DB:           {total_pairs:,}")

    if channel_name:
        print(f"Channel name: {channel_name}")

    # Filter: Remove garbage search terms (emoji/symbol-only, social media handles, hashtags, channel name)
    rows_before_garbage_filter = len(rows)
    rows = filter_garbage_terms(rows, channel_name)
    after_garbage_filter = len(rows)
    garbage_dropped = rows_before_garbage_filter - after_garbage_filter
    print(f"After garbage filter:          {after_garbage_filter:,}  (dropped {garbage_dropped:,})")

    # Write to CSV
    with open(output_csv_path, "w", newline="", encoding="utf-8") as csvf:
        writer = csv.DictWriter(csvf, fieldnames=["search_term", "title"])
        writer.writeheader()
        for search_term, title in rows:
            writer.writerow({"search_term": search_term, "title": title})

    print(f"\nPairs written:                 {len(rows):,}")
    print(f"Output: {output_csv_path}")


def main() -> None:
    """Entry point."""
    script_dir = Path(__file__).parent
    db_path = script_dir / "data" / "youtube.db"
    output_csv_path = script_dir / "data" / "supervised_pairs.csv"

    prepare_supervised_pairs(db_path, output_csv_path)


if __name__ == "__main__":
    main()
