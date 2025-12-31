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
DASHSCOPE_API_KEY=your-dashscope-api-key
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

## Kibana Dashboard Analytics

Documents are indexed with rich metadata for Kibana visualizations.

### Available Fields for Dashboards

| Field | Type | Description |
|-------|------|-------------|
| `indexed_at` | date | Timestamp when document was indexed |
| `word_count` | integer | Word count (English words + Chinese characters) |
| `char_count` | integer | Total character count |
| `has_code` | boolean | Whether content contains code blocks |
| `section_depth` | integer | Header depth (1=H1, 2=H2, 3=H3) |
| `source_filename` | keyword | Source file name |
| `Header 1` | keyword | Top-level section header |
| `Header 2` | keyword | Second-level section header |
| `Header 3` | keyword | Third-level section header |

### Creating Dashboards

1. Go to Kibana → **Stack Management** → **Data Views**
2. Create data view for `rag_documents`
3. Go to **Dashboard** → **Create dashboard** → **Create visualization**

### Suggested Visualizations

- **Content by Section**: Bar chart with `Header 2` on X-axis
- **Word Count Distribution**: Histogram on `word_count`
- **Section Depth Breakdown**: Pie chart on `section_depth`
- **Documents with Code**: Metric filtered by `has_code: true`
- **Average Content Length**: Metric with average of `char_count`
- **Indexing Timeline**: Line chart on `indexed_at`

## Web Search Interface

A professional search frontend is included for interactive document search and AI-powered chat.

### Start the Search Server

```bash
uv run python run_search_server.py
```

Then open http://127.0.0.1:8000 in your browser.

### Features

- **Tab Navigation**: Switch between Search and Chat modes
- **Hybrid Search Toggle**: Switch between hybrid (semantic + keyword) and full-text only search
- **Highlighted Results**: Matching terms are highlighted in yellow in search snippets
- **Normalized Relevance Scores**: Scores displayed as 0-100 (top result = 100)
- **Document Side Panel**: Click any result to open full document with markdown rendering
- **Search Term Highlighting**: All search terms highlighted throughout the document
- **Auto-scroll to Match**: Panel automatically scrolls to the matching paragraph
- **Health Status**: Shows Elasticsearch and embedding service connectivity

### AI Chat (RAG-Powered)

The Chat tab provides an AI-powered conversational interface using RAG:

- **Multi-turn Conversations**: Chat history is maintained for contextual responses
- **RAG Integration**: Toggle to enable/disable knowledge base retrieval
- **Streaming Responses**: Real-time streaming via Server-Sent Events (SSE)
- **Source Citations**: Shows which documents were used for each response
- **Markdown Rendering**: AI responses are rendered with full markdown support
- **Bilingual Support**: Works with both English and Chinese documents/queries

**Clickable Source Citations:**

Each chat response includes clickable source references that link directly to the referenced documents:

- **Click to View**: Click any source citation to open the document in the side panel
- **Page Navigation**: For PDFs, automatically navigates to the specific page containing the reference
- **Text Highlighting**: Search terms are highlighted in the opened document (same as search results)
- **Source Metadata**: Shows file type icon, page number (for PDFs), and content preview
- **Inline & Panel Sources**: Both inline source badges and the sources panel are clickable

**Requirements:**
- Set `DASHSCOPE_API_KEY` in your `.env` file (get key from [DashScope Console](https://dashscope.console.aliyun.com/))

**How it works:**
1. User sends a message (in English or Chinese)
2. If RAG is enabled, bilingual search retrieves relevant documents from ALL sources regardless of language
3. Retrieved context is sent to Qwen LLM with instructions to respond in the user's language
4. Response is streamed back in real-time with clickable source citations
5. Click any source to view the original document with the relevant section highlighted

### Bilingual Search

The RAG system supports **cross-language retrieval** - you can ask questions in any language and get answers from all your documents:

- **Dual Search Strategy**: Combines semantic search with full-text search for cross-language coverage
- **Language-Agnostic Retrieval**: Chinese queries can find English documents and vice versa
- **Automatic Response Language**: AI responds in the same language as your question
- **Mixed Source Synthesis**: Combines information from both Chinese and English sources

Example:
- Ask "What is functional programming?" → Gets context from both English FP book AND Chinese documents
- Ask "应该问的三个问题" → Gets context from both Chinese AND English sources

### PDF Viewer

The web interface includes a built-in PDF viewer powered by PDF.js:

- **Fit-to-Width**: PDFs open at a zoom level that fills the container width automatically
- **Zoom Controls**: Click `+` / `−` buttons to zoom in/out (30% - 300% range)
- **Page Navigation**: Navigate multi-page PDFs with `◀` / `▶` buttons
- **Page Display**: Shows current page number and total pages
- **Download**: Direct download button for the original PDF file
- **Text Layer**: Invisible text layer enables search term highlighting in PDFs
- **Responsive Canvas**: PDF renders at actual size with CSS-controlled display dimensions
- **Bidirectional Scrolling**: Wide PDFs can be scrolled horizontally in both directions (left and right) when zoomed in

### PDF Search Highlighting

When clicking on a PDF search result, the viewer provides intelligent navigation:

- **Jump to Page**: Automatically navigates to the specific page containing the search match (page number stored in search index)
- **Search Term Highlighting**: Yellow highlight boxes appear over text chunks containing the search terms
- **Visual Indicator**: "📍 Page X" badge shown in search result cards for PDF results
- **Highlight Info Bar**: Shows "🔍 Highlighting search matches" when viewing from a search result
- **Accurate Positioning**: Highlights are positioned using PDF.js viewport coordinate conversion for proper alignment

### Document Management (Left Panel)

- **Document List**: View all markdown files with size and indexed chunk count
- **Upload Documents**: Add new `.md` files via the Upload button
- **View Documents**: Click any document to view with full markdown rendering
- **Delete Documents**: Single delete (hover → trash icon) or batch delete (checkboxes)
- **Reindex**: Re-process all documents with embeddings for search

### Server Options

```bash
python run_search_server.py --host 0.0.0.0 --port 8080 --reload
```

| Option | Default | Description |
|--------|---------|-------------|
| `--host` | `127.0.0.1` | Host to bind |
| `--port` | `8000` | Port to bind |
| `--reload` | - | Enable auto-reload for development |

## Project Structure

```
.
├── src/
│   ├── __init__.py              # Package exports
│   ├── document_indexer.py      # Document processing and indexing
│   ├── document_loader.py       # Multi-format document loading (MD, PDF, DOCX)
│   ├── hybrid_search.py         # RRF hybrid search (kNN + BM25)
│   ├── index_mapping.py         # Elasticsearch index management
│   ├── markdown_loader.py       # Markdown document splitting
│   ├── qwen_client.py           # Qwen/DashScope LLM client
│   ├── search_api.py            # FastAPI search backend + chat API
│   └── volcengine_embedding.py  # Volcengine Ark embedding client
├── frontend/
│   ├── index.html               # Search & Chat interface HTML
│   └── static/
│       ├── app.js               # Search frontend JavaScript
│       ├── chat.js              # Chat frontend JavaScript
│       └── styles.css           # Styling (search + chat)
├── docs/                        # Uploaded documents directory
├── config/
│   ├── higress-ai-search.yaml   # Higress plugin configuration
│   └── setup_elasticsearch.sh   # ES cluster setup script
├── tests/
│   ├── test_hybrid_search_properties.py  # Property-based tests
│   ├── test_qwen_client.py      # Qwen client unit tests
│   └── test_chat_api.py         # Chat API integration tests
├── docker-compose.yaml          # Elasticsearch & Kibana stack
├── load-markdown-into-es.py     # CLI for document ingestion
├── run_search_server.py         # Search server launcher
├── employee_handbook.md         # Sample knowledge base document
├── .env                         # Environment variables (create this)
└── pyproject.toml              # Python project configuration
```

## API Reference

### Search Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search` | GET | Search documents with hybrid or full-text search |
| `/api/health` | GET | Check Elasticsearch and embedding service status |
| `/api/document` | GET | Get full document by source path |

### Chat Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Send a chat message and get AI response with RAG |
| `/api/chat/stream` | POST | Stream chat response via Server-Sent Events (SSE) |

**Chat Request Body:**
```json
{
  "message": "What is functional programming?",
  "history": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi! How can I help?"}
  ],
  "use_rag": true
}
```

**Chat Response:**
```json
{
  "response": "Functional programming is a programming paradigm...",
  "sources": [
    {
      "source": "docs/fp-book.pdf",
      "title": "FP Book",
      "content": "Functional programming is a paradigm that treats computation...",
      "score": 0.85,
      "file_type": "pdf",
      "source_filename": "fp-book.pdf",
      "page": 94
    }
  ],
  "model": "qwen-turbo"
}
```

### Document Management Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/documents` | GET | List all documents with metadata |
| `/api/documents/{filename}` | GET | Get document content by filename |
| `/api/documents/{filename}` | DELETE | Delete document and index entries |
| `/api/documents/upload` | POST | Upload new markdown files |
| `/api/reindex` | POST | Reindex all documents with embeddings |

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

### Bilingual Search (Cross-Language)

```python
from src.hybrid_search import bilingual_search, get_context_for_rag

# Bilingual search - finds documents in ALL languages regardless of query language
results = bilingual_search(
    es_client=es,
    index_name="rag_documents",
    query="functional programming",  # English query finds Chinese docs too
    embedding_client=emb,
    top_k=5
)

# Get bilingual RAG context (enabled by default)
context = get_context_for_rag(
    es_client=es,
    index_name="rag_documents",
    query="什么是函数式编程",  # Chinese query finds English docs too
    embedding_client=emb,
    top_k=5,
    bilingual=True  # Default: True
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
