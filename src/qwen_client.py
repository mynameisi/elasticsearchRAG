"""
Qwen/DashScope Chat Client

This module provides a client for the Qwen/DashScope API
to generate chat completions for RAG applications.

API Documentation: https://help.aliyun.com/zh/model-studio/developer-reference/api-details-9
"""

import os
from dataclasses import dataclass
from typing import List, Optional, Iterator
import json

import requests


@dataclass
class ChatMessage:
    """A chat message with role and content."""
    role: str  # "user", "assistant", or "system"
    content: str
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API calls."""
        return {"role": self.role, "content": self.content}


@dataclass
class ChatResponse:
    """Response from Qwen chat completion."""
    content: str
    model: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None


class QwenClient:
    """Client for Qwen/DashScope Chat API (OpenAI-compatible)."""
    
    DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    DEFAULT_MODEL = "qwen-turbo"
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        """
        Initialize the Qwen/DashScope client.
        
        Args:
            api_key: DashScope API Key (or set DASHSCOPE_API_KEY env var)
            model_name: Model name (default: qwen-turbo)
            base_url: API base URL (default: DashScope compatible endpoint)
        """
        self.api_key = api_key or os.environ.get("DASHSCOPE_API_KEY")
        self.model_name = model_name or self.DEFAULT_MODEL
        self.base_url = base_url or self.DEFAULT_BASE_URL
        
        if not self.api_key:
            raise ValueError(
                "API key required. Set DASHSCOPE_API_KEY environment variable "
                "or pass api_key parameter."
            )
    
    def _make_request(
        self,
        messages: List[ChatMessage],
        stream: bool = False,
    ) -> requests.Response:
        """Make a chat completion request to the DashScope API."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        # Convert messages to dict format
        messages_dict = [msg.to_dict() for msg in messages]
        
        payload = {
            "model": self.model_name,
            "messages": messages_dict,
            "stream": stream,
        }
        
        response = requests.post(
            f"{self.base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=60,
            stream=stream,
        )
        
        # For streaming requests, don't check status_code immediately
        # as the response might be used as a context manager
        if not stream and response.status_code != 200:
            raise RuntimeError(
                f"API error: {response.status_code} - {response.text}"
            )
        
        return response
    
    def chat(self, messages: List[ChatMessage]) -> ChatResponse:
        """
        Generate a chat completion.
        
        Args:
            messages: List of ChatMessage objects (conversation history)
            
        Returns:
            ChatResponse with content and metadata
        """
        response = self._make_request(messages, stream=False)
        result = response.json()
        
        # Extract response content
        choice = result["choices"][0]
        content = choice["message"]["content"]
        
        # Extract usage if available
        usage = result.get("usage", {})
        
        return ChatResponse(
            content=content,
            model=result.get("model", self.model_name),
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            total_tokens=usage.get("total_tokens"),
        )
    
    def chat_stream(self, messages: List[ChatMessage]) -> Iterator[str]:
        """
        Generate a streaming chat completion.
        
        Args:
            messages: List of ChatMessage objects (conversation history)
            
        Yields:
            Content chunks as strings
        """
        response = self._make_request(messages, stream=True)
        
        # Check status code for streaming responses
        if response.status_code != 200:
            response.close()
            raise RuntimeError(
                f"API error: {response.status_code} - {response.text}"
            )
        
        # Use response as context manager for proper cleanup
        with response:
            for line in response.iter_lines():
                if not line:
                    continue
                
                # SSE format: "data: {...}"
                line_str = line.decode("utf-8")
                if not line_str.startswith("data: "):
                    continue
                
                data_str = line_str[6:]  # Remove "data: " prefix
                
                if data_str.strip() == "[DONE]":
                    break
                
                try:
                    data = json.loads(data_str)
                    choices = data.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                except json.JSONDecodeError:
                    # Skip invalid JSON lines
                    continue


def get_qwen_client(
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
    base_url: Optional[str] = None,
) -> QwenClient:
    """
    Factory function to create a Qwen/DashScope client.
    
    Args:
        api_key: Optional API key (defaults to DASHSCOPE_API_KEY env var)
        model_name: Optional model name (defaults to qwen-turbo)
        base_url: Optional API base URL
        
    Returns:
        Configured QwenClient instance
    """
    return QwenClient(
        api_key=api_key,
        model_name=model_name,
        base_url=base_url,
    )

