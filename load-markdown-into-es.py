#!/usr/bin/env python3
"""
Markdown to Elasticsearch Ingestion Script

This script loads a Markdown file, splits it by headers, and indexes
the document chunks into Elasticsearch with deduplication support.

Usage:
    python load-markdown-into-es.py <markdown_file> [options]

Requirements:
- 4.1: Split documents by headers (H1, H2, H3) using MarkdownHeaderTextSplitter
- 4.2: Compute hash values for deduplication using SQLRecordManager
- 4.3: Use ElasticsearchStore with SparseVectorStrategy
- 4.4: Support cleanup="full" mode for consistency
"""

import argparse
import sys
from pathlib import Path

from src.document_indexer import index_documents
from src.index_mapping import get_elasticsearch_client, create_index
from src.markdown_loader import load_markdown_file


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Load Markdown documents into Elasticsearch for RAG applications",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Index a Markdown file with default settings
    python load-markdown-into-es.py employee_handbook.md

    # Index with custom index name and Elasticsearch settings
    python load-markdown-into-es.py docs/guide.md --index my_docs --host es.example.com

    # Index without cleanup (append mode)
    python load-markdown-into-es.py new_docs.md --cleanup none
        """,
    )
    
    parser.add_argument(
        "markdown_file",
        type=str,
        help="Path to the Markdown file to index",
    )
    
    parser.add_argument(
        "--index",
        type=str,
        default="rag_documents",
        help="Elasticsearch index name (default: rag_documents)",
    )
    
    parser.add_argument(
        "--host",
        type=str,
        default="localhost",
        help="Elasticsearch host (default: localhost)",
    )
    
    parser.add_argument(
        "--port",
        type=int,
        default=9200,
        help="Elasticsearch port (default: 9200)",
    )
    
    parser.add_argument(
        "--username",
        type=str,
        default="elastic",
        help="Elasticsearch username (default: elastic)",
    )
    
    parser.add_argument(
        "--password",
        type=str,
        default="test123",
        help="Elasticsearch password (default: test123)",
    )
    
    parser.add_argument(
        "--scheme",
        type=str,
        choices=["http", "https"],
        default="http",
        help="Connection scheme (default: http)",
    )
    
    parser.add_argument(
        "--cleanup",
        type=str,
        choices=["full", "incremental", "none"],
        default="full",
        help="Cleanup mode for deduplication (default: full)",
    )
    
    parser.add_argument(
        "--db-url",
        type=str,
        default="sqlite:///record_manager.db",
        help="SQLite database URL for record manager (default: sqlite:///record_manager.db)",
    )
    
    parser.add_argument(
        "--no-verify-certs",
        action="store_true",
        help="Disable SSL certificate verification",
    )
    
    # Embedding options
    parser.add_argument(
        "--use-embeddings",
        action="store_true",
        help="Enable Volcengine embeddings for hybrid search",
    )
    
    parser.add_argument(
        "--embedding-endpoint",
        type=str,
        default=None,
        help="Volcengine Ark embedding endpoint ID (default: from ARK_EMBEDDING_ENDPOINT env var)",
    )
    
    parser.add_argument(
        "--recreate-index",
        action="store_true",
        help="Delete and recreate the index (required when changing embedding settings)",
    )
    
    return parser.parse_args()


def main() -> int:
    """Main entry point for the ingestion script."""
    args = parse_args()
    
    # Validate input file
    markdown_path = Path(args.markdown_file)
    if not markdown_path.exists():
        print(f"Error: File not found: {markdown_path}", file=sys.stderr)
        return 1
    
    if not markdown_path.is_file():
        print(f"Error: Not a file: {markdown_path}", file=sys.stderr)
        return 1
    
    print(f"Loading Markdown file: {markdown_path}")
    
    # Create Elasticsearch client
    try:
        es_client = get_elasticsearch_client(
            host=args.host,
            port=args.port,
            username=args.username,
            password=args.password,
            scheme=args.scheme,
            verify_certs=not args.no_verify_certs,
        )
        
        # Test connection
        if not es_client.ping():
            print("Error: Cannot connect to Elasticsearch", file=sys.stderr)
            return 1
        
        print(f"Connected to Elasticsearch at {args.scheme}://{args.host}:{args.port}")
        
    except Exception as e:
        print(f"Error connecting to Elasticsearch: {e}", file=sys.stderr)
        return 1
    
    # Ensure index exists
    try:
        if args.recreate_index:
            index_created = create_index(es_client, args.index, delete_if_exists=True)
            print(f"Recreated index: {args.index}")
        elif es_client.indices.exists(index=args.index):
            print(f"Using existing index: {args.index}")
        else:
            index_created = create_index(es_client, args.index)
            print(f"Created index: {args.index}")
    except Exception as e:
        print(f"Error creating index: {e}", file=sys.stderr)
        return 1
    
    # Initialize embedding client if requested
    embedding_client = None
    if args.use_embeddings:
        try:
            from src.volcengine_embedding import get_embedding_client
            embedding_client = get_embedding_client(endpoint_id=args.embedding_endpoint)
            print(f"Using Volcengine Ark embeddings (endpoint: {embedding_client.endpoint_id})")
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            print("Set VIKINGDB_AK and VIKINGDB_SK environment variables", file=sys.stderr)
            return 1
        except ImportError as e:
            print(f"Error: Missing volcengine SDK. Run: uv pip install volcengine", file=sys.stderr)
            return 1
    
    # Convert cleanup argument
    cleanup_mode = None if args.cleanup == "none" else args.cleanup
    
    # Index documents
    try:
        print(f"Indexing documents with cleanup mode: {args.cleanup}")
        
        # Load and split the Markdown file
        documents = load_markdown_file(markdown_path)
        
        # Add source file path to metadata
        for doc in documents:
            doc.metadata["source"] = str(markdown_path.absolute())
        
        result = index_documents(
            documents=documents,
            es_client=es_client,
            index_name=args.index,
            record_manager_db_url=args.db_url,
            cleanup=cleanup_mode,
            source_id_key="source",
            embedding_client=embedding_client,
        )
        
        # Print results
        print("\n" + "=" * 50)
        print("Indexing Results")
        print("=" * 50)
        print(f"  Documents added:   {result.num_added}")
        print(f"  Documents updated: {result.num_updated}")
        print(f"  Documents skipped: {result.num_skipped}")
        print(f"  Documents deleted: {result.num_deleted}")
        print("=" * 50)
        
        total_processed = result.num_added + result.num_updated + result.num_skipped
        print(f"\nTotal documents processed: {total_processed}")
        print("Indexing completed successfully!")
        
        return 0
        
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error indexing documents: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
