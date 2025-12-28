"""
Document Indexer Module

This module provides functions to index documents into Elasticsearch
with deduplication support using LangChain's SQLRecordManager and ElasticsearchStore.

Requirements:
- 4.2: Compute hash values for deduplication using SQLRecordManager
- 4.3: Use ElasticsearchStore with SparseVectorStrategy
- 4.4: Support cleanup="full" mode for consistency
"""

from dataclasses import dataclass
from pathlib import Path
from typing import List, Literal, Optional

from elasticsearch import Elasticsearch
from langchain_core.documents import Document
from langchain_core.indexing import index
from langchain_core.indexing.api import IndexingResult
from langchain_elasticsearch import ElasticsearchStore, SparseVectorStrategy
from langchain_community.indexes import SQLRecordManager


@dataclass
class IndexResult:
    """Result of an indexing operation."""
    num_added: int
    num_updated: int
    num_skipped: int
    num_deleted: int


def create_record_manager(
    namespace: str,
    db_url: str = "sqlite:///record_manager.db",
) -> SQLRecordManager:
    """
    Create a SQLRecordManager for tracking indexed documents.
    
    The record manager uses hash-based deduplication to track which
    documents have been indexed and avoid re-indexing unchanged documents.
    
    Args:
        namespace: Namespace for the record manager (e.g., "elasticsearch/my_index")
        db_url: SQLAlchemy database URL for storing records
        
    Returns:
        Configured SQLRecordManager instance with schema created
    """
    record_manager = SQLRecordManager(
        namespace=namespace,
        db_url=db_url,
    )
    record_manager.create_schema()
    return record_manager


def create_elasticsearch_store(
    es_client: Elasticsearch,
    index_name: str,
    query_field: str = "content",
) -> ElasticsearchStore:
    """
    Create an ElasticsearchStore with SparseVectorStrategy.
    
    Args:
        es_client: Elasticsearch client instance
        index_name: Name of the Elasticsearch index
        query_field: Field name for text content (default: "content")
        
    Returns:
        Configured ElasticsearchStore instance
    """
    return ElasticsearchStore(
        es_connection=es_client,
        index_name=index_name,
        query_field=query_field,
        strategy=SparseVectorStrategy(),
    )


def index_documents(
    documents: List[Document],
    es_client: Elasticsearch,
    index_name: str,
    record_manager_db_url: str = "sqlite:///record_manager.db",
    cleanup: Literal["incremental", "full", None] = "full",
    source_id_key: Optional[str] = None,
) -> IndexResult:
    """
    Index documents into Elasticsearch with deduplication.
    
    This function uses SQLRecordManager for hash-based deduplication
    and ElasticsearchStore with SparseVectorStrategy for storage.
    
    Args:
        documents: List of Document objects to index
        es_client: Elasticsearch client instance
        index_name: Name of the Elasticsearch index
        record_manager_db_url: SQLAlchemy database URL for record manager
        cleanup: Cleanup mode:
            - "incremental": Delete documents that are no longer in the source
            - "full": Delete all documents not in the current batch
            - None: No cleanup, only add new documents
        source_id_key: Optional metadata key to use as source ID
        
    Returns:
        IndexResult with counts of added, updated, skipped, and deleted documents
    """
    # Create namespace for record manager
    namespace = f"elasticsearch/{index_name}"
    
    # Create record manager
    record_manager = create_record_manager(
        namespace=namespace,
        db_url=record_manager_db_url,
    )
    
    # Create Elasticsearch store
    vector_store = create_elasticsearch_store(
        es_client=es_client,
        index_name=index_name,
    )
    
    # Index documents with deduplication
    result: IndexingResult = index(
        docs_source=documents,
        record_manager=record_manager,
        vector_store=vector_store,
        cleanup=cleanup,
        source_id_key=source_id_key,
    )
    
    return IndexResult(
        num_added=result.get("num_added", 0),
        num_updated=result.get("num_updated", 0),
        num_skipped=result.get("num_skipped", 0),
        num_deleted=result.get("num_deleted", 0),
    )


def index_documents_from_file(
    file_path: str | Path,
    es_client: Elasticsearch,
    index_name: str,
    record_manager_db_url: str = "sqlite:///record_manager.db",
    cleanup: Literal["incremental", "full", None] = "full",
) -> IndexResult:
    """
    Load a Markdown file and index its contents into Elasticsearch.
    
    This is a convenience function that combines loading, splitting,
    and indexing in one step.
    
    Args:
        file_path: Path to the Markdown file
        es_client: Elasticsearch client instance
        index_name: Name of the Elasticsearch index
        record_manager_db_url: SQLAlchemy database URL for record manager
        cleanup: Cleanup mode for deduplication
        
    Returns:
        IndexResult with counts of added, updated, skipped, and deleted documents
    """
    from src.markdown_loader import load_markdown_file
    
    # Load and split the Markdown file
    documents = load_markdown_file(file_path)
    
    # Add source file path to metadata
    file_path = Path(file_path)
    for doc in documents:
        doc.metadata["source"] = str(file_path.absolute())
    
    # Index documents
    return index_documents(
        documents=documents,
        es_client=es_client,
        index_name=index_name,
        record_manager_db_url=record_manager_db_url,
        cleanup=cleanup,
        source_id_key="source",
    )
