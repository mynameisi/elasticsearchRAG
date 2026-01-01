# RAG Application with Elasticsearch & Qwen LLM

A Retrieval Augmented Generation (RAG) application featuring hybrid search (semantic + full-text) with Elasticsearch, Volcengine embeddings, and Qwen AI for intelligent Q&A.

## Features

- **Hybrid Search**: Combines kNN vector search with BM25 full-text search using Reciprocal Rank Fusion (RRF)
- **Multi-format Documents**: Support for Markdown (.md), PDF (.pdf), and Word (.docx) files
- **Bilingual Support**: Cross-language retrieval between English and Chinese documents
- **Web Interface**: Modern search UI with document management and AI chat
- **Streaming Chat**: Real-time AI responses via Server-Sent Events (SSE)
- **Conversation Management**: Pin, rename, search, and manage chat history with localStorage persistence
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

### Install Docker

**macOS:**
```bash
# Using Homebrew
brew install --cask docker

# Then open Docker Desktop from Applications
```

Or download [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) directly.

**Ubuntu/Debian:**
```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Add your user to the docker group (logout/login required)
sudo usermod -aG docker $USER

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker
```

**Windows:**

Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).

**Verify installation:**
```bash
docker --version
docker compose version
```

### Install uv (Python Package Manager)

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

## Quick Start

### Step 1: Install & Start Elasticsearch

This project uses Docker to run Elasticsearch and Kibana. The `docker-compose.yaml` file in the project root defines the complete setup.

**Start the services:**

```bash
docker-compose up -d
```

This automatically downloads and starts:
- **Elasticsearch 8.15.0** on `http://localhost:9200`
- **Kibana 8.15.0** on `http://localhost:5601`

**Default credentials:**
- Username: `elastic`
- Password: `test123`

**Wait for Elasticsearch to be ready:**

```bash
# Watch the logs until you see "started"
docker-compose logs -f elasticsearch
```

Or check health directly:

```bash
curl -u elastic:test123 http://localhost:9200/_cluster/health?pretty
```

Expected output when ready:

```json
{
  "cluster_name" : "rag-cluster",
  "status" : "green",
  ...
}
```

**Useful Docker commands:**

```bash
# Check running containers
docker-compose ps

# Stop services (preserves data)
docker-compose stop

# Stop and remove containers (preserves data volume)
docker-compose down

# Stop and remove everything including data
docker-compose down -v

# View Elasticsearch logs
docker-compose logs elasticsearch

# Restart services
docker-compose restart
```

**Access Kibana (optional):**

Open http://localhost:5601 and login with `elastic` / `test123` to explore your data visually.

### Step 2: Install Python Dependencies

```bash
uv sync
```

For development (includes pytest, hypothesis):

```bash
uv sync --extra dev
```

### Step 3: Configure Environment Variables

Copy the example environment file and fill in your API keys:

```bash
cp .env.example .env
```

Then edit `.env` with your actual values. The file contains detailed comments explaining each variable:

```bash
# =============================================================================
# RAG Application Environment Variables
# =============================================================================

# -----------------------------------------------------------------------------
# VOLCENGINE ARK - Text Embeddings (Required for semantic search)
# -----------------------------------------------------------------------------
# These credentials generate vector embeddings for documents and search queries,
# enabling semantic/similarity search in Elasticsearch.
#
# ARK_API_KEY: Your Volcengine Ark API key for authentication
# Example: ark-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ARK_API_KEY=your-volcengine-ark-api-key

# ARK_EMBEDDING_ENDPOINT: The inference endpoint ID for the embedding model.
# This is passed as the "model" parameter in API requests to specify which
# deployed embedding model to use.
# Format: ep-YYYYMMDDHHMMSS-xxxxx (e.g., ep-20251228171132-pgkpt)
ARK_EMBEDDING_ENDPOINT=ep-xxxxxxxxx-xxxxx

# -----------------------------------------------------------------------------
# ALIBABA DASHSCOPE - Qwen LLM Chat (Required for AI chat feature)
# -----------------------------------------------------------------------------
# This API key powers the Qwen large language model that generates
# conversational responses. It takes retrieved document context and
# produces human-readable answers.
#
# DASHSCOPE_API_KEY: Your Alibaba DashScope API key for Qwen LLM
# Example: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DASHSCOPE_API_KEY=your-dashscope-api-key
```

#### Getting API Keys

| Variable | Service | Purpose | How It's Used |
|----------|---------|---------|---------------|
| `ARK_API_KEY` | Volcengine Ark | Authentication | Bearer token in API requests |
| `ARK_EMBEDDING_ENDPOINT` | Volcengine Ark | Model selection | Passed as `model` parameter to specify which embedding model to use |
| `DASHSCOPE_API_KEY` | Alibaba DashScope | Authentication | API key for Qwen LLM chat requests |

#### Volcengine Ark Setup (for Embeddings)

Console: [console.volcengine.com/ark](https://console.volcengine.com/ark)

1. **Create an API Key:**
   - Go to **API Key 管理** in the left sidebar
   - Click **创建 API Key**
   - Copy the generated key (you won't be able to see it again!)

2. **Create an Embedding Endpoint:**
   - Go to **模型推理** → **推理接入点管理**
   - Click **创建推理接入点**
   - Select an embedding model (e.g., `doubao-embedding` or `doubao-embedding-large`)
   - After creation, copy the endpoint ID (format: `ep-YYYYMMDDHHMMSS-xxxxx`)

#### Alibaba DashScope Setup (for Chat)

Console: [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com)

1. Go to **API-KEY 管理** in the left sidebar
2. Click **创建新的 API-KEY**
3. Copy the generated key

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
- **Conversation History**: All conversations are automatically saved to browser localStorage
  - **New Chat**: Start a fresh conversation (current one is saved automatically)
  - **History Panel**: View all previous conversations with timestamps
  - **📌 Pin**: Pin important conversations to the top of the list
  - **✏️ Rename**: Give conversations custom names (preserved across updates)
  - **🔍 Search**: Full-text search across all conversation titles and messages
  - **Delete**: Remove individual conversations or clear all history

### Document Management (Left Panel)
- **Upload**: Add MD, PDF, or DOCX files
- **View**: Click to preview any document
- **Delete**: Single delete (hover → trash) or batch delete (checkboxes)
- **Reindex**: Re-process documents with smart caching
  - **Click**: Incremental reindex - skips unchanged documents (fast)
  - **Shift+Click**: Force full reindex - rebuilds everything from scratch

#### Reindex Caching
The reindex feature uses content-based caching to avoid regenerating embeddings for unchanged documents:
- Each document chunk is hashed (SHA-256) based on content + metadata
- Unchanged chunks are skipped, saving API calls and time
- Only new or modified content triggers embedding generation
- Deleted documents are automatically removed from the index

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

## Document Chunking

Documents are split into chunks before indexing:

| Format | Method | Details |
|--------|--------|---------|
| Markdown | Header-based splitting | Splits on H1/H2/H3 headers |
| PDF/DOCX | Recursive character splitting | 1000 chars, 200 overlap |

This follows industry-standard practices for RAG applications. For detailed documentation on the chunking strategy, alternatives, and configuration options, see [docs/chunking-strategy.md](docs/chunking-strategy.md).

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
| `/api/reindex` | POST | Reindex documents (cached) |
| `/api/reindex?force=true` | POST | Force full reindex (bypass cache) |

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
├── docs/                        # Documentation & uploaded documents
│   └── chunking-strategy.md     # Document chunking approach
├── tests/                       # Test files
├── docker-compose.yaml          # Elasticsearch & Kibana
├── load-markdown-into-es.py     # CLI for document ingestion
├── run_search_server.py         # Server launcher
├── employee_handbook.md         # Sample document
└── pyproject.toml               # Python dependencies
```

## Environment Variables

| Variable | Required For | Description | Example |
|----------|--------------|-------------|---------|
| `ARK_API_KEY` | Embeddings | Volcengine Ark API key for authentication | `ark-xxxxxxxxxxxx` |
| `ARK_EMBEDDING_ENDPOINT` | Embeddings | Inference endpoint ID specifying which embedding model to use (passed as `model` parameter in API) | `ep-20251228171132-pgkpt` |
| `DASHSCOPE_API_KEY` | Chat | Alibaba DashScope API key for Qwen LLM | `sk-xxxxxxxxxxxx` |
| `ARK_BASE_URL` | Optional | Custom Volcengine Ark API base URL | Default: `https://ark.cn-beijing.volces.com/api/v3` |

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
