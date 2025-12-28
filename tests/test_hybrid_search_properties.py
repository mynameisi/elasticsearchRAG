"""
Property-Based Tests for Hybrid Search Module

**Feature: rag-langchain-higress-es, Property 5: Search Results Exclude Semantic Field**
**Validates: Requirements 5.3**

This module contains property-based tests using Hypothesis to verify
that the hybrid search query builder correctly excludes the semantic_text
field from search results.
"""

from hypothesis import given, strategies as st, settings

from src.hybrid_search import build_rrf_hybrid_query


# Strategy for generating valid query text
query_text_strategy = st.text(
    alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'S', 'Z')),
    min_size=1,
    max_size=100,
).filter(lambda x: x.strip())  # Ensure non-empty after stripping

# Strategy for generating valid field names (alphanumeric with underscores)
field_name_strategy = st.text(
    alphabet=st.characters(whitelist_categories=('L', 'N'), whitelist_characters='_'),
    min_size=1,
    max_size=50,
).filter(lambda x: x and x[0].isalpha())  # Must start with letter


class TestSearchResultFieldExclusion:
    """
    Property tests for verifying semantic field exclusion in search queries.
    
    **Feature: rag-langchain-higress-es, Property 5: Search Results Exclude Semantic Field**
    **Validates: Requirements 5.3**
    """
    
    @given(
        query_text=query_text_strategy,
        semantic_field=field_name_strategy,
    )
    @settings(max_examples=100)
    def test_semantic_field_excluded_from_source(
        self,
        query_text: str,
        semantic_field: str,
    ):
        """
        Property: For any search query, the semantic field should be excluded from _source.
        
        **Feature: rag-langchain-higress-es, Property 5: Search Results Exclude Semantic Field**
        **Validates: Requirements 5.3**
        """
        query = build_rrf_hybrid_query(
            query_text=query_text,
            semantic_field=semantic_field,
        )
        
        # Verify _source excludes the semantic field
        assert "_source" in query, "Query must have _source configuration"
        assert "excludes" in query["_source"], "_source must have excludes"
        assert semantic_field in query["_source"]["excludes"], \
            f"Semantic field '{semantic_field}' must be in excludes list"
    
    @given(
        query_text=query_text_strategy,
        content_field=field_name_strategy,
        semantic_field=field_name_strategy,
        size=st.integers(min_value=1, max_value=1000),
    )
    @settings(max_examples=100)
    def test_query_structure_valid_for_all_inputs(
        self,
        query_text: str,
        content_field: str,
        semantic_field: str,
        size: int,
    ):
        """
        Property: For any valid inputs, the query structure should be valid.
        
        **Feature: rag-langchain-higress-es, Property 5: Search Results Exclude Semantic Field**
        **Validates: Requirements 5.3**
        """
        query = build_rrf_hybrid_query(
            query_text=query_text,
            content_field=content_field,
            semantic_field=semantic_field,
            size=size,
        )
        
        # Verify query structure
        assert "retriever" in query, "Query must have retriever"
        assert "rrf" in query["retriever"], "Retriever must use RRF"
        assert "retrievers" in query["retriever"]["rrf"], "RRF must have retrievers"
        
        retrievers = query["retriever"]["rrf"]["retrievers"]
        assert len(retrievers) == 2, "Must have exactly 2 retrievers (full-text and semantic)"
        
        # Verify semantic field is excluded
        assert semantic_field in query["_source"]["excludes"]
    
    @given(
        query_text=query_text_strategy,
    )
    @settings(max_examples=100)
    def test_default_semantic_field_excluded(
        self,
        query_text: str,
    ):
        """
        Property: With default parameters, semantic_text field should be excluded.
        
        **Feature: rag-langchain-higress-es, Property 5: Search Results Exclude Semantic Field**
        **Validates: Requirements 5.3**
        """
        query = build_rrf_hybrid_query(query_text=query_text)
        
        # Default semantic field is "semantic_text"
        assert "semantic_text" in query["_source"]["excludes"], \
            "Default semantic_text field must be excluded"
