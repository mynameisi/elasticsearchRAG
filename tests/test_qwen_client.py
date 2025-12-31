"""
Tests for Qwen/DashScope Client

TDD tests for the Qwen client that integrates with DashScope API
for chat completions in RAG applications.
"""

import os
import sys
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import pytest

# Add src to path to import directly without __init__.py
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from qwen_client import (
    QwenClient,
    get_qwen_client,
    ChatMessage,
    ChatResponse,
)


class TestQwenClientInitialization:
    """Tests for QwenClient initialization."""
    
    def test_init_with_api_key_parameter(self):
        """Client should accept api_key as parameter."""
        client = QwenClient(api_key="test-api-key")
        assert client.api_key == "test-api-key"
    
    def test_init_with_env_var(self):
        """Client should read DASHSCOPE_API_KEY from environment."""
        with patch.dict(os.environ, {"DASHSCOPE_API_KEY": "env-api-key"}):
            client = QwenClient()
            assert client.api_key == "env-api-key"
    
    def test_init_raises_without_api_key(self):
        """Client should raise ValueError if no API key provided."""
        with patch.dict(os.environ, {}, clear=True):
            # Remove the key if it exists
            os.environ.pop("DASHSCOPE_API_KEY", None)
            with pytest.raises(ValueError, match="API key required"):
                QwenClient()
    
    def test_default_model_name(self):
        """Client should use qwen-turbo as default model."""
        client = QwenClient(api_key="test-key")
        assert client.model_name == "qwen-turbo"
    
    def test_custom_model_name(self):
        """Client should accept custom model name."""
        client = QwenClient(api_key="test-key", model_name="qwen-plus")
        assert client.model_name == "qwen-plus"
    
    def test_default_base_url(self):
        """Client should use DashScope API URL by default."""
        client = QwenClient(api_key="test-key")
        assert "dashscope.aliyuncs.com" in client.base_url


class TestChatMessage:
    """Tests for ChatMessage data class."""
    
    def test_user_message(self):
        """ChatMessage should store user role and content."""
        msg = ChatMessage(role="user", content="Hello")
        assert msg.role == "user"
        assert msg.content == "Hello"
    
    def test_assistant_message(self):
        """ChatMessage should store assistant role and content."""
        msg = ChatMessage(role="assistant", content="Hi there!")
        assert msg.role == "assistant"
        assert msg.content == "Hi there!"
    
    def test_system_message(self):
        """ChatMessage should store system role and content."""
        msg = ChatMessage(role="system", content="You are helpful.")
        assert msg.role == "system"
        assert msg.content == "You are helpful."
    
    def test_to_dict(self):
        """ChatMessage should convert to dict for API calls."""
        msg = ChatMessage(role="user", content="Test")
        assert msg.to_dict() == {"role": "user", "content": "Test"}


class TestChatResponse:
    """Tests for ChatResponse data class."""
    
    def test_response_content(self):
        """ChatResponse should store response content."""
        resp = ChatResponse(content="Hello!", model="qwen-turbo")
        assert resp.content == "Hello!"
        assert resp.model == "qwen-turbo"
    
    def test_response_with_usage(self):
        """ChatResponse should optionally store token usage."""
        resp = ChatResponse(
            content="Hello!",
            model="qwen-turbo",
            prompt_tokens=10,
            completion_tokens=5,
            total_tokens=15
        )
        assert resp.prompt_tokens == 10
        assert resp.completion_tokens == 5
        assert resp.total_tokens == 15


class TestQwenClientChat:
    """Tests for QwenClient chat method."""
    
    @patch("qwen_client.requests.post")
    def test_chat_single_message(self, mock_post):
        """Client should handle single message chat."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [
                {"message": {"content": "I'm doing well!"}}
            ],
            "model": "qwen-turbo",
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15
            }
        }
        mock_post.return_value = mock_response
        
        client = QwenClient(api_key="test-key")
        response = client.chat([ChatMessage(role="user", content="How are you?")])
        
        assert response.content == "I'm doing well!"
        assert response.model == "qwen-turbo"
    
    @patch("qwen_client.requests.post")
    def test_chat_with_history(self, mock_post):
        """Client should handle chat with conversation history."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [
                {"message": {"content": "Python is great for data science."}}
            ],
            "model": "qwen-turbo",
            "usage": {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30}
        }
        mock_post.return_value = mock_response
        
        client = QwenClient(api_key="test-key")
        messages = [
            ChatMessage(role="user", content="What's your favorite language?"),
            ChatMessage(role="assistant", content="I like Python!"),
            ChatMessage(role="user", content="Why?"),
        ]
        response = client.chat(messages)
        
        assert response.content == "Python is great for data science."
        
        # Verify the API was called with all messages
        call_args = mock_post.call_args
        request_body = call_args.kwargs.get("json") or call_args[1].get("json")
        assert len(request_body["messages"]) == 3
    
    @patch("qwen_client.requests.post")
    def test_chat_with_system_prompt(self, mock_post):
        """Client should handle system prompt."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Based on the context..."}}],
            "model": "qwen-turbo",
            "usage": {"prompt_tokens": 30, "completion_tokens": 15, "total_tokens": 45}
        }
        mock_post.return_value = mock_response
        
        client = QwenClient(api_key="test-key")
        messages = [
            ChatMessage(role="system", content="You are a RAG assistant."),
            ChatMessage(role="user", content="What's in the document?"),
        ]
        response = client.chat(messages)
        
        call_args = mock_post.call_args
        request_body = call_args.kwargs.get("json") or call_args[1].get("json")
        assert request_body["messages"][0]["role"] == "system"
    
    @patch("qwen_client.requests.post")
    def test_chat_api_error(self, mock_post):
        """Client should raise exception on API error."""
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        mock_post.return_value = mock_response
        
        client = QwenClient(api_key="invalid-key")
        
        with pytest.raises(RuntimeError, match="API error"):
            client.chat([ChatMessage(role="user", content="Hello")])


class TestQwenClientStreaming:
    """Tests for QwenClient streaming chat."""
    
    @patch("qwen_client.requests.post")
    def test_chat_stream_yields_chunks(self, mock_post):
        """Streaming chat should yield content chunks."""
        # Simulate SSE response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = ""
        mock_response.iter_lines.return_value = [
            b'data: {"choices":[{"delta":{"content":"Hello"}}]}',
            b'data: {"choices":[{"delta":{"content":" world"}}]}',
            b'data: {"choices":[{"delta":{"content":"!"}}]}',
            b'data: [DONE]',
        ]
        # Set up context manager behavior
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_post.return_value = mock_response
        
        client = QwenClient(api_key="test-key")
        chunks = list(client.chat_stream([ChatMessage(role="user", content="Hi")]))
        
        assert "Hello" in chunks
        assert " world" in chunks
        assert "!" in chunks
    
    @patch("qwen_client.requests.post")
    def test_chat_stream_handles_empty_lines(self, mock_post):
        """Streaming should handle empty lines gracefully."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = ""
        mock_response.iter_lines.return_value = [
            b'',
            b'data: {"choices":[{"delta":{"content":"Test"}}]}',
            b'',
            b'data: [DONE]',
        ]
        # Set up context manager behavior
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_post.return_value = mock_response
        
        client = QwenClient(api_key="test-key")
        chunks = list(client.chat_stream([ChatMessage(role="user", content="Hi")]))
        
        assert "Test" in chunks


class TestGetQwenClient:
    """Tests for the factory function."""
    
    def test_factory_creates_client(self):
        """Factory should create QwenClient instance."""
        client = get_qwen_client(api_key="test-key")
        assert isinstance(client, QwenClient)
    
    def test_factory_passes_parameters(self):
        """Factory should pass all parameters to client."""
        client = get_qwen_client(
            api_key="test-key",
            model_name="qwen-plus",
            base_url="https://custom.api.com"
        )
        assert client.api_key == "test-key"
        assert client.model_name == "qwen-plus"
        assert client.base_url == "https://custom.api.com"

