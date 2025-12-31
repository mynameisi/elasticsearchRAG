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
from pydantic import BaseModel, validator
from elasticsearch import Elasticsearch

from src.index_mapping import get_elasticsearch_client
from src.volcengine_embedding import get_embedding_client, VolcengineEmbeddingClient
from src.document_loader import load_document, get_supported_extensions, SUPPORTED_EXTENSIONS
from src.qwen_client import QwenClient, get_qwen_client, ChatMessage as QwenChatMessage
from src.hybrid_search import get_context_for_rag, search_documents, bilingual_search


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
qwen_client: Optional[QwenClient] = None

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
    global es_client, embedding_client, qwen_client
    
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
    
    try:
        qwen_client = get_qwen_client()
    except ValueError:
        print("Warning: Qwen client not configured (missing DASHSCOPE_API_KEY)")
        qwen_client = None


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
    Get full document content by source path. Supports MD, PDF, DOCX.
    """
    try:
        # Security: only allow files within current directory
        file_path = Path(source)
        
        # Try to resolve relative to current working directory
        if not file_path.is_absolute():
            file_path = Path.cwd() / file_path
        
        # Check if file exists
        if not file_path.exists():
            # Try just the filename in current directory
            file_path = Path.cwd() / file_path.name
        
        # Also check docs directory
        if not file_path.exists():
            file_path = DOCS_DIR / Path(source).name
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Document not found")
        
        suffix = file_path.suffix.lower()
        
        if suffix not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type. Supported: {', '.join(SUPPORTED_EXTENSIONS)}"
            )
        
        # Read content based on file type
        if suffix == ".md":
            content = file_path.read_text(encoding='utf-8')
        elif suffix == ".pdf":
            from langchain_community.document_loaders import PyPDFLoader
            loader = PyPDFLoader(str(file_path))
            pages = loader.load()
            content_parts = []
            for i, page in enumerate(pages):
                content_parts.append(f"## Page {i + 1}\n\n{page.page_content}")
            content = "\n\n---\n\n".join(content_parts)
        elif suffix == ".docx":
            from langchain_community.document_loaders import Docx2txtLoader
            loader = Docx2txtLoader(str(file_path))
            docs = loader.load()
            content = "\n\n".join(doc.page_content for doc in docs)
        else:
            content = file_path.read_text(encoding='utf-8')
        
        return {
            "source": str(source),
            "content": content,
            "file_type": suffix[1:]
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
    file_type: str  # md, pdf, docx


class DocumentsResponse(BaseModel):
    documents: List[DocumentInfo]


@app.get("/api/documents", response_model=DocumentsResponse)
async def list_documents():
    """List all documents in the docs directory with their index status."""
    documents = []
    seen_files = set()
    
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
    
    # List all supported files in docs directory
    for ext in SUPPORTED_EXTENSIONS:
        for file_path in DOCS_DIR.glob(f"*{ext}"):
            if file_path.name not in seen_files:
                seen_files.add(file_path.name)
                documents.append(DocumentInfo(
                    filename=file_path.name,
                    size=file_path.stat().st_size,
                    chunks=chunk_counts.get(file_path.name, 0),
                    file_type=ext[1:]  # Remove the dot
                ))
    
    # Also check for supported files in root
    for ext in SUPPORTED_EXTENSIONS:
        for file_path in Path.cwd().glob(f"*{ext}"):
            if file_path.name not in seen_files:
                seen_files.add(file_path.name)
                documents.append(DocumentInfo(
                    filename=file_path.name,
                    size=file_path.stat().st_size,
                    chunks=chunk_counts.get(file_path.name, 0),
                    file_type=ext[1:]  # Remove the dot
                ))
    
    # Sort by filename
    documents.sort(key=lambda d: d.filename.lower())
    
    return DocumentsResponse(documents=documents)


@app.get("/api/documents/{filename}")
async def get_document_by_name(filename: str):
    """Get document content by filename. Returns text content for all supported types."""
    # Check docs directory first
    file_path = DOCS_DIR / filename
    if not file_path.exists():
        # Check root directory
        file_path = Path.cwd() / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document not found")
    
    suffix = file_path.suffix.lower()
    
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file type. Supported: {', '.join(SUPPORTED_EXTENSIONS)}"
        )
    
    file_type = suffix[1:]  # Remove the dot
    
    try:
        if suffix == ".md":
            content = file_path.read_text(encoding='utf-8')
        elif suffix == ".pdf":
            from langchain_community.document_loaders import PyPDFLoader
            loader = PyPDFLoader(str(file_path))
            pages = loader.load()
            # Combine all pages with page markers
            content_parts = []
            for i, page in enumerate(pages):
                content_parts.append(f"## Page {i + 1}\n\n{page.page_content}")
            content = "\n\n---\n\n".join(content_parts)
        elif suffix == ".docx":
            from langchain_community.document_loaders import Docx2txtLoader
            loader = Docx2txtLoader(str(file_path))
            docs = loader.load()
            content = "\n\n".join(doc.page_content for doc in docs)
        else:
            content = file_path.read_text(encoding='utf-8')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading document: {str(e)}")
    
    return {
        "filename": filename,
        "content": content,
        "size": file_path.stat().st_size,
        "file_type": file_type
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


@app.get("/api/documents/{filename}/raw")
async def get_document_raw(filename: str):
    """Serve the raw document file for native viewing (PDF, DOCX)."""
    # Check docs directory first
    file_path = DOCS_DIR / filename
    if not file_path.exists():
        # Check root directory
        file_path = Path.cwd() / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document not found")
    
    suffix = file_path.suffix.lower()
    
    # Set appropriate content type
    content_types = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".md": "text/markdown",
    }
    
    content_type = content_types.get(suffix, "application/octet-stream")
    
    return FileResponse(
        path=file_path,
        media_type=content_type,
        filename=filename
    )


@app.post("/api/documents/upload")
async def upload_documents(files: List[UploadFile] = File(...)):
    """Upload documents (MD, PDF, DOCX)."""
    uploaded = 0
    errors = []
    
    # Build list of valid extensions
    valid_extensions = tuple(SUPPORTED_EXTENSIONS) + ('.markdown', '.txt')
    
    for file in files:
        if not file.filename:
            continue
            
        # Validate file type
        if not file.filename.lower().endswith(valid_extensions):
            errors.append(f"{file.filename}: Invalid file type. Supported: {', '.join(SUPPORTED_EXTENSIONS)}")
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
    """Reindex all documents in the docs directory (MD, PDF, DOCX)."""
    if es_client is None:
        raise HTTPException(status_code=503, detail="Elasticsearch not available")
    
    from src.document_indexer import index_documents
    from src.index_mapping import create_index
    
    # Collect all supported files
    all_docs = []
    seen_files = set()
    
    # Gather files from docs directory and root
    for ext in SUPPORTED_EXTENSIONS:
        for file_path in list(DOCS_DIR.glob(f"*{ext}")) + list(Path.cwd().glob(f"*{ext}")):
            if file_path.name in seen_files:
                continue
            seen_files.add(file_path.name)
            
            try:
                docs = load_document(file_path)
                all_docs.extend(docs)
                print(f"Loaded {len(docs)} chunks from {file_path.name}")
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


# ==========================================
# Chat API Endpoints
# ==========================================

class ChatHistoryItem(BaseModel):
    """A single message in chat history."""
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    """Request for chat endpoint."""
    message: str
    history: List[ChatHistoryItem] = []
    use_rag: bool = True
    
    @validator('message')
    def validate_message(cls, v):
        """Validate that message is not empty."""
        if not v or not v.strip():
            raise ValueError("Message cannot be empty")
        return v


class ChatSource(BaseModel):
    """Source document used in RAG."""
    source: str
    title: str
    content: str
    score: Optional[float] = None


class ChatResponse(BaseModel):
    """Response from chat endpoint."""
    response: str
    sources: List[ChatSource] = []
    model: str


RAG_SYSTEM_PROMPT = """You are a bilingual assistant (English/Chinese) that answers questions based on the provided context from our knowledge base.

IMPORTANT RULES:
1. Use ALL provided context to answer, regardless of the language it's written in (Chinese or English)
2. ALWAYS respond in the SAME LANGUAGE as the user's question:
   - If the user asks in English, respond in English
   - If the user asks in Chinese (中文), respond in Chinese (中文)
3. Synthesize information from both Chinese and English sources when relevant
4. If the context contains relevant information in a different language than the question, translate and include it in your response
5. Cite specific sources when possible

Context from knowledge base (may contain both English and Chinese content):
{context}

Remember: Use ALL relevant context above regardless of language. Respond in the user's language.
If the answer cannot be found in the context, acknowledge this and try to help based on general knowledge while noting that the information is not from the knowledge base."""


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat with AI using RAG (Retrieval Augmented Generation).
    
    Retrieves relevant context from Elasticsearch and sends it to Qwen
    for generating contextual responses.
    """
    if qwen_client is None:
        raise HTTPException(
            status_code=503,
            detail="Qwen client not available (missing DASHSCOPE_API_KEY)"
        )
    
    # Build messages for Qwen
    messages = []
    context = ""
    sources = []
    
    # Get RAG context if enabled
    if request.use_rag and es_client is not None and embedding_client is not None:
        try:
            # Get context from documents (bilingual search for cross-language coverage)
            context = get_context_for_rag(
                es_client=es_client,
                index_name="rag_documents",
                query=request.message,
                embedding_client=embedding_client,
                top_k=5,
                bilingual=True,
            )
            
            # Get source documents for citation (bilingual search)
            search_results = bilingual_search(
                es_client=es_client,
                index_name="rag_documents",
                query=request.message,
                embedding_client=embedding_client,
                top_k=5,
            )
            
            sources = [
                ChatSource(
                    source=result.metadata.get("source", "unknown"),
                    title=result.metadata.get("source_filename", "Document"),
                    content=result.content[:200] + "..." if len(result.content) > 200 else result.content,
                    score=result.score,
                )
                for result in search_results
            ]
            
            # Add system prompt with context
            if context:
                messages.append(QwenChatMessage(
                    role="system",
                    content=RAG_SYSTEM_PROMPT.format(context=context)
                ))
        except Exception as e:
            print(f"RAG context retrieval failed: {e}")
            # Continue without RAG context
    
    # Add conversation history
    for hist_item in request.history:
        messages.append(QwenChatMessage(
            role=hist_item.role,
            content=hist_item.content
        ))
    
    # Add current user message
    messages.append(QwenChatMessage(
        role="user",
        content=request.message
    ))
    
    # Get response from Qwen
    try:
        qwen_response = qwen_client.chat(messages)
        return ChatResponse(
            response=qwen_response.content,
            sources=sources,
            model=qwen_response.model or "qwen-turbo"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Chat failed: {str(e)}"
        )


from fastapi.responses import StreamingResponse


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Stream chat responses using Server-Sent Events (SSE).
    
    Same as /api/chat but streams the response in real-time.
    """
    if qwen_client is None:
        raise HTTPException(
            status_code=503,
            detail="Qwen client not available (missing DASHSCOPE_API_KEY)"
        )
    
    # Build messages (same as non-streaming)
    messages = []
    context = ""
    sources = []
    
    if request.use_rag and es_client is not None and embedding_client is not None:
        try:
            # Bilingual search for cross-language coverage
            context = get_context_for_rag(
                es_client=es_client,
                index_name="rag_documents",
                query=request.message,
                embedding_client=embedding_client,
                top_k=5,
                bilingual=True,
            )
            
            search_results = bilingual_search(
                es_client=es_client,
                index_name="rag_documents",
                query=request.message,
                embedding_client=embedding_client,
                top_k=5,
            )
            
            sources = [
                ChatSource(
                    source=result.metadata.get("source", "unknown"),
                    title=result.metadata.get("source_filename", "Document"),
                    content=result.content[:200] + "..." if len(result.content) > 200 else result.content,
                    score=result.score,
                )
                for result in search_results
            ]
            
            if context:
                messages.append(QwenChatMessage(
                    role="system",
                    content=RAG_SYSTEM_PROMPT.format(context=context)
                ))
        except Exception as e:
            print(f"RAG context retrieval failed: {e}")
    
    for hist_item in request.history:
        messages.append(QwenChatMessage(
            role=hist_item.role,
            content=hist_item.content
        ))
    
    messages.append(QwenChatMessage(
        role="user",
        content=request.message
    ))
    
    def generate():
        """Generator for SSE streaming."""
        try:
            # Send sources first as JSON
            import json
            yield f"data: {json.dumps({'type': 'sources', 'sources': [s.dict() for s in sources]})}\n\n"
            
            # Stream response chunks
            for chunk in qwen_client.chat_stream(messages):
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
            
            # Send done signal
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.get("/")
async def serve_frontend():
    """Serve the frontend HTML."""
    return FileResponse("frontend/index.html")
