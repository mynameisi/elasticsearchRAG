"""
Unified Document Loader Module

This module provides a unified interface to load documents from various formats:
- Markdown (.md)
- PDF (.pdf)
- Word Documents (.docx)

The loader automatically detects file type and uses the appropriate parser.
"""

from pathlib import Path
from typing import List, Optional, Tuple

from langchain_core.documents import Document
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)


# Default headers to split on for Markdown (H1, H2, H3)
DEFAULT_HEADERS_TO_SPLIT_ON: List[Tuple[str, str]] = [
    ("#", "Header 1"),
    ("##", "Header 2"),
    ("###", "Header 3"),
]

# Supported file extensions
SUPPORTED_EXTENSIONS = {".md", ".pdf", ".docx"}


def get_supported_extensions() -> set:
    """Return the set of supported file extensions."""
    return SUPPORTED_EXTENSIONS.copy()


def is_supported_file(file_path: str | Path) -> bool:
    """Check if a file type is supported."""
    return Path(file_path).suffix.lower() in SUPPORTED_EXTENSIONS


def _load_markdown(file_path: Path, encoding: str = "utf-8") -> List[Document]:
    """Load and split a Markdown file by headers."""
    markdown_text = file_path.read_text(encoding=encoding)
    
    splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=DEFAULT_HEADERS_TO_SPLIT_ON,
        strip_headers=False,
    )
    
    return splitter.split_text(markdown_text)


def _load_pdf(file_path: Path) -> List[Document]:
    """Load a PDF file and split into chunks."""
    from langchain_community.document_loaders import PyPDFLoader
    
    loader = PyPDFLoader(str(file_path))
    pages = loader.load()
    
    # Split large pages into smaller chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    
    docs = text_splitter.split_documents(pages)
    
    # Add page info to metadata
    for doc in docs:
        if "page" in doc.metadata:
            doc.metadata["section"] = f"Page {doc.metadata['page'] + 1}"
    
    return docs


def _load_docx(file_path: Path) -> List[Document]:
    """Load a DOCX file and split into chunks."""
    from langchain_community.document_loaders import Docx2txtLoader
    
    loader = Docx2txtLoader(str(file_path))
    docs = loader.load()
    
    # Split into smaller chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    
    return text_splitter.split_documents(docs)


def load_document(
    file_path: str | Path,
    encoding: str = "utf-8",
) -> List[Document]:
    """
    Load a document from various formats and split into chunks.
    
    Supports:
    - Markdown (.md): Split by headers (H1, H2, H3)
    - PDF (.pdf): Split by pages, then into chunks
    - Word (.docx): Split into chunks
    
    Args:
        file_path: Path to the document file
        encoding: File encoding for text files (default: utf-8)
        
    Returns:
        List of Document objects with content and metadata
        
    Raises:
        FileNotFoundError: If the file does not exist
        ValueError: If the file type is not supported
    """
    file_path = Path(file_path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    suffix = file_path.suffix.lower()
    
    if suffix not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type: {suffix}. "
            f"Supported types: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )
    
    # Load based on file type
    if suffix == ".md":
        docs = _load_markdown(file_path, encoding)
    elif suffix == ".pdf":
        docs = _load_pdf(file_path)
    elif suffix == ".docx":
        docs = _load_docx(file_path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")
    
    # Add source to all documents
    for doc in docs:
        doc.metadata["source"] = str(file_path.absolute())
        doc.metadata["file_type"] = suffix[1:]  # Remove the dot
    
    return docs


def load_documents_from_directory(
    directory: str | Path,
    recursive: bool = True,
    encoding: str = "utf-8",
) -> List[Document]:
    """
    Load all supported documents from a directory.
    
    Args:
        directory: Path to the directory
        recursive: Whether to search subdirectories (default: True)
        encoding: File encoding for text files
        
    Returns:
        List of Document objects from all supported files
    """
    directory = Path(directory)
    
    if not directory.exists():
        raise FileNotFoundError(f"Directory not found: {directory}")
    
    if not directory.is_dir():
        raise ValueError(f"Not a directory: {directory}")
    
    all_docs = []
    pattern = "**/*" if recursive else "*"
    
    for ext in SUPPORTED_EXTENSIONS:
        for file_path in directory.glob(f"{pattern}{ext}"):
            try:
                docs = load_document(file_path, encoding)
                all_docs.extend(docs)
                print(f"  Loaded {len(docs)} chunks from {file_path.name}")
            except Exception as e:
                print(f"  Warning: Failed to load {file_path}: {e}")
    
    return all_docs
