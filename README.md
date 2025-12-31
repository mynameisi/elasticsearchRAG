# RAG Application with Elasticsearch & Qwen LLM

A Retrieval Augmented Generation (RAG) application featuring hybrid search (semantic + full-text) with Elasticsearch, Volcengine embeddings, and Qwen AI for intelligent Q&A.

## Features

- **Hybrid Search**: Combines kNN vector search with BM25 full-text search using Reciprocal Rank Fusion (RRF)
- **Multi-format Documents**: Support for Markdown (.md), PDF (.pdf), and Word (.docx) files
- **Bilingual Support**: Cross-language retrieval between English and Chinese documents
- **Web Interface**: Modern search UI with document management and AI chat
- **Streaming Chat**: Real-time AI responses via Server-Sent Events (SSE)
- **Document Deduplication**: SQLRecordManager tracks indexed documents to avoid duplicates

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Interface                             │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │   Search    │  │      Chat        │  │  Document Manager  │  │
│  └─────────────┘  └──────────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                             │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │   Search API    │  │     Chat API     │  │   Document API │  │
│  └─────────────────┘  └──────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
        │                       │                      │
        ▼                       ▼                      ▼
┌───────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Elasticsearch │    │   Qwen/DashScope │    │    Volcengine   │
│ (Vector Store)│    │      (LLM)       │    │   (Embeddings)  │
└───────────────┘    └──────────────────┘    └─────────────────┘
```

## Prerequisites

- **Docker** and **Docker Compose** (v2.0+)
- **Python** 3.10+
- **uv** (recommended) for Python package management

## Quick Start

### Step 1: Start Elasticsearch

```bash
docker-compose up -d
```

This starts:
- **Elasticsearch** on `http://localhost:9200` (user: `elastic`, password: `test123`)
- **Kibana** on `http://localhost:5601`

Wait for Elasticsearch to be healthy:

```bash
docker-compose logs -f elasticsearch
# Look for "started" message
```

### Step 2: Install Python Dependencies

```bash
uv sync
```

For development (includes pytest, hypothesis):

```bash
uv sync --extra dev
```

### Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Required for embeddings (Volcengine Ark)
ARK_API_KEY=your-volcengine-ark-api-key
ARK_EMBEDDING_ENDPOINT=ep-xxxxxxxxx-xxxxx

# Required for AI chat (Alibaba DashScope)
DASHSCOPE_API_KEY=your-dashscope-api-key
```

#### Getting API Keys

| Service | Purpose | Console |
|---------|---------|---------|
| **Volcengine Ark** | Text embeddings (Doubao model) | [console.volcengine.com/ark](https://console.volcengine.com/ark) |
| **DashScope** | Qwen LLM for chat | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com) |

**Volcengine Ark Setup:**
1. Create an API Key in the console
2. Go to **模型推理** → **推理接入点管理**
3. Create an embedding endpoint (e.g., `doubao-embedding`)
4. Copy the endpoint ID (format: `ep-xxxxxxxxx-xxxxx`)

### Step 4: Index Documents

Index the sample employee handbook:

```bash
uv run python load-markdown-into-es.py employee_handbook.md --use-embeddings
```

Expected output:

```
Loading Markdown file: employee_handbook.md
Connected to Elasticsearch at http://localhost:9200
Using Volcengine Ark embeddings (endpoint: ep-xxxxxxxx-xxxxx)

==================================================
Indexing Results
==================================================
  Documents added:   21
  Documents updated: 0
  Documents skipped: 0
  Documents deleted: 0
==================================================
```

### Step 5: Start the Web Server

```bash
uv run python run_search_server.py
```

Open http://127.0.0.1:8000 in your browser.

## Web Interface

### Search Tab
- **Hybrid Search**: Toggle between semantic+keyword and keyword-only search
- **Click Results**: Opens document in side panel with search term highlighting
- **Auto-scroll**: Panel scrolls to the matching section

### Chat Tab
- **RAG-Powered**: Uses retrieved documents as context for AI responses
- **Streaming**: Real-time response streaming
- **Clickable Sources**: Click source citations to view referenced documents
- **Bilingual**: Ask in English or Chinese, get answers from all documents

### Document Management (Left Panel)
- **Upload**: Add MD, PDF, or DOCX files
- **View**: Click to preview any document
- **Delete**: Single delete (hover → trash) or batch delete (checkboxes)
- **Reindex**: Re-process all documents with embeddings

## CLI Reference

### Index Documents

```bash
python load-markdown-into-es.py <file> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--index` | `rag_documents` | Elasticsearch index name |
| `--use-embeddings` | - | Enable vector embeddings |
| `--recreate-index` | - | Delete and recreate the index |
| `--cleanup` | `full` | Cleanup mode: full, incremental, none |
| `--host` | `localhost` | Elasticsearch host |
| `--port` | `9200` | Elasticsearch port |
| `--username` | `elastic` | ES username |
| `--password` | `test123` | ES password |

**Examples:**

```bash
# Index with embeddings (recommended)
python load-markdown-into-es.py docs/guide.md --use-embeddings

# Recreate index from scratch
python load-markdown-into-es.py employee_handbook.md --use-embeddings --recreate-index

# Index without embeddings (BM25 full-text only)
python load-markdown-into-es.py employee_handbook.md
```

### Run Server

```bash
python run_search_server.py [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--host` | `127.0.0.1` | Host to bind |
| `--port` | `8000` | Port to bind |
| `--reload` | - | Enable auto-reload for development |

## Python API

### Search Documents

```python
from src import get_elasticsearch_client, get_embedding_client, search_documents

es = get_elasticsearch_client()
emb = get_embedding_client()

# Hybrid search (semantic + BM25)
results = search_documents(es, "rag_documents", "年假有多少天", embedding_client=emb)
for r in results:
    print(r.content)
```

### Bilingual Search

```python
from src.hybrid_search import bilingual_search, get_context_for_rag

# Cross-language retrieval
results = bilingual_search(es, "rag_documents", "What is functional programming?", emb)

# Get context for RAG prompts
context = get_context_for_rag(es, "rag_documents", "vacation policy", emb, top_k=5)
```

### Chat with Qwen

```python
from src.qwen_client import get_qwen_client, ChatMessage

client = get_qwen_client()
messages = [ChatMessage(role="user", content="Hello!")]
response = client.chat(messages)
print(response.content)
```

## API Endpoints

### Search

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search?q=<query>` | GET | Search documents |
| `/api/health` | GET | Check service status |
| `/api/document?source=<path>` | GET | Get full document content |

### Chat

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Send message, get AI response |
| `/api/chat/stream` | POST | Stream AI response via SSE |

**Chat Request:**

```json
{
  "message": "What is functional programming?",
  "history": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi!"}
  ],
  "use_rag": true
}
```

### Document Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/documents` | GET | List all documents |
| `/api/documents/{filename}` | GET | Get document content |
| `/api/documents/{filename}` | DELETE | Delete document |
| `/api/documents/upload` | POST | Upload documents |
| `/api/reindex` | POST | Reindex all documents |

## Project Structure

```
.
├── src/
│   ├── __init__.py              # Package exports
│   ├── document_indexer.py      # Document processing & indexing
│   ├── document_loader.py       # Multi-format loading (MD, PDF, DOCX)
│   ├── hybrid_search.py         # RRF hybrid search (kNN + BM25)
│   ├── index_mapping.py         # Elasticsearch index management
│   ├── markdown_loader.py       # Markdown header splitting
│   ├── qwen_client.py           # Qwen/DashScope LLM client
│   ├── search_api.py            # FastAPI backend
│   └── volcengine_embedding.py  # Volcengine Ark embeddings
├── frontend/
│   ├── index.html               # Web interface
│   └── static/
│       ├── app.js               # Search frontend
│       ├── chat.js              # Chat frontend
│       └── styles.css           # Styling
├── docs/                        # Uploaded documents directory
├── tests/                       # Test files
├── docker-compose.yaml          # Elasticsearch & Kibana
├── load-markdown-into-es.py     # CLI for document ingestion
├── run_search_server.py         # Server launcher
├── employee_handbook.md         # Sample document
└── pyproject.toml               # Python dependencies
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ARK_API_KEY` | For embeddings | Volcengine Ark API key |
| `ARK_EMBEDDING_ENDPOINT` | For embeddings | Embedding model endpoint ID |
| `DASHSCOPE_API_KEY` | For chat | Alibaba DashScope API key |
| `ARK_BASE_URL` | No | Custom Ark API URL (default: Beijing) |

## Troubleshooting

### Elasticsearch won't start
- Ensure Docker has enough memory (≥4GB recommended)
- Check logs: `docker-compose logs elasticsearch`

### Embedding/Chat not working
- Verify API keys in `.env` file
- Check that `.env` is in the project root
- Ensure endpoint ID format is correct (`ep-xxxxxxxxx-xxxxx`)

### No search results
- Verify documents were indexed: `docker-compose exec elasticsearch curl -u elastic:test123 localhost:9200/rag_documents/_count`
- For hybrid search, ensure `--use-embeddings` was used during indexing

### Dimension mismatch errors
- Use `--recreate-index` when changing embedding models
- Different models have different embedding dimensions

## Running Tests

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/test_hybrid_search_properties.py
```

## License

MIT
