# Requirements Document

## Introduction

This document specifies the requirements for building a RAG (Retrieval Augmented Generation) application using LangChain, Higress AI Gateway, and Elasticsearch. The system will enable intelligent document retrieval and question-answering by combining semantic search with full-text search capabilities, using Elasticsearch as the vector store and Higress as the AI gateway for LLM integration.

## Glossary

- **RAG (Retrieval Augmented Generation)**: A technique that combines information retrieval with generative LLM to improve response accuracy and relevance
- **Higress**: A cloud-native API gateway that can serve as an AI gateway with unified LLM protocol support
- **Elasticsearch**: A distributed search and analytics engine with native vector search capabilities
- **LangChain**: An open-source framework for building LLM-based applications
- **ELSER v2**: Elastic Learned Sparse Encoder - Elasticsearch's built-in model for converting text to sparse vectors
- **RRF (Reciprocal Rank Fusion)**: A technique for combining multiple search result rankings into a single ranking
- **Sparse Vector**: A vector representation where most elements are zero, suitable for keyword-based semantic search
- **Dense Vector**: A vector representation where most elements have non-zero values
- **semantic_text**: An Elasticsearch field type that supports semantic search

## Requirements

### Requirement 1: Elasticsearch Deployment and Configuration

**User Story:** As a developer, I want to deploy Elasticsearch with Kibana using Docker Compose, so that I have a local environment for storing and searching documents.

#### Acceptance Criteria

1. WHEN a developer runs the docker-compose command THEN the System SHALL start Elasticsearch and Kibana containers with proper configuration
2. WHEN Elasticsearch starts THEN the System SHALL expose Kibana on port 5601 with authentication (elastic/test123)
3. WHEN the ML memory configuration is applied THEN the System SHALL allow automatic memory allocation for machine learning processes

### Requirement 2: Embedding Model Deployment

**User Story:** As a developer, I want to deploy the ELSER v2 embedding model in Elasticsearch, so that I can convert text documents into sparse vectors for semantic search.

#### Acceptance Criteria

1. WHEN the cluster settings are configured THEN the System SHALL enable automatic machine learning memory percentage allocation
2. WHEN the ELSER v2 model is downloaded and deployed THEN the System SHALL make the model available for inference operations

### Requirement 3: Index Mapping Creation

**User Story:** As a developer, I want to create an Elasticsearch index with proper mappings, so that documents can be stored with both text content and semantic vectors.

#### Acceptance Criteria

1. WHEN an index is created THEN the System SHALL define a semantic_text field for sparse vector storage
2. WHEN an index is created THEN the System SHALL define a content field of type text for full-text search
3. WHEN content is written to the content field THEN the System SHALL automatically copy the content to the semantic_text field via copy_to configuration

### Requirement 4: Document Processing and Ingestion

**User Story:** As a developer, I want to parse Markdown documents and ingest them into Elasticsearch, so that the knowledge base is populated with searchable content.

#### Acceptance Criteria

1. WHEN a Markdown document is processed THEN the System SHALL split the document by headers (H1, H2, H3) using LangChain's MarkdownHeaderTextSplitter
2. WHEN documents are indexed THEN the System SHALL compute hash values for deduplication using SQLRecordManager
3. WHEN documents are written to Elasticsearch THEN the System SHALL use ElasticsearchStore with SparseVectorStrategy
4. WHEN the cleanup mode is set to "full" THEN the System SHALL maintain consistency between source documents and indexed data
5. WHEN a document is serialized for storage THEN the System SHALL preserve the original text content
6. WHEN a stored document is retrieved THEN the System SHALL return content equivalent to the original document

### Requirement 5: Hybrid Search Implementation

**User Story:** As a developer, I want to perform hybrid search combining semantic and full-text search, so that I can retrieve the most relevant documents for user queries.

#### Acceptance Criteria

1. WHEN a search query is executed THEN the System SHALL perform both semantic search on semantic_text field and full-text search on content field
2. WHEN search results are combined THEN the System SHALL use RRF (Reciprocal Rank Fusion) to merge rankings from both search methods
3. WHEN results are returned THEN the System SHALL exclude the semantic_text field from the response to reduce payload size

### Requirement 6: Higress AI Gateway Setup

**User Story:** As a developer, I want to deploy and configure Higress AI Gateway, so that I can route requests to LLM providers and enable RAG capabilities.

#### Acceptance Criteria

1. WHEN Higress is installed THEN the System SHALL expose the console on port 8001 and API on port 8080
2. WHEN a provider is configured THEN the System SHALL support routing to LLM providers (e.g., Qwen/通义千问) based on model name prefix
3. WHEN a chat completion request is sent THEN the System SHALL forward the request to the appropriate LLM provider and return the response

### Requirement 7: AI Search Plugin Configuration

**User Story:** As a developer, I want to configure the ai-search plugin in Higress, so that user queries are automatically augmented with relevant context from Elasticsearch.

#### Acceptance Criteria

1. WHEN the ai-search plugin is configured THEN the System SHALL connect to Elasticsearch using the specified service name, credentials, and index
2. WHEN a user query is received THEN the System SHALL retrieve relevant documents from Elasticsearch before sending to the LLM
3. WHEN generating the prompt THEN the System SHALL include retrieved documents as context along with the user's question
4. WHEN the LLM responds THEN the System SHALL return answers that incorporate information from the retrieved documents

### Requirement 8: End-to-End RAG Query

**User Story:** As a user, I want to ask questions about the employee handbook, so that I can get accurate answers based on the company's documentation.

#### Acceptance Criteria

1. WHEN a user sends a question via the chat API THEN the System SHALL retrieve relevant context from Elasticsearch and generate an informed response
2. WHEN the source document is updated and re-indexed THEN the System SHALL reflect the updated information in subsequent query responses
3. WHEN no relevant documents are found THEN the System SHALL indicate that the information is not available in the knowledge base
