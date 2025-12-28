# RAG Application with LangChain, Higress, and Elasticsearch

A Retrieval Augmented Generation (RAG) application that combines LangChain for document processing, Elasticsearch for vector storage and hybrid search, and Higress AI Gateway for LLM integration.

## Overview

This project enables intelligent question-answering by:
1. Parsing Markdown documents and splitting them by headers
2. Indexing document chunks into Elasticsearch with dense vector embeddings
3. Performing hybrid search combining semantic (kNN) and full-text (BM25) search using RRF
4. Integrating with Higress AI Gateway for LLM-powered responses

## Features

- **Hybrid Search**: Combines kNN vector search with BM25 full-text search using Reciprocal Rank Fusion (RRF)
- **Volcengine Ark Embeddings**: Uses Doubao embedding models for high-quality Chinese text embeddings
- **Document Deduplication**: SQLRecordManager tracks indexed documents to avoid duplicates
- **Flexible Indexing**: Support for incremental updates and full re-indexing

## Prerequisites

- **Docker** and **Docker Compose** (v2.0+)
- **Python** 3.10+
- **uv** (recommended) or pip for Python package management
- **Volcengine Ark Account** (for embeddings) - [Sign up here](https://console.volcengine.com/ark)
- **Higress** AI Gateway (optional, for full RAG pipeline)

## Quick Start

### 1. Start Elasticsearch and Kibana

```bash
docker-compose up -d
```

This starts:
- **Elasticsearch** on port 9200 (credentials: `elastic` / `test123`)
- **Kibana** on port 5601

Wait for Elasticsearch to be healthy:
```bash
docker-compose logs -f elasticsearch
```

### 2. Install Python Dependencies

Using uv (recommended):
```bash
uv sync
```

Or using pip:
```bash
pip install -e .
```

For development (includes testing tools):
```bash
uv sync --extra dev
```

### 3. Configure Volcengine Ark Embeddings

1. Go to [Volcengine Ark Console](https://console.volcengine.com/ark)
2. Create an API Key
3. Create an embedding model endpoint (推理接入点):
   - Navigate to **模型推理** → **推理接入点管理**
   - Click **创建推理接入点**
   - Select an embedding model (e.g., `doubao-embedding`)
   - Note the endpoint ID (format: `ep-xxxxxxxx-xxxxx`)

4. Set environment variables:
```bash
export ARK_API_KEY="your-api-key"
export ARK_EMBEDDING_ENDPOINT="ep-xxxxxxxx-xxxxx"
```

Or create a `.env` file:
```
ARK_API_KEY=your-api-key
ARK_EMBEDDING_ENDPOINT=ep-xxxxxxxx-xxxxx
```

### 4. Index Documents with Embeddings

Index the sample employee handbook with vector embeddings:
```bash
python load-markdown-into-es.py employee_handbook.md --use-embeddings
```

You should see output like:
```
Loading Markdown file: employee_handbook.md
Connected to Elasticsearch at http://localhost:9200
Created index: rag_documents
Using Volcengine Ark embeddings (endpoint: ep-xxxxxxxx-xxxxx)
Indexing documents with cleanup mode: full
Generating embeddings for 21 documents...
  Embedded 21/21 documents

==================================================
Indexing Results
==================================================
  Documents added:   21
  Documents updated: 0
  Documents skipped: 0
  Documents deleted: 0
==================================================

Total documents processed: 21
Indexing completed successfully!
```

### 5. Search Documents

Use the Python API to perform hybrid search:

```python
from src import get_elasticsearch_client, get_embedding_client, search_documents, get_context_for_rag

# Connect to Elasticsearch and embedding service
es = get_elasticsearch_client()
emb = get_embedding_client()

# Hybrid search (kNN + BM25 with RRF)
results = search_documents(es, "rag_documents", "年假有多少天", embedding_client=emb)
for r in results:
    print(r.content)

# Get context for RAG prompts
context = get_context_for_rag(es, "rag_documents", "vacation policy", embedding_client=emb, top_k=3)
print(context)
```

## Embedding Configuration

### Volcengine Ark (Recommended)

The project uses Volcengine Ark's embedding API, which is OpenAI-compatible and supports high-quality Chinese text embeddings.

**Supported Models:**
- `doubao-embedding` - Doubao embedding model (2560 dimensions)
- Other models available in the Ark console

**Environment Variables:**
| Variable | Description |
|----------|-------------|
| `ARK_API_KEY` | Your Volcengine Ark API key |
| `ARK_EMBEDDING_ENDPOINT` | Embedding model endpoint ID (e.g., `ep-20251228171132-pgkpt`) |
| `ARK_BASE_URL` | API base URL (default: `https://ark.cn-beijing.volces.com/api/v3`) |

### Full-Text Search Only (No Embeddings)

If you don't want to use embeddings, you can index documents without them:
```bash
python load-markdown-into-es.py employee_handbook.md
```

Search will use BM25 full-text search only:
```python
results = search_documents(es, "rag_documents", "vacation policy")  # No embedding_client
```

## Higress AI Gateway Setup (Optional)

For the complete RAG pipeline with LLM integration, set up Higress AI Gateway.

### Install Higress

Follow the [Higress installation guide](https://higress.io/docs/latest/user/quickstart/) or use Docker:

```bash
curl -fsSL https://higress.io/standalone/get-higress.sh | bash
```

Higress exposes:
- **Console**: http://localhost:8001
- **API Gateway**: http://localhost:8080

### Configure AI Search Plugin

1. Register Elasticsearch as a service in Higress console
2. Configure the `ai-search` plugin using the template in `config/higress-ai-search.yaml`
3. Set up your LLM provider (e.g., Qwen/通义千问)

### Query the RAG API

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-turbo",
    "messages": [
      {"role": "user", "content": "What are the working hours?"}
    ]
  }'
```

## Project Structure

```
.
├── src/
│   ├── __init__.py              # Package exports
│   ├── document_indexer.py      # Document processing and indexing
│   ├── hybrid_search.py         # RRF hybrid search (kNN + BM25)
│   ├── index_mapping.py         # Elasticsearch index management
│   ├── markdown_loader.py       # Markdown document splitting
│   └── volcengine_embedding.py  # Volcengine Ark embedding client
├── config/
│   ├── higress-ai-search.yaml   # Higress plugin configuration
│   └── setup_elasticsearch.sh   # ES cluster setup script
├── tests/
│   └── test_hybrid_search_properties.py  # Property-based tests
├── docker-compose.yaml          # Elasticsearch & Kibana stack
├── load-markdown-into-es.py     # CLI for document ingestion
├── employee_handbook.md         # Sample knowledge base document
├── .env                         # Environment variables (create this)
└── pyproject.toml              # Python project configuration
```

## CLI Reference

### load-markdown-into-es.py

Index Markdown documents into Elasticsearch:

```bash
python load-markdown-into-es.py <markdown_file> [options]
```

**Options:**
| Option | Default | Description |
|--------|---------|-------------|
| `--index` | `rag_documents` | Elasticsearch index name |
| `--host` | `localhost` | Elasticsearch host |
| `--port` | `9200` | Elasticsearch port |
| `--username` | `elastic` | Elasticsearch username |
| `--password` | `test123` | Elasticsearch password |
| `--scheme` | `http` | Connection scheme (http/https) |
| `--cleanup` | `full` | Cleanup mode: full, incremental, none |
| `--db-url` | `sqlite:///record_manager.db` | SQLite URL for deduplication |
| `--no-verify-certs` | - | Disable SSL certificate verification |
| `--use-embeddings` | - | Enable Volcengine Ark embeddings |
| `--embedding-endpoint` | env var | Override embedding endpoint ID |
| `--recreate-index` | - | Delete and recreate the index |

**Examples:**
```bash
# Index with embeddings (recommended)
python load-markdown-into-es.py employee_handbook.md --use-embeddings

# Index without embeddings (full-text search only)
python load-markdown-into-es.py employee_handbook.md

# Recreate index with new embedding settings
python load-markdown-into-es.py employee_handbook.md --use-embeddings --recreate-index

# Index with custom index name
python load-markdown-into-es.py docs/guide.md --index my_docs --use-embeddings
```

## Python API Reference

### Embedding Client

```python
from src import get_embedding_client, VolcengineEmbeddingClient

# Using environment variables
client = get_embedding_client()

# Or with explicit parameters
client = VolcengineEmbeddingClient(
    api_key="your-api-key",
    endpoint_id="ep-xxxxxxxx-xxxxx"
)

# Generate embeddings
embedding = client.embed_text("Hello world")
embeddings = client.embed_documents(["Text 1", "Text 2", "Text 3"])
query_embedding = client.embed_query("search query")
```

### Hybrid Search

```python
from src import get_elasticsearch_client, get_embedding_client, search_documents, get_context_for_rag

es = get_elasticsearch_client()
emb = get_embedding_client()

# Search with hybrid (kNN + BM25)
results = search_documents(
    es_client=es,
    index_name="rag_documents",
    query="年假政策",
    embedding_client=emb,  # Pass None for BM25-only search
    top_k=5
)

# Get RAG context
context = get_context_for_rag(
    es_client=es,
    index_name="rag_documents", 
    query="vacation policy",
    embedding_client=emb,
    top_k=3
)
```

## Configuration

### Elasticsearch Index Mapping

The index uses a `dense_vector` field for embeddings and `text` field for full-text search:

```json
{
  "mappings": {
    "properties": {
      "content": { "type": "text" },
      "embedding": {
        "type": "dense_vector",
        "dims": 2560,
        "index": true,
        "similarity": "cosine"
      }
    }
  }
}
```

### Hybrid Search Query (RRF)

Search combines kNN vector search and BM25 full-text search using Reciprocal Rank Fusion:

```json
{
  "query": { "match": { "content": "<query>" } },
  "knn": {
    "field": "embedding",
    "query_vector": [0.1, 0.2, ...],
    "k": 10,
    "num_candidates": 100
  },
  "rank": {
    "rrf": {
      "rank_constant": 60,
      "rank_window_size": 100
    }
  }
}
```

## Running Tests

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run property-based tests only
pytest tests/test_hybrid_search_properties.py
```

## Troubleshooting

### Elasticsearch won't start
- Ensure Docker has enough memory (at least 4GB recommended)
- Check logs: `docker-compose logs elasticsearch`

### Embedding API errors
- Verify `ARK_API_KEY` and `ARK_EMBEDDING_ENDPOINT` are set correctly
- Check your Volcengine Ark console for API key validity
- Ensure the embedding endpoint is active

### Connection refused errors
- Wait for Elasticsearch health check to pass
- Verify credentials match docker-compose.yaml settings

### No search results
- Verify documents were indexed: check Kibana Dev Tools
- Ensure index name matches between indexing and search
- For hybrid search, ensure embeddings were generated during indexing

### Dimension mismatch errors
- If you change embedding models, use `--recreate-index` to rebuild the index
- Different models have different embedding dimensions

## License

MIT
