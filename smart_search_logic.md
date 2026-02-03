# VidTok Hybrid Ranking Algorithm

The 'Smart Search' engine employs a Hybrid Search strategy that balances keyword precision, semantic depth, and user personalization.

## The Formula

The final relevance score for a video is calculated as:

```
Score = (BM25 * 0.4) + (Vector * 0.4) + (PersonalizationBoost * 0.2)
```

### 1. Keyword Score (BM25) - 40%
- **Mechanism:** Uses PostgreSQL Full-Text Search (`tsvector` and `ts_rank_cd`).
- **Goal:** Capture exact matches for titles, tags, and specific terminology.
- **Normalization:** Raw BM25 scores are normalized to a `[0, 1]` range relative to the top result in the candidate set.

### 2. Semantic Score (Vector) - 40%
- **Mechanism:** Cosine similarity via `pgvector`.
- **Embedding Model:** `nomic-embed-text-v1.5` (Local).
- **Goal:** Surface content that is conceptually related to the query even if keywords don't match (e.g., searching for "funny cats" surfaces "hilarious felines").
- **Normalization:** Cosine distance is converted to similarity: `1 - (embedding <=> query_vector)`.

### 3. Personalization Boost - 20%
- **Mechanism:** Binary check against user interaction history.
- **Logic:** 
  - `PersonalizationBoost = 1.0` if `channel_id` of the video exists in the user's `watch_history` (weighted by frequency) or `likes`.
  - `PersonalizationBoost = 0.0` otherwise.
- **Goal:** Prioritize creators the user already follows or enjoys.

## Retrieval Pipeline

1. **Embedding:** Generate a vector for the search query using the local embedding model.
2. **Recall:**
   - Fetch top 50 candidates via Keyword Search.
   - Fetch top 50 candidates via Vector Search.
3. **Merge:** Combine unique candidates (Union).
4. **Rank:** Apply the Hybrid Formula to the combined set.
5. **Pagination:** Return the top `N` results to the client.

## Model Recommendation

We recommend using **`nomic-embed-text-v1.5`** for local execution.
- **Dimensions:** 768.
- **Context Length:** 8192 tokens.
- **Performance:** State-of-the-art performance for its size, highly efficient for CPU/GPU local inference via `ollama` or `transformers`.
