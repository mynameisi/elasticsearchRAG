"""
Volcengine (火山引擎) Ark Embedding Service Client

This module provides a client for the Volcengine Ark API
to generate text embeddings using Doubao embedding models.

API Documentation: https://www.volcengine.com/docs/6465/1263541
"""

import os
from typing import List, Optional

import requests


class VolcengineEmbeddingClient:
    """Client for Volcengine Ark Embedding API (OpenAI-compatible)."""
    
    DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
    MAX_BATCH_SIZE = 100
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint_id: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        """
        Initialize the Volcengine Ark Embedding client.
        
        Args:
            api_key: Ark API Key (or set ARK_API_KEY env var)
            endpoint_id: Embedding model endpoint ID (or set ARK_EMBEDDING_ENDPOINT env var)
            base_url: API base URL (default: https://ark.cn-beijing.volces.com/api/v3)
        """
        self.api_key = api_key or os.environ.get("ARK_API_KEY")
        self.endpoint_id = endpoint_id or os.environ.get("ARK_EMBEDDING_ENDPOINT")
        self.base_url = base_url or os.environ.get("ARK_BASE_URL", self.DEFAULT_BASE_URL)
        
        if not self.api_key:
            raise ValueError(
                "Ark API key required. Set ARK_API_KEY environment variable "
                "or pass api_key parameter."
            )
        
        if not self.endpoint_id:
            raise ValueError(
                "Embedding endpoint ID required. Set ARK_EMBEDDING_ENDPOINT environment variable "
                "or pass endpoint_id parameter."
            )
        
        # Will be set after first API call
        self._embedding_dimension: Optional[int] = None
    
    @property
    def embedding_dimension(self) -> int:
        """Get the embedding dimension (determined from first API call)."""
        if self._embedding_dimension is None:
            # Make a test call to determine dimension
            test_embedding = self.embed_text("test")
            self._embedding_dimension = len(test_embedding)
        return self._embedding_dimension
    
    def _make_request(self, texts: List[str]) -> List[List[float]]:
        """Make an embedding request to the Ark API."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.endpoint_id,
            "input": texts,
            "encoding_format": "float"
        }
        
        response = requests.post(
            f"{self.base_url}/embeddings",
            headers=headers,
            json=payload,
            timeout=60
        )
        
        if response.status_code != 200:
            raise RuntimeError(f"Ark API error: {response.status_code} - {response.text}")
        
        result = response.json()
        
        # Extract embeddings in order
        embeddings = [None] * len(texts)
        for item in result["data"]:
            embeddings[item["index"]] = item["embedding"]
        
        # Update dimension if not set
        if self._embedding_dimension is None and embeddings:
            self._embedding_dimension = len(embeddings[0])
        
        return embeddings
    
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of texts.
        
        Args:
            texts: List of text strings to embed (max 100 per batch)
            
        Returns:
            List of embedding vectors
            
        Raises:
            ValueError: If texts list is empty or exceeds max batch size
            RuntimeError: If API request fails
        """
        if not texts:
            return []
        
        if len(texts) > self.MAX_BATCH_SIZE:
            raise ValueError(f"Maximum batch size is {self.MAX_BATCH_SIZE}, got {len(texts)}")
        
        return self._make_request(texts)
    
    def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.
        
        Args:
            text: Text string to embed
            
        Returns:
            Embedding vector
        """
        embeddings = self.embed_texts([text])
        return embeddings[0] if embeddings else []
    
    def embed_documents(self, documents: List[str]) -> List[List[float]]:
        """
        Generate embeddings for documents, handling batching automatically.
        
        Args:
            documents: List of document texts
            
        Returns:
            List of embedding vectors
        """
        all_embeddings = []
        
        for i in range(0, len(documents), self.MAX_BATCH_SIZE):
            batch = documents[i:i + self.MAX_BATCH_SIZE]
            embeddings = self.embed_texts(batch)
            all_embeddings.extend(embeddings)
            
            # Progress indicator
            processed = min(i + self.MAX_BATCH_SIZE, len(documents))
            print(f"  Embedded {processed}/{len(documents)} documents")
        
        return all_embeddings
    
    def embed_query(self, query: str) -> List[float]:
        """
        Generate embedding for a search query.
        
        Args:
            query: Query text
            
        Returns:
            Embedding vector
        """
        return self.embed_text(query)


def get_embedding_client(
    api_key: Optional[str] = None,
    endpoint_id: Optional[str] = None,
    base_url: Optional[str] = None,
) -> VolcengineEmbeddingClient:
    """
    Factory function to create a Volcengine Ark Embedding client.
    
    Args:
        api_key: Optional Ark API key (defaults to ARK_API_KEY env var)
        endpoint_id: Optional endpoint ID (defaults to ARK_EMBEDDING_ENDPOINT env var)
        base_url: Optional API base URL
        
    Returns:
        Configured VolcengineEmbeddingClient instance
    """
    return VolcengineEmbeddingClient(
        api_key=api_key,
        endpoint_id=endpoint_id,
        base_url=base_url,
    )
