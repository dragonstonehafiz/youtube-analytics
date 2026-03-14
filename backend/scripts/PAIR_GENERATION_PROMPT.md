Your task: Generate training pairs from gaming sentences.

I'm uploading a CSV file with gaming video titles, descriptions, and comments (sentences_for_pair_generation.csv). Generate pairs showing which sentences are similar or dissimilar.

## Pair Rules

**Similar (label 1):**
- Same character/person: "Character's backstory" ↔ "Character voice lines"
- Same game mechanic: "Power mechanic explanation" ↔ "Power-up tutorial"
- Same game: "Game story scene" ↔ "Game dialogue"
- Related concepts: "Special weapon" ↔ "Weapon strategy guide"

**Dissimilar (label 0):**
- Different games: "One game content" ↔ "Different game content"
- Different characters: "Character A dialogue" ↔ "Character B conversation"
- Unrelated: "Game quotes" ↔ "Unrelated gameplay"

## Critical Rules

- Each text must be 2+ words (no single words like "Richtofen")
- Include BOTH similar and dissimilar pairs (aim for 50/50 split)
- Use actual sentences from the uploaded CSV
- Generate as many pairs as possible (100+)

## Output Format

Return ONLY CSV (no markdown, no extra text). Save as: **`ai_pairs.csv`**

```
text1,text2,label
"sentence from csv","another sentence from csv",1
"different sentence","unrelated sentence",0
```

Rules:
- Enclose each text in double quotes
- label is exactly `1` or `0`
- One pair per line
- Return ONLY the CSV
- Filename MUST be `ai_pairs.csv` (the fine-tuning script looks for this exact filename)
