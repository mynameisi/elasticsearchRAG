"""
Search API Module

FastAPI backend for the RAG search interface with highlighting support.
"""

import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
load_dotenv()  # Load .env file

from fastapi import FastAPI, HTTPException, Query
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
    from pathlib import Path
    
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


# Serve static files
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")


@app.get("/")
async def serve_frontend():
    """Serve the frontend HTML."""
    return FileResponse("frontend/index.html")
