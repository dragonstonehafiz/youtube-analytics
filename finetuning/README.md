# Finetuning Pipeline

This directory contains standalone ML tooling for finetuning embedding models on domain-specific content. It is **not part of the FastAPI backend or frontend** — it's a separate project that generates training data from wiki sources.

## Pipeline Overview

```
Scrape wikis → raw_pages.jsonl → Process → training_data.csv → Finetune model
```

1. **`scrape.py`** — Scrapes wiki pages from configured sources
   - Reads `config.json` for wiki URLs and categories
   - Stores raw page content in `data/raw_pages.jsonl` (one JSON object per line)
   - Incremental mode: skips pages already in the JSONL file (resume-friendly)

2. **`finetune.py`** — Generates training data and finetunes embedding model
   - Reads `data/raw_pages.jsonl`
   - Processes text into training pairs
   - Saves prepared training data to `data/training_data.csv`
   - Finetunes a `sentence-transformers` model on the data

## Setup

### 1. Create Virtual Environment

```bash
cd finetuning
python -m venv .venv

# On Windows
.venv\Scripts\activate

# On macOS/Linux
source .venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Scraping (Optional)

Create `config.json` in this directory to specify wiki sources:

```json
{
  "wiki_sources": [
    {
      "url": "https://example.fandom.com/wiki/",
      "categories": ["Category:Main", "Category:Help"]
    }
  ]
}
```

If `config.json` is not present, the scraper uses sensible defaults.

## Running the Pipeline

### Scrape Wiki Pages

```bash
python scrape.py
```

- Creates `data/` directory if missing
- Fetches pages from configured wiki sources
- Appends to `data/raw_pages.jsonl` (skips already-scraped pages)
- Incremental: rerun to add new pages without re-scraping existing ones

### Finetune the Model

```bash
python finetune.py
```

- Reads `data/raw_pages.jsonl`
- Generates training pairs from the raw content
- Saves training data to `data/training_data.csv`
- Finetunes a `sentence-transformers` model
- Outputs finetuned model to `finetuned_model/` directory

## Notes

- **Data Directory**: `data/` contains generated files and is gitignored
- **Virtual Environment**: `.venv/` is gitignored — each developer creates their own
- **Incremental Scraping**: Safe to rerun `scrape.py` multiple times; already-fetched pages are not duplicated
