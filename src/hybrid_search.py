"""
Hybrid Search Module

This module provides functions for performing hybrid search combining
semantic search (kNN) and full-text search using Elasticsearch's RRF (Reciprocal Rank Fusion).

Requirements:
- 5.1: Perform both semantic search on embedding field and full-text search on content field
- 5.2: Use RRF (Reciprocal Rank Fusion) to merge rankings from both search methods
- 5.3: Exclude the embedding field from the response to reduce payload size
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from elasticsearch import Elasticsearch


@dataclass
class SearchResult:
    """A single search result with content and metadata."""
    content: str
    metadata: Dict[str, Any]
    score: Optional[float] = None


def build_rrf_hybrid_query(
    query_text: str,
    query_vector: Optional[List[float]] = None,
    content_field: str = "content",
    embedding_field: str = "embedding",
    size: int = 10,
    rrf_rank_constant: int = 60,
    rrf_window_size: int = 100,
) -> Dict[str, Any]:
    """
    Build a hybrid search query using RRF (Reciprocal Rank Fusion).
    
    When query_vector is provided, performs true hybrid search combining:
    - kNN vector search on the embedding field
    - Full-text BM25 search on the content field
    
    When query_vector is None, falls back to full-text search only.
    
    Args:
        query_text: The search query string
        query_vector: Optional embedding vector for kNN search
        content_field: Field name for full-text search (default: "content")
        embedding_field: Field name for vector search (default: "embedding")
        size: Maximum number of results to return (default: 10)
        rrf_rank_constant: RRF ranking constant k (default: 60)
        rrf_window_size: Window size for RRF (default: 100)
        
    Returns:
        Dict containing the Elasticsearch query body
    """
    if query_vector is None:
        # Fall back to full-text search only
        return {
            "size": size,
            "query": {
                "match": {
                    content_field: query_text
                }
            },
            "_source": {"excludes": [embedding_field]}
        }
    
    # True hybrid search with RRF
    return {
        "size": size,
        "query": {
            "match": {
                content_field: query_text
            }
        },
        "knn": {
            "field": embedding_field,
            "query_vector": query_vector,
            "k": size,
            "num_candidates": rrf_window_size
        },
        "rank": {
            "rrf": {
                "rank_constant": rrf_rank_constant,
                "rank_window_size": rrf_window_size
            }
        },
        "_source": {"excludes": [embedding_field]}
    }


def hybrid_search(
    es_client: Elasticsearch,
    index_name: str,
    query_text: str,
    query_vector: Optional[List[float]] = None,
    content_field: str = "content",
    embedding_field: str = "embedding",
    size: int = 10,
) -> List[SearchResult]:
    """
    Perform hybrid search combining semantic and full-text search.
    
    This function executes an RRF hybrid search query against Elasticsearch
    and returns formatted results with content and metadata.
    
    Args:
        es_client: Elasticsearch client instance
        index_name: Name of the Elasticsearch index to search
        query_text: The search query string
        query_vector: Optional embedding vector for kNN search
        content_field: Field name for full-text search (default: "content")
        embedding_field: Field name for vector search (default: "embedding")
        size: Maximum number of results to return (default: 10)
        
    Returns:
        List of SearchResult objects containing content and metadata
    """
    query = build_rrf_hybrid_query(
        query_text=query_text,
        query_vector=query_vector,
        content_field=content_field,
        embedding_field=embedding_field,
        size=size,
    )
    
    response = es_client.search(index=index_name, body=query)
    
    results = []
    for hit in response.get("hits", {}).get("hits", []):
        source = hit.get("_source", {})
        
        # Extract content from the content field
        content = source.get(content_field, "")
        
        # Build metadata from remaining fields (excluding embedding)
        metadata = {k: v for k, v in source.items() if k not in (content_field, embedding_field)}
        metadata["_id"] = hit.get("_id")
        metadata["_index"] = hit.get("_index")
        
        # Get score if available
        score = hit.get("_score")
        
        results.append(SearchResult(
            content=content,
            metadata=metadata,
            score=score,
        ))
    
    return results


def custom_query_for_langchain(
    query_text: str,
    query_vector: Optional[List[float]] = None,
    content_field: str = "content",
    embedding_field: str = "embedding",
) -> Dict[str, Any]:
    """
    Create a custom query function for use with LangChain's ElasticsearchStore.
    
    This function returns a query body that can be used with
    ElasticsearchStore.similarity_search() via the custom_query parameter.
    
    Args:
        query_text: The search query string
        query_vector: Optional embedding vector for kNN search
        content_field: Field name for full-text search (default: "content")
        embedding_field: Field name for vector search (default: "embedding")
        
    Returns:
        Dict containing the custom query body for ElasticsearchStore
    """
    return build_rrf_hybrid_query(
        query_text=query_text,
        query_vector=query_vector,
        content_field=content_field,
        embedding_field=embedding_field,
    )


def search_with_langchain_store(
    es_client: Elasticsearch,
    index_name: str,
    query_text: str,
    query_vector: Optional[List[float]] = None,
    content_field: str = "content",
    embedding_field: str = "embedding",
    k: int = 10,
) -> List[SearchResult]:
    """
    Perform hybrid search using LangChain's ElasticsearchStore with custom query.
    
    This is a wrapper around ElasticsearchStore.similarity_search that uses
    the RRF hybrid query for combining semantic and full-text search.
    
    Args:
        es_client: Elasticsearch client instance
        index_name: Name of the Elasticsearch index to search
        query_text: The search query string
        query_vector: Optional embedding vector for kNN search
        content_field: Field name for full-text search (default: "content")
        embedding_field: Field name for vector search (default: "embedding")
        k: Maximum number of results to return (default: 10)
        
    Returns:
        List of SearchResult objects containing content and metadata
    """
    # Build custom query
    custom_query = build_rrf_hybrid_query(
        query_text=query_text,
        query_vector=query_vector,
        content_field=content_field,
        embedding_field=embedding_field,
        size=k,
    )
    
    # Execute search with custom query
    response = es_client.search(index=index_name, body=custom_query)
    
    results = []
    for hit in response.get("hits", {}).get("hits", []):
        source = hit.get("_source", {})
        
        content = source.get(content_field, "")
        metadata = {k: v for k, v in source.items() if k not in (content_field, embedding_field)}
        metadata["_id"] = hit.get("_id")
        metadata["_index"] = hit.get("_index")
        
        score = hit.get("_score")
        
        results.append(SearchResult(
            content=content,
            metadata=metadata,
            score=score,
        ))
    
    return results



def format_search_results(results: List[SearchResult]) -> str:
    """
    Format search results as a human-readable string.
    
    Args:
        results: List of SearchResult objects
        
    Returns:
        Formatted string representation of the results
    """
    if not results:
        return "No results found."
    
    formatted = []
    for i, result in enumerate(results, 1):
        formatted.append(f"--- Result {i} ---")
        formatted.append(f"Content: {result.content[:200]}..." if len(result.content) > 200 else f"Content: {result.content}")
        if result.score is not None:
            formatted.append(f"Score: {result.score}")
        if result.metadata:
            meta_str = ", ".join(f"{k}: {v}" for k, v in result.metadata.items() if not k.startswith("_"))
            if meta_str:
                formatted.append(f"Metadata: {meta_str}")
        formatted.append("")
    
    return "\n".join(formatted)


def search_documents(
    es_client: Elasticsearch,
    index_name: str,
    query: str,
    embedding_client: Optional[Any] = None,
    top_k: int = 5,
) -> List[SearchResult]:
    """
    High-level search function for RAG applications.
    
    This is the main entry point for searching documents. It performs
    hybrid search combining semantic and full-text search using RRF.
    
    Args:
        es_client: Elasticsearch client instance
        index_name: Name of the Elasticsearch index to search
        query: The search query string
        embedding_client: Optional embedding client for vector search
        top_k: Number of top results to return (default: 5)
        
    Returns:
        List of SearchResult objects containing content and metadata
        
    Example:
        >>> from src.index_mapping import get_elasticsearch_client
        >>> from src.volcengine_embedding import get_embedding_client
        >>> es = get_elasticsearch_client()
        >>> emb = get_embedding_client()  # Optional, for hybrid search
        >>> results = search_documents(es, "my_index", "What is the vacation policy?", emb)
        >>> for r in results:
        ...     print(r.content)
    """
    query_vector = None
    if embedding_client is not None:
        query_vector = embedding_client.embed_query(query)
    
    return hybrid_search(
        es_client=es_client,
        index_name=index_name,
        query_text=query,
        query_vector=query_vector,
        size=top_k,
    )


def get_context_for_rag(
    es_client: Elasticsearch,
    index_name: str,
    query: str,
    embedding_client: Optional[Any] = None,
    top_k: int = 3,
    separator: str = "\n\n---\n\n",
) -> str:
    """
    Get concatenated context from search results for RAG prompts.
    
    This function retrieves relevant documents and concatenates their
    content into a single string suitable for use as context in LLM prompts.
    
    Args:
        es_client: Elasticsearch client instance
        index_name: Name of the Elasticsearch index to search
        query: The search query string
        embedding_client: Optional embedding client for vector search
        top_k: Number of top results to include (default: 3)
        separator: String to use between document contents (default: newlines with separator)
        
    Returns:
        Concatenated content from top search results
        
    Example:
        >>> context = get_context_for_rag(es, "my_index", "vacation policy", emb)
        >>> prompt = f"Based on the following context:\\n{context}\\n\\nAnswer: {question}"
    """
    results = search_documents(
        es_client=es_client,
        index_name=index_name,
        query=query,
        embedding_client=embedding_client,
        top_k=top_k,
    )
    
    if not results:
        return ""
    
    return separator.join(r.content for r in results if r.content)
