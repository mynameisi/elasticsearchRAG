"""
Markdown Document Loader Module

This module provides functions to load and split Markdown documents
using LangChain's MarkdownHeaderTextSplitter.

Requirements:
- 4.1: Split documents by headers (H1, H2, H3) using MarkdownHeaderTextSplitter
"""

from pathlib import Path
from typing import List, Optional, Tuple

from langchain_core.documents import Document
from langchain_text_splitters import MarkdownHeaderTextSplitter


# Default headers to split on (H1, H2, H3)
DEFAULT_HEADERS_TO_SPLIT_ON: List[Tuple[str, str]] = [
    ("#", "Header 1"),
    ("##", "Header 2"),
    ("###", "Header 3"),
]


def get_markdown_splitter(
    headers_to_split_on: Optional[List[Tuple[str, str]]] = None,
    strip_headers: bool = False,
) -> MarkdownHeaderTextSplitter:
    """
    Create a MarkdownHeaderTextSplitter with the specified configuration.
    
    Args:
        headers_to_split_on: List of tuples (header_marker, header_name).
            Defaults to H1, H2, H3 headers.
        strip_headers: Whether to remove headers from the content chunks.
            Defaults to False to preserve header context.
            
    Returns:
        Configured MarkdownHeaderTextSplitter instance
    """
    if headers_to_split_on is None:
        headers_to_split_on = DEFAULT_HEADERS_TO_SPLIT_ON
    
    return MarkdownHeaderTextSplitter(
        headers_to_split_on=headers_to_split_on,
        strip_headers=strip_headers,
    )


def split_markdown_text(
    markdown_text: str,
    headers_to_split_on: Optional[List[Tuple[str, str]]] = None,
    strip_headers: bool = False,
) -> List[Document]:
    """
    Split Markdown text into document chunks based on headers.
    
    Args:
        markdown_text: The Markdown content to split
        headers_to_split_on: List of tuples (header_marker, header_name).
            Defaults to H1, H2, H3 headers.
        strip_headers: Whether to remove headers from the content chunks.
            
    Returns:
        List of Document objects, each containing a chunk of content
        with metadata about the header hierarchy
    """
    splitter = get_markdown_splitter(
        headers_to_split_on=headers_to_split_on,
        strip_headers=strip_headers,
    )
    
    return splitter.split_text(markdown_text)


def load_markdown_file(
    file_path: str | Path,
    headers_to_split_on: Optional[List[Tuple[str, str]]] = None,
    strip_headers: bool = False,
    encoding: str = "utf-8",
) -> List[Document]:
    """
    Load a Markdown file and split it into document chunks.
    
    Args:
        file_path: Path to the Markdown file
        headers_to_split_on: List of tuples (header_marker, header_name).
            Defaults to H1, H2, H3 headers.
        strip_headers: Whether to remove headers from the content chunks.
        encoding: File encoding (default: utf-8)
        
    Returns:
        List of Document objects, each containing a chunk of content
        with metadata about the header hierarchy
        
    Raises:
        FileNotFoundError: If the file does not exist
        IOError: If the file cannot be read
    """
    file_path = Path(file_path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"Markdown file not found: {file_path}")
    
    markdown_text = file_path.read_text(encoding=encoding)
    
    return split_markdown_text(
        markdown_text=markdown_text,
        headers_to_split_on=headers_to_split_on,
        strip_headers=strip_headers,
    )
