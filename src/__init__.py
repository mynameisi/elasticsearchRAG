# RAG Application with LangChain, Higress, and Elasticsearch
"""
This package provides document processing, indexing, and search capabilities
for building RAG applications using Elasticsearch as the vector store.
"""

__version__ = "0.1.0"

from src.index_mapping import (
    create_index,
    ensure_index_exists,
    get_elasticsearch_client,
    get_index_info,
    get_index_mapping,
)
from src.markdown_loader import (
    DEFAULT_HEADERS_TO_SPLIT_ON,
    get_markdown_splitter,
    load_markdown_file,
    split_markdown_text,
)
from src.document_indexer import (
    IndexResult,
    create_record_manager,
    index_documents,
    index_documents_from_file,
)
from src.volcengine_embedding import (
    VolcengineEmbeddingClient,
    get_embedding_client,
)
from src.hybrid_search import (
    SearchResult,
    hybrid_search,
    search_documents,
    get_context_for_rag,
)

__all__ = [
    # Index mapping
    "create_index",
    "ensure_index_exists",
    "get_elasticsearch_client",
    "get_index_info",
    "get_index_mapping",
    # Markdown loader
    "DEFAULT_HEADERS_TO_SPLIT_ON",
    "get_markdown_splitter",
    "load_markdown_file",
    "split_markdown_text",
    # Document indexer
    "IndexResult",
    "create_record_manager",
    "index_documents",
    "index_documents_from_file",
    # Volcengine embedding
    "VolcengineEmbeddingClient",
    "get_embedding_client",
    # Hybrid search
    "SearchResult",
    "hybrid_search",
    "search_documents",
    "get_context_for_rag",
]
