// DOM Elements
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const hybridToggle = document.getElementById('hybrid-toggle');
const resultsContainer = document.getElementById('results-container');
const resultsHeader = document.getElementById('results-header');
const resultsCount = document.getElementById('results-count');
const searchType = document.getElementById('search-type');
const resultsDiv = document.getElementById('results');
const emptyState = document.getElementById('empty-state');
const loading = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const statusDiv = document.getElementById('status');

// Article Panel Elements
const appContainer = document.querySelector('.app-container');
const articlePanel = document.getElementById('article-panel');
const articleTitle = document.getElementById('article-title');
const articleContent = document.getElementById('article-content');
const closePanel = document.getElementById('close-panel');
const panelOverlay = document.getElementById('panel-overlay');

// API base URL
const API_BASE = '/api';

// Store current results and full documents
let currentResults = [];
let documentCache = {};
let currentSearchQuery = '';

// Check health on load
async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        
        const esStatus = data.elasticsearch === 'connected' ? '✓' : '✗';
        const embStatus = data.embeddings === 'configured' ? '✓' : '✗';
        
        statusDiv.innerHTML = `
            <span style="color: ${data.elasticsearch === 'connected' ? 'var(--color-success)' : 'var(--color-error)'}">
                ${esStatus} Elasticsearch
            </span>
            &nbsp;|&nbsp;
            <span style="color: ${data.embeddings === 'configured' ? 'var(--color-success)' : 'var(--color-text-secondary)'}">
                ${embStatus} Embeddings
            </span>
        `;
        
        // Disable hybrid toggle if embeddings not configured
        if (data.embeddings !== 'configured') {
            hybridToggle.checked = false;
            hybridToggle.disabled = true;
            hybridToggle.parentElement.style.opacity = '0.5';
            hybridToggle.parentElement.title = 'Embeddings not configured';
        }
    } catch (e) {
        statusDiv.innerHTML = '<span style="color: var(--color-error)">✗ API unavailable</span>';
    }
}

// Perform search
async function performSearch(query) {
    if (!query.trim()) return;
    
    // Close panel if open
    closeSidePanel();
    
    // Show loading
    emptyState.classList.add('hidden');
    resultsHeader.classList.add('hidden');
    resultsDiv.innerHTML = '';
    errorDiv.classList.add('hidden');
    loading.classList.remove('hidden');
    
    try {
        const useHybrid = hybridToggle.checked;
        const url = `${API_BASE}/search?q=${encodeURIComponent(query)}&use_hybrid=${useHybrid}&limit=10`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Search failed');
        }
        
        const data = await response.json();
        currentResults = data.results;
        currentSearchQuery = query;
        displayResults(data);
        
    } catch (e) {
        errorDiv.textContent = `Error: ${e.message}`;
        errorDiv.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
    }
}

// Display search results
function displayResults(data) {
    if (data.results.length === 0) {
        emptyState.innerHTML = `
            <div class="empty-icon">🔍</div>
            <p>No results found for "${escapeHtml(data.query)}"</p>
        `;
        emptyState.classList.remove('hidden');
        return;
    }
    
    // Update header
    resultsCount.textContent = `${data.total} result${data.total !== 1 ? 's' : ''} found`;
    searchType.textContent = data.search_type;
    resultsHeader.classList.remove('hidden');
    
    // Normalize scores to 0-100 (top result = 100)
    const maxScore = Math.max(...data.results.map(r => r.score || 0));
    const normalizedResults = data.results.map(result => ({
        ...result,
        normalizedScore: maxScore > 0 ? Math.round((result.score / maxScore) * 100) : 0
    }));
    
    // Render results
    resultsDiv.innerHTML = normalizedResults.map((result, index) => createResultCard(result, index)).join('');
    
    // Add click listeners to result cards
    document.querySelectorAll('.result-card').forEach((card, index) => {
        card.addEventListener('click', () => openArticlePanel(index));
    });
}

// Create result card HTML
function createResultCard(result, index) {
    const metaTags = Object.entries(result.metadata)
        .filter(([key]) => !key.startsWith('_') && key !== 'source')
        .map(([key, value]) => `<span class="meta-tag">${escapeHtml(key)}: ${escapeHtml(String(value))}</span>`)
        .join('');
    
    // Use highlighted snippet if available, otherwise use plain snippet
    const snippet = result.highlights.length > 0 
        ? result.highlights.join(' ... ')
        : escapeHtml(result.snippet);
    
    // Show normalized score (0-100)
    const scoreDisplay = result.normalizedScore !== undefined
        ? `<span class="result-score">Relevance: ${result.normalizedScore}</span>`
        : '';
    
    return `
        <article class="result-card" data-index="${index}">
            <h3 class="result-title">${escapeHtml(result.title)}</h3>
            <p class="result-snippet">${snippet}</p>
            <div class="result-meta">
                ${metaTags}
                ${scoreDisplay}
                <span class="result-arrow">→</span>
            </div>
        </article>
    `;
}

// Open article side panel
async function openArticlePanel(index) {
    const result = currentResults[index];
    if (!result) return;
    
    // Mark active card
    document.querySelectorAll('.result-card').forEach((card, i) => {
        card.classList.toggle('active', i === index);
    });
    
    // Set title
    articleTitle.textContent = result.title;
    
    // Get full document content
    const fullContent = await getFullDocument(result);
    
    // Render markdown
    const renderedHtml = renderMarkdownWithHighlight(fullContent, result.content);
    articleContent.innerHTML = renderedHtml;
    
    // Open panel
    articlePanel.classList.add('open');
    appContainer.classList.add('panel-open');
    panelOverlay.classList.add('visible');
    
    // Scroll to highlighted section after a brief delay
    setTimeout(() => {
        const highlightedSection = articleContent.querySelector('.highlight-section');
        if (highlightedSection) {
            highlightedSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

// Get full document (fetch from source or use cached)
async function getFullDocument(result) {
    const source = result.metadata.source;
    
    // If we have the source path, try to fetch full document
    if (source && !documentCache[source]) {
        try {
            const response = await fetch(`${API_BASE}/document?source=${encodeURIComponent(source)}`);
            if (response.ok) {
                const data = await response.json();
                documentCache[source] = data.content;
            }
        } catch (e) {
            console.log('Could not fetch full document, using result content');
        }
    }
    
    // Return cached full document or fall back to result content
    return documentCache[source] || result.content;
}

// Render markdown with highlighted section
function renderMarkdownWithHighlight(fullContent, matchContent) {
    // Configure marked
    marked.setOptions({
        breaks: true,
        gfm: true,
    });
    
    // Find the matching section in the full content
    const normalizedMatch = normalizeText(matchContent);
    
    // Split content into sections by headers
    const sections = splitByHeaders(fullContent);
    
    // Find which section contains the match
    let matchedSectionIndex = -1;
    for (let i = 0; i < sections.length; i++) {
        if (normalizeText(sections[i]).includes(normalizedMatch)) {
            matchedSectionIndex = i;
            break;
        }
    }
    
    // If no exact match found, try fuzzy matching
    if (matchedSectionIndex === -1) {
        const matchWords = normalizedMatch.split(/\s+/).filter(w => w.length > 3);
        let bestScore = 0;
        
        for (let i = 0; i < sections.length; i++) {
            const sectionNorm = normalizeText(sections[i]);
            const score = matchWords.filter(w => sectionNorm.includes(w)).length;
            if (score > bestScore) {
                bestScore = score;
                matchedSectionIndex = i;
            }
        }
    }
    
    // Render each section, wrapping the matched one
    let html = '';
    for (let i = 0; i < sections.length; i++) {
        let sectionHtml = marked.parse(sections[i]);
        
        // Highlight search terms in all sections
        sectionHtml = highlightSearchTerms(sectionHtml, currentSearchQuery);
        
        if (i === matchedSectionIndex) {
            html += `<div class="highlight-section">${sectionHtml}</div>`;
        } else {
            html += sectionHtml;
        }
    }
    
    return html || highlightSearchTerms(marked.parse(fullContent), currentSearchQuery);
}

// Highlight search terms in HTML content
function highlightSearchTerms(html, query) {
    if (!query) return html;
    
    // Extract search terms (split by spaces, filter short words)
    const terms = query.toLowerCase().split(/\s+/).filter(term => term.length >= 2);
    
    if (terms.length === 0) return html;
    
    // Create a temporary element to work with the HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Walk through text nodes and highlight matches
    highlightTextNodes(temp, terms);
    
    return temp.innerHTML;
}

// Recursively highlight text nodes
function highlightTextNodes(element, terms) {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    const textNodes = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
    }
    
    for (const textNode of textNodes) {
        // Skip if parent is already a mark, script, or style
        const parentTag = textNode.parentNode.tagName?.toLowerCase();
        if (parentTag === 'mark' || parentTag === 'script' || parentTag === 'style' || parentTag === 'code') {
            continue;
        }
        
        const text = textNode.textContent;
        const highlighted = highlightTermsInText(text, terms);
        
        if (highlighted !== text) {
            const span = document.createElement('span');
            span.innerHTML = highlighted;
            textNode.parentNode.replaceChild(span, textNode);
        }
    }
}

// Highlight terms in a text string
function highlightTermsInText(text, terms) {
    if (!text.trim()) return text;
    
    // Build regex pattern for all terms
    const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    
    return text.replace(pattern, '<mark class="search-highlight">$1</mark>');
}

// Split markdown content by headers
function splitByHeaders(content) {
    const lines = content.split('\n');
    const sections = [];
    let currentSection = [];
    
    for (const line of lines) {
        // Check if line is a header (starts with #)
        if (/^#{1,6}\s/.test(line) && currentSection.length > 0) {
            sections.push(currentSection.join('\n'));
            currentSection = [line];
        } else {
            currentSection.push(line);
        }
    }
    
    // Don't forget the last section
    if (currentSection.length > 0) {
        sections.push(currentSection.join('\n'));
    }
    
    return sections;
}

// Normalize text for comparison
function normalizeText(text) {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Close side panel
function closeSidePanel() {
    articlePanel.classList.remove('open');
    appContainer.classList.remove('panel-open');
    panelOverlay.classList.remove('visible');
    
    // Remove active state from cards
    document.querySelectorAll('.result-card').forEach(card => {
        card.classList.remove('active');
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event listeners
searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    performSearch(searchInput.value);
});

closePanel.addEventListener('click', closeSidePanel);
panelOverlay.addEventListener('click', closeSidePanel);

// Close panel on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && articlePanel.classList.contains('open')) {
        closeSidePanel();
    }
});

// Initialize
checkHealth();
