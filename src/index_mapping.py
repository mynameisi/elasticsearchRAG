"""
Elasticsearch Index Mapping Module

This module provides functions to create and manage Elasticsearch indices
with proper mappings for RAG applications using semantic_text and content fields.

Requirements:
- 3.1: Define a semantic_text field for sparse vector storage
- 3.2: Define a content field of type text for full-text search
- 3.3: Configure copy_to for automatic field population
"""

from typing import Any, Dict, Optional

from elasticsearch import Elasticsearch


def get_index_mapping() -> Dict[str, Any]:
    """
    Get the index mapping configuration for RAG documents.
    
    The mapping includes:
    - content: A text field for full-text search
    - embedding: A dense_vector field for semantic search (2560 dimensions for Doubao)
    - Analytics fields: indexed_at, word_count, char_count, has_code, section_depth
    
    Returns:
        Dict containing the Elasticsearch index mapping configuration
    """
    return {
        "mappings": {
            "properties": {
                "content": {
                    "type": "text"
                },
                "embedding": {
                    "type": "dense_vector",
                    "dims": 2560,
                    "index": True,
                    "similarity": "cosine"
                },
                # Analytics fields
                "indexed_at": {
                    "type": "date"
                },
                "word_count": {
                    "type": "integer"
                },
                "char_count": {
                    "type": "integer"
                },
                "has_code": {
                    "type": "boolean"
                },
                "section_depth": {
                    "type": "integer"
                },
                "source_filename": {
                    "type": "keyword"
                },
                # Header fields as keywords for aggregations
                "Header 1": {
                    "type": "keyword"
                },
                "Header 2": {
                    "type": "keyword"
                },
                "Header 3": {
                    "type": "keyword"
                },
                "source": {
                    "type": "keyword"
                }
            }
        }
    }


def create_index(
    es_client: Elasticsearch,
    index_name: str,
    delete_if_exists: bool = False
) -> bool:
    """
    Create an Elasticsearch index with the RAG document mapping.
    
    Args:
        es_client: Elasticsearch client instance
        index_name: Name of the index to create
        delete_if_exists: If True, delete existing index before creating
        
    Returns:
        True if index was created successfully, False if it already exists
        
    Raises:
        elasticsearch.exceptions.ElasticsearchException: If index creation fails
    """
    # Check if index already exists
    if es_client.indices.exists(index=index_name):
        if delete_if_exists:
            es_client.indices.delete(index=index_name)
        else:
            return False
    
    # Create index with mapping
    mapping = get_index_mapping()
    es_client.indices.create(index=index_name, body=mapping)
    
    return True


def get_elasticsearch_client(
    host: str = "localhost",
    port: int = 9200,
    username: str = "elastic",
    password: str = "test123",
    scheme: str = "http",
    verify_certs: bool = False,
    ca_certs: Optional[str] = None
) -> Elasticsearch:
    """
    Create and return an Elasticsearch client instance.
    
    Args:
        host: Elasticsearch host address
        port: Elasticsearch port
        username: Authentication username
        password: Authentication password
        scheme: Connection scheme (http or https)
        verify_certs: Whether to verify SSL certificates
        ca_certs: Path to CA certificates file
        
    Returns:
        Configured Elasticsearch client instance
    """
    es_url = f"{scheme}://{host}:{port}"
    
    client_kwargs = {
        "hosts": [es_url],
        "basic_auth": (username, password),
        "verify_certs": verify_certs,
    }
    
    if ca_certs:
        client_kwargs["ca_certs"] = ca_certs
    
    return Elasticsearch(**client_kwargs)


def ensure_index_exists(
    es_client: Elasticsearch,
    index_name: str
) -> bool:
    """
    Ensure an index exists, creating it if necessary.
    
    Args:
        es_client: Elasticsearch client instance
        index_name: Name of the index to ensure exists
        
    Returns:
        True if index exists or was created, False otherwise
    """
    if es_client.indices.exists(index=index_name):
        return True
    
    return create_index(es_client, index_name)


def get_index_info(
    es_client: Elasticsearch,
    index_name: str
) -> Optional[Dict[str, Any]]:
    """
    Get information about an existing index.
    
    Args:
        es_client: Elasticsearch client instance
        index_name: Name of the index to query
        
    Returns:
        Index information dict if exists, None otherwise
    """
    if not es_client.indices.exists(index=index_name):
        return None
    
    return es_client.indices.get(index=index_name)
