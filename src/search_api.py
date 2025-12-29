"""
Search API Module

FastAPI backend for the RAG search interface with highlighting support.
"""

import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
load_dotenv()  # Load .env file

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from elasticsearch import Elasticsearch

from src.index_mapping import get_elasticsearch_client
from src.volcengine_embedding import get_embedding_client, VolcengineEmbeddingClient


app = FastAPI(title="RAG Search API", version="1.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global clients (initialized on startup)
es_client: Optional[Elasticsearch] = None
embedding_client: Optional[VolcengineEmbeddingClient] = None

# Documents directory
DOCS_DIR = Path("docs")
DOCS_DIR.mkdir(exist_ok=True)


class SearchResult(BaseModel):
    """Single search result with highlighting."""
    id: str
    title: str
    content: str
    snippet: str
    highlights: List[str]
    score: Optional[float] = None
    metadata: Dict[str, Any] = {}


class SearchResponse(BaseModel):
    """Search response containing results and metadata."""
    query: str
    total: int
    results: List[SearchResult]
    search_type: str  # "hybrid" or "fulltext"


def build_hybrid_query(
    query_text: str,
    query_vector: List[float],
    size: int = 10,
) -> Dict[str, Any]:
    """Build hybrid RRF query (no highlighting - ES limitation)."""
    return {
        "size": size,
        "query": {
            "match": {
                "content": {
                    "query": query_text,
                    "fuzziness": "AUTO"
                }
            }
        },
        "knn": {
            "field": "embedding",
            "query_vector": query_vector,
            "k": size,
            "num_candidates": 100
        },
        "rank": {
            "rrf": {
                "rank_constant": 60,
                "rank_window_size": 100
            }
        },
        "_source": {"excludes": ["embedding"]}
    }


def build_fulltext_query_with_highlight(
    query_text: str,
    size: int = 10,
) -> Dict[str, Any]:
    """Build full-text query with highlighting."""
    return {
        "size": size,
        "query": {
            "match": {
                "content": {
                    "query": query_text,
                    "fuzziness": "AUTO"
                }
            }
        },
        "highlight": {
            "fields": {
                "content": {
                    "fragment_size": 200,
                    "number_of_fragments": 3,
                    "pre_tags": ["<mark>"],
                    "post_tags": ["</mark>"],
                }
            }
        },
        "_source": {"excludes": ["embedding"]}
    }


def get_highlights_for_docs(
    es_client: Elasticsearch,
    index_name: str,
    doc_ids: List[str],
    query_text: str,
) -> Dict[str, List[str]]:
    """Fetch highlights for specific documents."""
    if not doc_ids:
        return {}
    
    query = {
        "size": len(doc_ids),
        "query": {
            "bool": {
                "must": {
                    "match": {
                        "content": query_text
                    }
                },
                "filter": {
                    "ids": {"values": doc_ids}
                }
            }
        },
        "highlight": {
            "fields": {
                "content": {
                    "fragment_size": 200,
                    "number_of_fragments": 3,
                    "pre_tags": ["<mark>"],
                    "post_tags": ["</mark>"],
                }
            }
        },
        "_source": False
    }
    
    response = es_client.search(index=index_name, body=query)
    
    highlights = {}
    for hit in response.get("hits", {}).get("hits", []):
        doc_id = hit.get("_id")
        highlight_data = hit.get("highlight", {})
        highlights[doc_id] = highlight_data.get("content", [])
    
    return highlights


def extract_title(metadata: Dict[str, Any], content: str) -> str:
    """Extract title from metadata or content."""
    # Try header metadata first
    for key in ["Header 1", "Header 2", "Header 3"]:
        if key in metadata and metadata[key]:
            return metadata[key]
    
    # Fall back to first line of content
    first_line = content.split("\n")[0].strip()
    if first_line:
        return first_line[:100] + ("..." if len(first_line) > 100 else "")
    
    return "Untitled"


def create_snippet(content: str, highlights: List[str], max_length: int = 300) -> str:
    """Create a snippet from content, preferring highlighted sections."""
    if highlights:
        # Use first highlight as snippet base
        return highlights[0]
    
    # Fall back to content truncation
    if len(content) <= max_length:
        return content
    
    return content[:max_length].rsplit(" ", 1)[0] + "..."


@app.on_event("startup")
async def startup():
    """Initialize clients on startup."""
    global es_client, embedding_client
    
    try:
        es_client = get_elasticsearch_client()
        if not es_client.ping():
            print("Warning: Cannot connect to Elasticsearch")
            es_client = None
    except Exception as e:
        print(f"Warning: Elasticsearch connection failed: {e}")
        es_client = None
    
    try:
        embedding_client = get_embedding_client()
    except ValueError:
        print("Warning: Embedding client not configured (missing API key or endpoint)")
        embedding_client = None


@app.get("/api/search", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1, description="Search query"),
    index: str = Query("rag_documents", description="Index name"),
    limit: int = Query(10, ge=1, le=50, description="Max results"),
    use_hybrid: bool = Query(True, description="Use hybrid search"),
):
    """
    Search documents with optional hybrid search and highlighting.
    """
    if es_client is None:
        raise HTTPException(status_code=503, detail="Elasticsearch not available")
    
    # Determine search type and execute query
    query_vector = None
    search_type = "fulltext"
    
    if use_hybrid and embedding_client is not None:
        try:
            query_vector = embedding_client.embed_query(q)
            search_type = "hybrid"
        except Exception as e:
            print(f"Embedding failed, falling back to full-text: {e}")
    
    try:
        if query_vector is not None:
            # Hybrid search (RRF) - no highlighting in same query
            query = build_hybrid_query(q, query_vector, limit)
            response = es_client.search(index=index, body=query)
            
            # Get doc IDs for highlight fetch
            doc_ids = [hit["_id"] for hit in response.get("hits", {}).get("hits", [])]
            highlights_map = get_highlights_for_docs(es_client, index, doc_ids, q)
        else:
            # Full-text search with highlighting
            query = build_fulltext_query_with_highlight(q, limit)
            response = es_client.search(index=index, body=query)
            highlights_map = {}  # Highlights included in response
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
    
    # Process results
    results = []
    hits = response.get("hits", {}).get("hits", [])
    
    for hit in hits:
        source = hit.get("_source", {})
        content = source.get("content", "")
        doc_id = hit.get("_id", "")
        
        # Get highlights - from map (hybrid) or response (fulltext)
        if query_vector is not None:
            highlights = highlights_map.get(doc_id, [])
        else:
            highlight_data = hit.get("highlight", {})
            highlights = highlight_data.get("content", [])
        
        # Build metadata (exclude content and internal fields)
        metadata = {k: v for k, v in source.items() if k not in ("content", "embedding")}
        
        results.append(SearchResult(
            id=doc_id,
            title=extract_title(metadata, content),
            content=content,
            snippet=create_snippet(content, highlights),
            highlights=highlights,
            score=hit.get("_score"),
            metadata=metadata,
        ))
    
    return SearchResponse(
        query=q,
        total=response.get("hits", {}).get("total", {}).get("value", len(results)),
        results=results,
        search_type=search_type,
    )


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    es_status = "connected" if es_client and es_client.ping() else "disconnected"
    emb_status = "configured" if embedding_client else "not configured"
    
    return {
        "status": "ok",
        "elasticsearch": es_status,
        "embeddings": emb_status,
    }


@app.get("/api/document")
async def get_document(
    source: str = Query(..., description="Source file path"),
):
    """
    Get full document content by source path.
    """
    try:
        # Security: only allow files within current directory
        file_path = Path(source)
        
        # Try to resolve relative to current working directory
        if not file_path.is_absolute():
            file_path = Path.cwd() / file_path
        
        # Check if file exists and is a markdown file
        if not file_path.exists():
            # Try just the filename in current directory
            file_path = Path.cwd() / file_path.name
        
        # Also check docs directory
        if not file_path.exists():
            file_path = DOCS_DIR / Path(source).name
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Document not found")
        
        if file_path.suffix.lower() not in ['.md', '.markdown', '.txt']:
            raise HTTPException(status_code=400, detail="Only markdown files supported")
        
        content = file_path.read_text(encoding='utf-8')
        
        return {
            "source": str(source),
            "content": content,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading document: {str(e)}")


# ==========================================
# Document Management Endpoints
# ==========================================

class DocumentInfo(BaseModel):
    filename: str
    size: int
    chunks: int


class DocumentsResponse(BaseModel):
    documents: List[DocumentInfo]


@app.get("/api/documents", response_model=DocumentsResponse)
async def list_documents():
    """List all documents in the docs directory with their index status."""
    documents = []
    
    # Get chunk counts from Elasticsearch
    chunk_counts = {}
    if es_client:
        try:
            # Aggregate by source_filename
            query = {
                "size": 0,
                "aggs": {
                    "by_file": {
                        "terms": {
                            "field": "source_filename",
                            "size": 1000
                        }
                    }
                }
            }
            result = es_client.search(index="rag_documents", body=query, ignore=[404])
            for bucket in result.get("aggregations", {}).get("by_file", {}).get("buckets", []):
                chunk_counts[bucket["key"]] = bucket["doc_count"]
        except Exception:
            pass
    
    # List files in docs directory
    for file_path in DOCS_DIR.glob("*.md"):
        documents.append(DocumentInfo(
            filename=file_path.name,
            size=file_path.stat().st_size,
            chunks=chunk_counts.get(file_path.name, 0)
        ))
    
    # Also check for markdown files in root
    for file_path in Path.cwd().glob("*.md"):
        if file_path.name not in [d.filename for d in documents]:
            documents.append(DocumentInfo(
                filename=file_path.name,
                size=file_path.stat().st_size,
                chunks=chunk_counts.get(file_path.name, 0)
            ))
    
    # Sort by filename
    documents.sort(key=lambda d: d.filename.lower())
    
    return DocumentsResponse(documents=documents)


@app.get("/api/documents/{filename}")
async def get_document_by_name(filename: str):
    """Get document content by filename."""
    # Check docs directory first
    file_path = DOCS_DIR / filename
    if not file_path.exists():
        # Check root directory
        file_path = Path.cwd() / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document not found")
    
    if file_path.suffix.lower() not in ['.md', '.markdown', '.txt']:
        raise HTTPException(status_code=400, detail="Only markdown files supported")
    
    content = file_path.read_text(encoding='utf-8')
    
    return {
        "filename": filename,
        "content": content,
        "size": file_path.stat().st_size
    }


@app.delete("/api/documents/{filename}")
async def delete_document(filename: str):
    """Delete a document and its index entries."""
    # Find the file
    file_path = DOCS_DIR / filename
    if not file_path.exists():
        file_path = Path.cwd() / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete from Elasticsearch
    if es_client:
        try:
            es_client.delete_by_query(
                index="rag_documents",
                body={
                    "query": {
                        "term": {
                            "source_filename": filename
                        }
                    }
                },
                ignore=[404]
            )
        except Exception as e:
            print(f"Error deleting from index: {e}")
    
    # Delete the file (only if in docs directory for safety)
    if file_path.parent == DOCS_DIR:
        file_path.unlink()
    
    return {"status": "deleted", "filename": filename}


@app.post("/api/documents/upload")
async def upload_documents(files: List[UploadFile] = File(...)):
    """Upload markdown documents."""
    uploaded = 0
    errors = []
    
    for file in files:
        if not file.filename:
            continue
            
        # Validate file type
        if not file.filename.lower().endswith(('.md', '.markdown', '.txt')):
            errors.append(f"{file.filename}: Invalid file type")
            continue
        
        try:
            # Save to docs directory
            dest_path = DOCS_DIR / file.filename
            content = await file.read()
            dest_path.write_bytes(content)
            uploaded += 1
        except Exception as e:
            errors.append(f"{file.filename}: {str(e)}")
    
    return {
        "uploaded": uploaded,
        "errors": errors
    }


@app.post("/api/reindex")
async def reindex_documents():
    """Reindex all documents in the docs directory."""
    if es_client is None:
        raise HTTPException(status_code=503, detail="Elasticsearch not available")
    
    from src.document_indexer import index_documents
    from src.markdown_loader import load_markdown_file
    from src.index_mapping import create_index
    
    # Collect all markdown files
    all_docs = []
    doc_files = list(DOCS_DIR.glob("*.md")) + list(Path.cwd().glob("*.md"))
    seen_files = set()
    
    for file_path in doc_files:
        if file_path.name in seen_files:
            continue
        seen_files.add(file_path.name)
        
        try:
            docs = load_markdown_file(file_path)
            for doc in docs:
                doc.metadata["source"] = str(file_path.absolute())
            all_docs.extend(docs)
        except Exception as e:
            print(f"Error loading {file_path}: {e}")
    
    if not all_docs:
        return {"added": 0, "deleted": 0, "message": "No documents to index"}
    
    # Recreate index and reindex
    try:
        create_index(es_client, "rag_documents", delete_if_exists=True)
        
        # Clear record manager
        import os
        if os.path.exists("record_manager.db"):
            os.remove("record_manager.db")
        
        result = index_documents(
            documents=all_docs,
            es_client=es_client,
            index_name="rag_documents",
            cleanup="full",
            embedding_client=embedding_client,
        )
        
        return {
            "added": result.num_added,
            "deleted": result.num_deleted,
            "skipped": result.num_skipped,
            "total_files": len(seen_files)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reindex failed: {str(e)}")


# Serve static files
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")


@app.get("/")
async def serve_frontend():
    """Serve the frontend HTML."""
    return FileResponse("frontend/index.html")
