"""
Document Indexer Module

This module provides functions to index documents into Elasticsearch
with deduplication support using LangChain's SQLRecordManager.

Requirements:
- 4.2: Compute hash values for deduplication using SQLRecordManager
- 4.3: Index documents into Elasticsearch with semantic_text support
- 4.4: Support cleanup="full" mode for consistency
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Literal, Optional
import hashlib
import re

from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk
from langchain_core.documents import Document
from langchain_classic.indexes import SQLRecordManager


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


def _compute_doc_id(doc: Document) -> str:
    """Compute a unique ID for a document based on its content and metadata."""
    content = doc.page_content
    metadata_str = str(sorted(doc.metadata.items()))
    combined = f"{content}:{metadata_str}"
    return hashlib.sha256(combined.encode()).hexdigest()


def _enrich_metadata(doc: Document, source_file: Optional[Path] = None) -> dict:
    """
    Enrich document with additional metadata for analytics.
    
    Adds:
    - indexed_at: ISO timestamp
    - word_count: Number of words in content
    - char_count: Number of characters
    - has_code: Whether content contains code blocks
    - section_depth: Header depth (1, 2, or 3)
    - source_filename: Just the filename without path
    """
    content = doc.page_content
    
    # Calculate word count (handles both English and Chinese)
    # For Chinese, count characters; for English, count words
    english_words = len(re.findall(r'\b[a-zA-Z]+\b', content))
    chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', content))
    word_count = english_words + chinese_chars
    
    # Detect code blocks
    has_code = '```' in content or bool(re.search(r'`[^`]+`', content))
    
    # Determine section depth from headers
    section_depth = 0
    if doc.metadata.get('Header 3'):
        section_depth = 3
    elif doc.metadata.get('Header 2'):
        section_depth = 2
    elif doc.metadata.get('Header 1'):
        section_depth = 1
    
    # Extract filename from source
    source_filename = None
    if source_file:
        source_filename = source_file.name
    elif doc.metadata.get('source'):
        source_filename = Path(doc.metadata['source']).name
    
    return {
        'indexed_at': datetime.now(timezone.utc).isoformat(),
        'word_count': word_count,
        'char_count': len(content),
        'has_code': has_code,
        'section_depth': section_depth,
        'source_filename': source_filename,
    }


def index_documents(
    documents: List[Document],
    es_client: Elasticsearch,
    index_name: str,
    record_manager_db_url: str = "sqlite:///record_manager.db",
    cleanup: Literal["incremental", "full", None] = "full",
    source_id_key: Optional[str] = None,
    embedding_client: Optional[Any] = None,
) -> IndexResult:
    """
    Index documents into Elasticsearch with deduplication and optional embeddings.
    
    This function uses SQLRecordManager for hash-based deduplication
    and directly indexes into Elasticsearch using bulk API.
    
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
        embedding_client: Optional embedding client (e.g., VolcengineEmbeddingClient)
        
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
    
    # Prepare documents for indexing
    docs_to_index = []
    doc_ids = []
    num_skipped = 0
    
    for doc in documents:
        doc_id = _compute_doc_id(doc)
        doc_ids.append(doc_id)
        
        # Check if document already exists in record manager
        existing = record_manager.exists([doc_id])
        if existing and existing[0]:
            num_skipped += 1
            continue
        
        docs_to_index.append((doc_id, doc))
    
    num_added = 0
    
    # Generate embeddings if client is provided
    if docs_to_index and embedding_client:
        print(f"Generating embeddings for {len(docs_to_index)} documents...")
        texts = [doc.page_content for _, doc in docs_to_index]
        embeddings = embedding_client.embed_documents(texts)
        
        # Index documents with embeddings
        for i, (doc_id, doc) in enumerate(docs_to_index):
            try:
                # Enrich with analytics metadata
                enriched = _enrich_metadata(doc)
                
                es_doc = {
                    "content": doc.page_content,
                    "embedding": embeddings[i],
                    **doc.metadata,
                    **enriched,
                }
                es_client.index(
                    index=index_name,
                    id=doc_id,
                    document=es_doc,
                    refresh=False
                )
                num_added += 1
            except Exception as e:
                print(f"  Error indexing document: {e}")
    elif docs_to_index:
        # Index without embeddings
        for doc_id, doc in docs_to_index:
            try:
                # Enrich with analytics metadata
                enriched = _enrich_metadata(doc)
                
                es_doc = {
                    "content": doc.page_content,
                    **doc.metadata,
                    **enriched,
                }
                es_client.index(
                    index=index_name,
                    id=doc_id,
                    document=es_doc,
                    refresh=False
                )
                num_added += 1
            except Exception as e:
                print(f"  Error indexing document: {e}")
    
    if docs_to_index:
        # Refresh the index
        es_client.indices.refresh(index=index_name)
    
    # Update record manager
    if doc_ids:
        record_manager.update(doc_ids)
    
    # Handle cleanup
    num_deleted = 0
    if cleanup == "full":
        # Get all doc IDs from record manager
        all_doc_ids = record_manager.list_keys()
        # Delete documents not in current batch
        to_delete = set(all_doc_ids) - set(doc_ids)
        if to_delete:
            for doc_id in to_delete:
                try:
                    es_client.delete(index=index_name, id=doc_id, ignore=[404])
                    num_deleted += 1
                except Exception:
                    pass
            # Clean up record manager
            record_manager.delete_keys(list(to_delete))
    
    return IndexResult(
        num_added=num_added,
        num_updated=0,
        num_skipped=num_skipped,
        num_deleted=num_deleted,
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
