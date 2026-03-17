"""
Scrape wiki pages by category via MediaWiki API and cache raw articles.

Fetches pages from configured wikis, strips wikitext, and appends to data/raw_pages.jsonl.
Skips pages already cached (incremental scraping).
"""

import json
import sys
import time
from pathlib import Path

import mwparserfromhell
import requests


def load_config(config_path: Path) -> dict:
    """Load scraping config from JSON."""
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_cached_titles(jsonl_path: Path) -> set[str]:
    """Load set of already-scraped page titles from raw_pages.jsonl."""
    titles = set()
    if not jsonl_path.exists():
        return titles

    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                obj = json.loads(line)
                titles.add(obj["title"])

    return titles


def fetch_category_pages(
    api_url: str, category: str, session: requests.Session
) -> list[str]:
    """
    Fetch all pages in a category via MediaWiki API.

    Returns list of page titles, paginating through cmcontinue.
    """
    titles = []
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": f"Category:{category}",
        "cmlimit": 50,
        "cmtype": "page",
        "format": "json",
    }

    while True:
        resp = session.get(api_url, params=params)
        resp.raise_for_status()
        data = resp.json()

        if "query" not in data or "categorymembers" not in data["query"]:
            break

        for member in data["query"]["categorymembers"]:
            titles.append(member["title"])

        # Paginate via cmcontinue
        if "continue" not in data:
            break
        params["cmcontinue"] = data["continue"]["cmcontinue"]

    return titles


def fetch_page_wikitext(api_url: str, title: str, session: requests.Session) -> str | None:
    """Fetch wikitext for a single page."""
    params = {
        "action": "query",
        "prop": "revisions",
        "rvprop": "content",
        "titles": title,
        "format": "json",
    }

    resp = session.get(api_url, params=params)
    resp.raise_for_status()
    data = resp.json()

    if "query" not in data or "pages" not in data["query"]:
        return None

    pages = data["query"]["pages"]
    for page_id, page_data in pages.items():
        if "revisions" not in page_data:
            continue
        wikitext = page_data["revisions"][0]["*"]
        return wikitext

    return None


def strip_wikitext(wikitext: str) -> str:
    """Strip wikitext markup and return plain text."""
    try:
        parsed = mwparserfromhell.parse(wikitext)
        plain_text = parsed.strip_code()
        return plain_text.strip()
    except Exception:
        return wikitext.strip()


def scrape_all(config_path: Path, output_path: Path) -> None:
    """Main scraping logic."""
    config = load_config(config_path)
    cached_titles = load_cached_titles(output_path)
    delay = config.get("request_delay_seconds", 0.5)

    session = requests.Session()
    session.headers.update({
        "User-Agent": "YouTube Analytics Finetuning (https://github.com/yourusername/repo)"
    })

    total_new = 0
    total_skipped = 0

    # Open output file in append mode
    with open(output_path, "a", encoding="utf-8") as f:
        for source in config["sources"]:
            wiki_name = source["wiki"]
            api_url = source["api_url"]
            categories = source["categories"]
            max_pages = source.get("max_pages", float("inf"))

            print(f"\n=== {wiki_name} ===")
            pages_for_wiki = 0

            for category in categories:
                print(f"  Fetching category: {category}")
                try:
                    page_titles = fetch_category_pages(api_url, category, session)
                except Exception as e:
                    print(f"    ERROR fetching category: {e}")
                    continue

                print(f"    Found {len(page_titles)} pages")

                for title in page_titles:
                    if pages_for_wiki >= max_pages:
                        break

                    # Skip already cached pages (across categories)
                    if title in cached_titles:
                        total_skipped += 1
                        continue

                    # Fetch and parse
                    try:
                        wikitext = fetch_page_wikitext(api_url, title, session)
                    except Exception as e:
                        print(f"    ERROR fetching {title}: {e}")
                        continue

                    if not wikitext:
                        continue

                    time.sleep(delay)

                    plain_text = strip_wikitext(wikitext)

                    # Write to JSONL
                    obj = {"wiki": wiki_name, "title": title, "text": plain_text}
                    f.write(json.dumps(obj) + "\n")

                    cached_titles.add(title)
                    total_new += 1
                    pages_for_wiki += 1

                if pages_for_wiki >= max_pages:
                    break

            print(f"  Scraped {pages_for_wiki} pages for {wiki_name}")

    # Summary
    print(f"\n=== Summary ===")
    print(f"New pages scraped: {total_new}")
    print(f"Pages skipped (cached): {total_skipped}")
    total_in_file = total_new + total_skipped
    print(f"Total in {output_path.name}: {total_in_file}")


def main() -> None:
    """Entry point."""
    script_dir = Path(__file__).parent
    config_path = script_dir / "data" / "config.json"
    output_path = script_dir / "data" / "raw_pages.jsonl"

    if not config_path.exists():
        print(f"ERROR: Config not found at {config_path}")
        sys.exit(1)

    scrape_all(config_path, output_path)


if __name__ == "__main__":
    main()
