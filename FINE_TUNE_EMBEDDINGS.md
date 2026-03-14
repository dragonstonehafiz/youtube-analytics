# Fine-tuning Gaming Embeddings

This guide explains how to fine-tune the video title embedding model with your gaming content.

## Prerequisites

Before generating training data, ensure your database is synced:

1. Sync all video data (via Sync Page)
2. Sync all comments
3. Sync competitors videos

Without synced data, the training corpus will be empty or incomplete.

## Step 1: Generate Training Data

Run the data gathering script to collect video titles, descriptions, and comments:

```bash
cd backend
python scripts/gather_training_data.py
```

**Output:**
- `backend/data/training_data.csv` — cleaned corpus of titles, descriptions, and comments

**What it collects:**
- All your video titles
- Your own video descriptions
- All comments (from your videos)
- Competitor video titles

**Cleaning applied:**
- Removes emojis
- Removes timestamps (keeps surrounding text)
- Removes hashtags
- Removes control characters and malformed unicode
- Filters out single-word comments

## Step 2: Generate Pairs with an LLM

The script outputs `backend/data/sentences_for_pair_generation.csv` with sample sentences from your training data.

**Workflow:**
1. Take the generated `sentences_for_pair_generation.csv`
2. Send it to an LLM (Claude, ChatGPT, etc.) along with pair generation instructions
3. The LLM generates pairs from the sentences
4. Save the output as `backend/data/ai_pairs.csv`

**File location:** `backend/data/ai_pairs.csv`

**Important:**
- Pairs must be PHRASES or SENTENCES, not single words
- Include both similar (1) and dissimilar (0) pairs — roughly 50/50 split
- The LLM should generate 100+ pairs for best results
- Use the sentences from `sentences_for_pair_generation.csv` as the reference material

## Step 3: Run Fine-tuning

Once you have the pairs CSV, run the fine-tuning script:

```bash
cd backend
python scripts/finetune_embeddings.py
```

**What happens:**
1. **TSDAE phase** — adapts the base embedding model to your gaming vocabulary using the full training corpus
2. **Supervised phase** — trains on your concept pairs with CosineSimilarityLoss

**Output:**
- `backend/data/finetuned_embeddings/` — directory containing the fine-tuned model (ready to use)


## Step 4: Swap in the Fine-tuned Model

Update `backend/src/utils/embeddings.py` line 27:

```python
# Before (base model):
self._model = SentenceTransformer("multi-qa-MiniLM-L6-cos-v1")

# After (fine-tuned model):
self._model = SentenceTransformer("data/finetuned_embeddings")
```
