# Implementation Plan

- [x] 1. Set up project structure and Docker infrastructure
  - [x] 1.1 Create project directory structure with src/, tests/, and config/ folders
    - Create main Python package structure
    - Add requirements.txt with dependencies (elasticsearch, langchain, langchain_elasticsearch, langchain_text_splitters, hypothesis)
    - _Requirements: 1.1_
  - [x] 1.2 Create docker-compose.yaml for Elasticsearch and Kibana
    - Configure Elasticsearch 8.x with ML capabilities
    - Configure Kibana with authentication
    - Set up proper networking and volumes
    - _Requirements: 1.1, 1.2_
  - [x] 1.3 Create Elasticsearch cluster configuration script
    - Script to set xpack.ml.use_auto_machine_memory_percent to true
    - _Requirements: 1.3, 2.1_

- [ ] 2. Implement Elasticsearch index management
  - [ ] 2.1 Create index mapping module
    - Implement function to create index with semantic_text and content fields
    - Configure copy_to for automatic field population
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ]* 2.2 Write property test for copy-to field population
    - **Property 6: Copy-To Field Population**
    - **Validates: Requirements 3.3**

- [ ] 3. Implement document processing pipeline
  - [ ] 3.1 Create Markdown document loader module
    - Implement MarkdownHeaderTextSplitter configuration
    - Support H1, H2, H3 header splitting
    - _Requirements: 4.1_
  - [ ]* 3.2 Write property test for Markdown splitting
    - **Property 2: Markdown Header Splitting Preserves Content**
    - **Validates: Requirements 4.1**
  - [ ] 3.3 Implement document indexing with deduplication
    - Configure SQLRecordManager for hash-based deduplication
    - Implement ElasticsearchStore with SparseVectorStrategy
    - Support cleanup="full" mode for consistency
    - _Requirements: 4.2, 4.3, 4.4_
  - [ ]* 3.4 Write property test for deduplication idempotence
    - **Property 3: Deduplication Idempotence**
    - **Validates: Requirements 4.2**
  - [ ]* 3.5 Write property test for full cleanup consistency
    - **Property 4: Full Cleanup Consistency**
    - **Validates: Requirements 4.4**
  - [ ]* 3.6 Write property test for document round-trip
    - **Property 1: Document Round-Trip Consistency**
    - **Validates: Requirements 4.5, 4.6**

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement hybrid search functionality
  - [ ] 5.1 Create custom query builder for RRF hybrid search
    - Implement RRF retriever combining semantic and full-text search
    - Exclude semantic_text from response source
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 5.2 Write property test for search result field exclusion
    - **Property 5: Search Results Exclude Semantic Field**
    - **Validates: Requirements 5.3**
  - [ ] 5.3 Create search utility function
    - Wrap ElasticsearchStore.similarity_search with custom query
    - Return formatted results with metadata
    - _Requirements: 5.1, 5.2_

- [ ] 6. Create main ingestion script
  - [ ] 6.1 Implement load-markdown-into-es.py script
    - Load Markdown file from disk
    - Split by headers using configured splitter
    - Index documents with deduplication
    - Print indexing results
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Create sample data and configuration files
  - [ ] 8.1 Create sample employee_handbook.md document
    - Include sections with H1, H2, H3 headers
    - Cover working hours, attendance policy, and other HR topics
    - _Requirements: 8.1_
  - [ ] 8.2 Create Higress ai-search plugin configuration
    - Document the YAML configuration for ai-search plugin
    - Include Elasticsearch connection settings
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 9. Create documentation and usage guide
  - [ ] 9.1 Create README.md with setup instructions
    - Document prerequisites (Docker, Python, Higress)
    - Step-by-step deployment guide
    - Usage examples for RAG queries
    - _Requirements: 6.1, 6.2, 6.3, 8.1, 8.2_

- [ ] 10. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
