#!/usr/bin/env python3
"""
Run the RAG Search Server

Usage:
    python run_search_server.py [--host HOST] [--port PORT] [--reload]
"""

import argparse
import uvicorn


def main():
    parser = argparse.ArgumentParser(description="Run the RAG Search Server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    
    args = parser.parse_args()
    
    print(f"Starting RAG Search Server at http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop\n")
    
    uvicorn.run(
        "src.search_api:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
