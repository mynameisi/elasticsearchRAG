# Document Chunking Strategy

This document describes the chunking methods used in this RAG application and their alignment with industry standards.

## Current Implementation

### Markdown Files (.md)

Uses LangChain's `MarkdownHeaderTextSplitter`:

- **Split points**: Headers H1 (`#`), H2 (`##`), H3 (`###`)
- **Header preservation**: Headers are kept in chunks (`strip_headers=False`)
- **Metadata**: Header hierarchy is preserved in document metadata

```python
# src/document_loader.py
splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[
        ("#", "Header 1"),
        ("##", "Header 2"),
        ("###", "Header 3"),
    ],
    strip_headers=False,
)
```

**Why this approach?**
- Respects document structure and semantic boundaries
- Keeps related content together under the same section
- Provides rich metadata for filtering and context

### PDF & DOCX Files

Uses LangChain's `RecursiveCharacterTextSplitter`:

- **Chunk size**: 1000 characters
- **Chunk overlap**: 200 characters (20%)
- **Separators**: `["\n\n", "\n", ". ", " ", ""]` (tried in order)

```python
# src/document_loader.py
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", ". ", " ", ""],
)
```

**Why this approach?**
- Recursive splitting tries natural breakpoints first (paragraphs, then sentences)
- 1000 characters balances context richness with embedding model limits
- 200-character overlap prevents context loss at chunk boundaries

## Industry Standard Alignment

| Component | Our Implementation | Industry Status |
|-----------|-------------------|-----------------|
| Structured docs (Markdown) | `MarkdownHeaderTextSplitter` | ✅ Standard practice |
| Unstructured docs (PDF/DOCX) | `RecursiveCharacterTextSplitter` | ✅ Most widely used |
| Chunk size | 1000 characters | ✅ Typical default (500-1500 range) |
| Chunk overlap | 200 characters (20%) | ✅ Recommended (10-20%) |
| Separator hierarchy | Paragraph → Line → Sentence → Word | ✅ Best practice |

**Verdict**: This implementation follows the most common patterns used in production RAG systems as of 2024-2025.

## Alternative Approaches (For Reference)

These are more advanced techniques that could be considered for specific use cases:

### Semantic Chunking
- Uses embeddings to find natural semantic breakpoints
- More expensive (requires embedding each potential split)
- Best for: Documents where fixed-size chunks poorly capture meaning

### Parent Document Retriever
- Stores small chunks for retrieval, large chunks for context
- Retrieves precise matches, returns surrounding context
- Best for: When you need both precision and rich context

### Late Chunking / Contextualized Chunking
- Adds context from surrounding content to each chunk
- Improves retrieval for chunks that lack standalone meaning
- Best for: Technical documentation with many cross-references

### Agentic Chunking
- Uses an LLM to determine optimal split points
- Most expensive but highest quality
- Best for: High-value documents where quality justifies cost

## When to Consider Changes

The current approach is suitable for most use cases. Consider alternatives if:

1. **Retrieval quality is poor** → Try semantic chunking
2. **Answers lack context** → Try parent document retriever
3. **Chunks are too fragmented** → Increase chunk size or use semantic chunking
4. **Processing very large documents** → Consider hierarchical chunking

## Configuration

To modify chunking parameters, edit `src/document_loader.py`:

```python
# For Markdown - adjust which headers trigger splits
DEFAULT_HEADERS_TO_SPLIT_ON = [
    ("#", "Header 1"),
    ("##", "Header 2"),
    ("###", "Header 3"),
    # Add ("####", "Header 4") for deeper splitting
]

# For PDF/DOCX - adjust chunk size and overlap
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,      # Increase for more context, decrease for precision
    chunk_overlap=200,    # Increase to reduce context loss at boundaries
    separators=["\n\n", "\n", ". ", " ", ""],
)
```

## References

- [LangChain Text Splitters Documentation](https://python.langchain.com/docs/how_to/#text-splitters)
- [Chunking Strategies for LLM Applications](https://www.pinecone.io/learn/chunking-strategies/)
- [OpenAI Cookbook: Chunking Strategies](https://cookbook.openai.com/examples/embedding_long_inputs)

