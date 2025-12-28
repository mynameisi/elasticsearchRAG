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

// API base URL
const API_BASE = '/api';

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
    
    // Add expand listeners
    document.querySelectorAll('.expand-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const content = btn.parentElement.querySelector('.full-content');
            const isExpanded = content.classList.toggle('expanded');
            btn.textContent = isExpanded ? '▲ Show less' : '▼ Show full content';
        });
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
        <article class="result-card">
            <h3 class="result-title">${escapeHtml(result.title)}</h3>
            <p class="result-snippet">${snippet}</p>
            <div class="result-meta">
                ${metaTags}
                ${scoreDisplay}
            </div>
            <div class="result-expand">
                <button class="expand-button">▼ Show full content</button>
                <div class="full-content">${escapeHtml(result.content)}</div>
            </div>
        </article>
    `;
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

// Debounced search on input (optional - uncomment for live search)
// let debounceTimer;
// searchInput.addEventListener('input', (e) => {
//     clearTimeout(debounceTimer);
//     debounceTimer = setTimeout(() => {
//         if (e.target.value.length >= 2) {
//             performSearch(e.target.value);
//         }
//     }, 300);
// });

// Initialize
checkHealth();
