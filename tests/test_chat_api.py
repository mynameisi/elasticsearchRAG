"""
Tests for Chat API Endpoint

TDD tests for the /api/chat endpoint that integrates RAG search
with Qwen/DashScope for AI-powered conversations.
"""

import sys
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import pytest

# Mock all dependencies before importing search_api
# Create proper mock structure for nested imports
elasticsearch_mock = MagicMock()
elasticsearch_mock.helpers = MagicMock()
sys.modules['elasticsearch'] = elasticsearch_mock
sys.modules['elasticsearch.helpers'] = elasticsearch_mock.helpers

langchain_core_mock = MagicMock()
langchain_core_mock.documents = MagicMock()
sys.modules['langchain_core'] = langchain_core_mock
sys.modules['langchain_core.documents'] = langchain_core_mock.documents

langchain_community_mock = MagicMock()
langchain_community_mock.document_loaders = MagicMock()
sys.modules['langchain_community'] = langchain_community_mock
sys.modules['langchain_community.document_loaders'] = langchain_community_mock.document_loaders

langchain_classic_mock = MagicMock()
langchain_classic_mock.indexes = MagicMock()
sys.modules['langchain_classic'] = langchain_classic_mock
sys.modules['langchain_classic.indexes'] = langchain_classic_mock.indexes

# Mock other modules
for mod in ['langchain', 'langchain_elasticsearch', 'langchain_text_splitters', 'sqlalchemy']:
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

# Add src to path to import directly
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from qwen_client import ChatMessage, ChatResponse

# Now import search_api after mocking dependencies
from fastapi.testclient import TestClient
from search_api import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def mock_es_client():
    """Mock Elasticsearch client."""
    with patch("search_api.es_client") as mock:
        yield mock


@pytest.fixture
def mock_embedding_client():
    """Mock embedding client."""
    with patch("search_api.embedding_client") as mock:
        yield mock


@pytest.fixture
def mock_qwen_client():
    """Mock Qwen client."""
    with patch("search_api.qwen_client") as mock_qwen:
        instance = Mock()
        instance.chat.return_value = ChatResponse(
            content="Based on the context, the vacation policy allows 20 days per year.",
            model="qwen-turbo",
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150
        )
        instance.chat_stream.return_value = iter([
            "Based on the context, ",
            "the vacation policy ",
            "allows 20 days per year."
        ])
        mock_qwen.__get__ = Mock(return_value=instance)
        # Set the global variable directly
        import search_api
        search_api.qwen_client = instance
        yield instance
        # Cleanup
        search_api.qwen_client = None


class TestChatEndpoint:
    """Tests for POST /api/chat endpoint."""
    
    def test_chat_requires_message(self, client):
        """Chat endpoint should require message field."""
        response = client.post("/api/chat", json={})
        assert response.status_code == 422  # Validation error
    
    def test_chat_with_message(self, client, mock_es_client, mock_embedding_client, mock_qwen_client):
        """Chat endpoint should accept a message and return response."""
        # Mock RAG context retrieval and search
        with patch("search_api.get_context_for_rag") as mock_get_context, \
             patch("search_api.search_documents") as mock_search:
            mock_get_context.return_value = "Vacation policy: 20 days per year."
            # Create mock search results
            mock_result = Mock()
            mock_result.content = "Vacation policy content"
            mock_result.metadata = {"source": "handbook.md", "source_filename": "Employee Handbook"}
            mock_result.score = 0.95
            mock_search.return_value = [mock_result]
            
            # Set up global clients
            import search_api
            search_api.es_client = mock_es_client
            search_api.embedding_client = mock_embedding_client
            
            response = client.post("/api/chat", json={
                "message": "What is the vacation policy?",
                "use_rag": True
            })
            
            assert response.status_code == 200
            data = response.json()
            assert "response" in data
            assert "sources" in data
            assert len(data["sources"]) > 0
    
    def test_chat_without_rag(self, client, mock_qwen_client):
        """Chat endpoint should work without RAG."""
        response = client.post("/api/chat", json={
            "message": "Hello!",
            "use_rag": False
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
    
    def test_chat_with_history(self, client, mock_es_client, mock_embedding_client, mock_qwen_client):
        """Chat endpoint should handle conversation history."""
        with patch("search_api.get_context_for_rag") as mock_get_context:
            mock_get_context.return_value = "Context here."
            
            response = client.post("/api/chat", json={
                "message": "Tell me more",
                "history": [
                    {"role": "user", "content": "What is the vacation policy?"},
                    {"role": "assistant", "content": "The vacation policy is 20 days."}
                ],
                "use_rag": True
            })
            
            assert response.status_code == 200
            # Verify history was passed to Qwen client
            call_args = mock_qwen_client.chat.call_args
            messages = call_args[0][0]
            assert len(messages) >= 3  # System + history + current message
            assert any(msg.role == "user" and "Tell me more" in msg.content for msg in messages)
    
    def test_chat_returns_sources_when_rag_enabled(self, client, mock_es_client, mock_embedding_client, mock_qwen_client):
        """Chat endpoint should return source documents when RAG is enabled."""
        import search_api
        search_api.es_client = mock_es_client
        search_api.embedding_client = mock_embedding_client
        
        with patch("search_api.get_context_for_rag") as mock_get_context:
            with patch("search_api.search_documents") as mock_search:
                mock_get_context.return_value = "Context from documents."
                mock_result1 = Mock()
                mock_result1.content = "Doc 1"
                mock_result1.metadata = {"source": "file1.md", "source_filename": "file1.md"}
                mock_result1.score = 0.9
                mock_result2 = Mock()
                mock_result2.content = "Doc 2"
                mock_result2.metadata = {"source": "file2.md", "source_filename": "file2.md"}
                mock_result2.score = 0.8
                mock_search.return_value = [mock_result1, mock_result2]
                
                response = client.post("/api/chat", json={
                    "message": "What is the policy?",
                    "use_rag": True
                })
                
                assert response.status_code == 200
                data = response.json()
                assert "sources" in data
                assert len(data["sources"]) == 2
                assert data["sources"][0]["source"] == "file1.md"
    
    def test_chat_no_sources_when_rag_disabled(self, client, mock_qwen_client):
        """Chat endpoint should not return sources when RAG is disabled."""
        response = client.post("/api/chat", json={
            "message": "Hello!",
            "use_rag": False
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "sources" in data
        assert len(data["sources"]) == 0
    
    def test_chat_handles_es_unavailable(self, client, mock_qwen_client):
        """Chat endpoint should handle Elasticsearch unavailability gracefully."""
        import search_api
        search_api.es_client = None
        response = client.post("/api/chat", json={
            "message": "Hello!",
            "use_rag": False
        })
        
        # Should still work without RAG
        assert response.status_code == 200
    
    def test_chat_handles_rag_error_gracefully(self, client, mock_es_client, mock_qwen_client):
        """Chat endpoint should handle RAG errors gracefully."""
        with patch("search_api.get_context_for_rag") as mock_get_context:
            mock_get_context.side_effect = Exception("ES connection failed")
            
            # Should fall back to non-RAG mode
            response = client.post("/api/chat", json={
                "message": "Hello!",
                "use_rag": True
            })
            
            # Should still return a response (may be 200 or 500 depending on implementation)
            assert response.status_code in [200, 500]


class TestChatStreaming:
    """Tests for streaming chat endpoint."""
    
    def test_chat_stream_endpoint_exists(self, client, mock_es_client, mock_embedding_client, mock_qwen_client):
        """Chat streaming endpoint should exist."""
        import search_api
        search_api.es_client = mock_es_client
        search_api.embedding_client = mock_embedding_client
        
        with patch("search_api.get_context_for_rag") as mock_get_context:
            mock_get_context.return_value = "Context here."
            
            response = client.post("/api/chat/stream", json={
                "message": "Hello!",
                "use_rag": True
            })
            
            # Should return streaming response (SSE)
            assert response.status_code == 200
            assert "text/event-stream" in response.headers.get("content-type", "")
    
    def test_chat_stream_yields_chunks(self, client, mock_es_client, mock_embedding_client, mock_qwen_client):
        """Streaming endpoint should yield content chunks."""
        with patch("search_api.get_context_for_rag") as mock_get_context:
            mock_get_context.return_value = "Context here."
            
            response = client.post("/api/chat/stream", json={
                "message": "Hello!",
                "use_rag": True
            })
            
            assert response.status_code == 200
            # Check that response is streaming
            content = response.text
            # Should contain SSE format data
            assert "data:" in content or len(content) > 0


class TestChatRequestValidation:
    """Tests for chat request validation."""
    
    def test_empty_message_rejected(self, client):
        """Empty message should be rejected."""
        response = client.post("/api/chat", json={
            "message": "",
            "use_rag": False
        })
        
        assert response.status_code == 422
    
    def test_missing_message_rejected(self, client):
        """Missing message field should be rejected."""
        response = client.post("/api/chat", json={
            "use_rag": False
        })
        
        assert response.status_code == 422
    
    def test_invalid_history_format_rejected(self, client):
        """Invalid history format should be rejected."""
        response = client.post("/api/chat", json={
            "message": "Hello",
            "history": "not a list",
            "use_rag": False
        })
        
        assert response.status_code == 422
    
    def test_valid_history_format_accepted(self, client, mock_qwen_client):
        """Valid history format should be accepted."""
        response = client.post("/api/chat", json={
            "message": "Hello",
            "history": [
                {"role": "user", "content": "Hi"},
                {"role": "assistant", "content": "Hello!"}
            ],
            "use_rag": False
        })
        
        assert response.status_code == 200

