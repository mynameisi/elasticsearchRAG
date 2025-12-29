// DOM Elements - Search
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

// DOM Elements - Article Panel
const appContainer = document.querySelector('.app-container');
const articlePanel = document.getElementById('article-panel');
const articleTitle = document.getElementById('article-title');
const articleContent = document.getElementById('article-content');
const closePanel = document.getElementById('close-panel');
const panelOverlay = document.getElementById('panel-overlay');

// DOM Elements - Documents Panel
const docsPanel = document.getElementById('docs-panel');
const toggleDocsPanel = document.getElementById('toggle-docs-panel');
const docsPanelExpand = document.getElementById('docs-panel-expand');
const fileUpload = document.getElementById('file-upload');
const reindexButton = document.getElementById('reindex-button');
const selectionBar = document.getElementById('selection-bar');
const selectionCount = document.getElementById('selection-count');
const deleteSelected = document.getElementById('delete-selected');
const docsLoading = document.getElementById('docs-loading');
const docsList = document.getElementById('docs-list');
const docsEmpty = document.getElementById('docs-empty');
const toastContainer = document.getElementById('toast-container');

// API base URL
const API_BASE = '/api';

// State
let currentResults = [];
let documentCache = {};
let currentSearchQuery = '';
let documents = [];
let selectedDocs = new Set();

// ==========================================
// Toast Notifications
// ==========================================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-message">${message}</span>`;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// Documents Panel
// ==========================================

async function loadDocuments() {
    docsLoading.classList.remove('hidden');
    docsList.innerHTML = '';
    docsEmpty.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_BASE}/documents`);
        if (!response.ok) throw new Error('Failed to load documents');
        
        const data = await response.json();
        documents = data.documents;
        renderDocumentsList();
    } catch (e) {
        showToast('Failed to load documents', 'error');
    } finally {
        docsLoading.classList.add('hidden');
    }
}

function renderDocumentsList() {
    docsList.innerHTML = '';
    selectedDocs.clear();
    updateSelectionBar();
    
    if (documents.length === 0) {
        docsEmpty.classList.remove('hidden');
        return;
    }
    
    docsEmpty.classList.add('hidden');
    
    documents.forEach(doc => {
        const li = document.createElement('li');
        li.className = 'doc-item';
        li.dataset.filename = doc.filename;
        
        li.innerHTML = `
            <input type="checkbox" class="doc-checkbox" data-filename="${doc.filename}">
            <span class="doc-icon">📄</span>
            <div class="doc-info">
                <div class="doc-name" title="${doc.filename}">${doc.filename}</div>
                <div class="doc-meta">${formatFileSize(doc.size)} • ${doc.chunks} chunks</div>
            </div>
            <button class="doc-delete" title="Delete" data-filename="${doc.filename}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        `;
        
        // Click to view document
        li.addEventListener('click', (e) => {
            if (e.target.classList.contains('doc-checkbox') || e.target.closest('.doc-delete')) return;
            viewDocument(doc.filename);
        });
        
        // Checkbox change
        const checkbox = li.querySelector('.doc-checkbox');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            if (checkbox.checked) {
                selectedDocs.add(doc.filename);
            } else {
                selectedDocs.delete(doc.filename);
            }
            updateSelectionBar();
        });
        
        // Delete button
        const deleteBtn = li.querySelector('.doc-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteDocument(doc.filename);
        });
        
        docsList.appendChild(li);
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function updateSelectionBar() {
    if (selectedDocs.size > 0) {
        selectionBar.classList.remove('hidden');
        selectionCount.textContent = `${selectedDocs.size} selected`;
    } else {
        selectionBar.classList.add('hidden');
    }
}

async function viewDocument(filename) {
    // Mark active in list
    document.querySelectorAll('.doc-item').forEach(item => {
        item.classList.toggle('active', item.dataset.filename === filename);
    });
    
    articleTitle.textContent = filename;
    articleContent.innerHTML = '<div class="docs-loading"><div class="spinner small"></div><span>Loading...</span></div>';
    
    // Open panel
    articlePanel.classList.add('open');
    appContainer.classList.add('panel-open');
    panelOverlay.classList.add('visible');
    
    try {
        const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(filename)}`);
        if (!response.ok) throw new Error('Failed to load document');
        
        const data = await response.json();
        
        // Render markdown
        marked.setOptions({ breaks: true, gfm: true });
        articleContent.innerHTML = marked.parse(data.content);
        
    } catch (e) {
        articleContent.innerHTML = `<p class="error">Failed to load document: ${e.message}</p>`;
    }
}

async function deleteDocument(filename) {
    if (!confirm(`Delete "${filename}"? This will remove it from the index.`)) return;
    
    try {
        const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete');
        
        showToast(`Deleted ${filename}`, 'success');
        loadDocuments();
        
        // Close panel if viewing this doc
        if (articleTitle.textContent === filename) {
            closeSidePanel();
        }
    } catch (e) {
        showToast(`Failed to delete ${filename}`, 'error');
    }
}

async function deleteSelectedDocuments() {
    if (selectedDocs.size === 0) return;
    
    const count = selectedDocs.size;
    if (!confirm(`Delete ${count} document${count > 1 ? 's' : ''}?`)) return;
    
    const filenames = Array.from(selectedDocs);
    let deleted = 0;
    
    for (const filename of filenames) {
        try {
            const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });
            if (response.ok) deleted++;
        } catch (e) {
            console.error(`Failed to delete ${filename}:`, e);
        }
    }
    
    showToast(`Deleted ${deleted} document${deleted > 1 ? 's' : ''}`, 'success');
    loadDocuments();
    closeSidePanel();
}

async function uploadFiles(files) {
    if (files.length === 0) return;
    
    const formData = new FormData();
    for (const file of files) {
        formData.append('files', file);
    }
    
    showToast(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`, 'info');
    
    try {
        const response = await fetch(`${API_BASE}/documents/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Upload failed');
        }
        
        const data = await response.json();
        showToast(`Uploaded ${data.uploaded} file${data.uploaded > 1 ? 's' : ''}`, 'success');
        loadDocuments();
    } catch (e) {
        showToast(`Upload failed: ${e.message}`, 'error');
    }
}

async function reindexDocuments() {
    reindexButton.classList.add('loading');
    reindexButton.disabled = true;
    showToast('Reindexing documents...', 'info');
    
    try {
        const response = await fetch(`${API_BASE}/reindex`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Reindex failed');
        }
        
        const data = await response.json();
        showToast(`Reindexed: ${data.added} added, ${data.deleted} deleted`, 'success');
        loadDocuments();
    } catch (e) {
        showToast(`Reindex failed: ${e.message}`, 'error');
    } finally {
        reindexButton.classList.remove('loading');
        reindexButton.disabled = false;
    }
}

function toggleDocsPanelVisibility() {
    docsPanel.classList.toggle('collapsed');
    docsPanelExpand.classList.toggle('hidden', !docsPanel.classList.contains('collapsed'));
}

// ==========================================
// Health Check
// ==========================================

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

// ==========================================
// Search
// ==========================================

async function performSearch(query) {
    if (!query.trim()) return;
    
    closeSidePanel();
    
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

function displayResults(data) {
    if (data.results.length === 0) {
        emptyState.innerHTML = `
            <div class="empty-icon">🔍</div>
            <p>No results found for "${escapeHtml(data.query)}"</p>
        `;
        emptyState.classList.remove('hidden');
        return;
    }
    
    resultsCount.textContent = `${data.total} result${data.total !== 1 ? 's' : ''} found`;
    searchType.textContent = data.search_type;
    resultsHeader.classList.remove('hidden');
    
    const maxScore = Math.max(...data.results.map(r => r.score || 0));
    const normalizedResults = data.results.map(result => ({
        ...result,
        normalizedScore: maxScore > 0 ? Math.round((result.score / maxScore) * 100) : 0
    }));
    
    resultsDiv.innerHTML = normalizedResults.map((result, index) => createResultCard(result, index)).join('');
    
    document.querySelectorAll('.result-card').forEach((card, index) => {
        card.addEventListener('click', () => openArticlePanel(index));
    });
}

function createResultCard(result, index) {
    const metaTags = Object.entries(result.metadata)
        .filter(([key]) => !key.startsWith('_') && key !== 'source')
        .map(([key, value]) => `<span class="meta-tag">${escapeHtml(key)}: ${escapeHtml(String(value))}</span>`)
        .join('');
    
    const snippet = result.highlights.length > 0 
        ? result.highlights.join(' ... ')
        : escapeHtml(result.snippet);
    
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

// ==========================================
// Article Panel
// ==========================================

async function openArticlePanel(index) {
    const result = currentResults[index];
    if (!result) return;
    
    document.querySelectorAll('.result-card').forEach((card, i) => {
        card.classList.toggle('active', i === index);
    });
    
    // Clear doc list active state
    document.querySelectorAll('.doc-item').forEach(item => item.classList.remove('active'));
    
    articleTitle.textContent = result.title;
    
    const fullContent = await getFullDocument(result);
    const renderedHtml = renderMarkdownWithHighlight(fullContent, result.content);
    articleContent.innerHTML = renderedHtml;
    
    articlePanel.classList.add('open');
    appContainer.classList.add('panel-open');
    panelOverlay.classList.add('visible');
    
    setTimeout(() => {
        const highlightedSection = articleContent.querySelector('.highlight-section');
        if (highlightedSection) {
            highlightedSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

async function getFullDocument(result) {
    const source = result.metadata.source;
    
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
    
    return documentCache[source] || result.content;
}

function renderMarkdownWithHighlight(fullContent, matchContent) {
    marked.setOptions({ breaks: true, gfm: true });
    
    const normalizedMatch = normalizeText(matchContent);
    const sections = splitByHeaders(fullContent);
    
    let matchedSectionIndex = -1;
    for (let i = 0; i < sections.length; i++) {
        if (normalizeText(sections[i]).includes(normalizedMatch)) {
            matchedSectionIndex = i;
            break;
        }
    }
    
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
    
    let html = '';
    for (let i = 0; i < sections.length; i++) {
        let sectionHtml = marked.parse(sections[i]);
        sectionHtml = highlightSearchTerms(sectionHtml, currentSearchQuery);
        
        if (i === matchedSectionIndex) {
            html += `<div class="highlight-section">${sectionHtml}</div>`;
        } else {
            html += sectionHtml;
        }
    }
    
    return html || highlightSearchTerms(marked.parse(fullContent), currentSearchQuery);
}

function highlightSearchTerms(html, query) {
    if (!query) return html;
    
    const terms = query.toLowerCase().split(/\s+/).filter(term => term.length >= 2);
    if (terms.length === 0) return html;
    
    const temp = document.createElement('div');
    temp.innerHTML = html;
    highlightTextNodes(temp, terms);
    
    return temp.innerHTML;
}

function highlightTextNodes(element, terms) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    
    for (const textNode of textNodes) {
        const parentTag = textNode.parentNode.tagName?.toLowerCase();
        if (parentTag === 'mark' || parentTag === 'script' || parentTag === 'style' || parentTag === 'code') continue;
        
        const text = textNode.textContent;
        const highlighted = highlightTermsInText(text, terms);
        
        if (highlighted !== text) {
            const span = document.createElement('span');
            span.innerHTML = highlighted;
            textNode.parentNode.replaceChild(span, textNode);
        }
    }
}

function highlightTermsInText(text, terms) {
    if (!text.trim()) return text;
    const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    return text.replace(pattern, '<mark class="search-highlight">$1</mark>');
}

function splitByHeaders(content) {
    const lines = content.split('\n');
    const sections = [];
    let currentSection = [];
    
    for (const line of lines) {
        if (/^#{1,6}\s/.test(line) && currentSection.length > 0) {
            sections.push(currentSection.join('\n'));
            currentSection = [line];
        } else {
            currentSection.push(line);
        }
    }
    
    if (currentSection.length > 0) sections.push(currentSection.join('\n'));
    return sections;
}

function normalizeText(text) {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function closeSidePanel() {
    articlePanel.classList.remove('open');
    appContainer.classList.remove('panel-open');
    panelOverlay.classList.remove('visible');
    
    document.querySelectorAll('.result-card').forEach(card => card.classList.remove('active'));
    document.querySelectorAll('.doc-item').forEach(item => item.classList.remove('active'));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// Event Listeners
// ==========================================

// Search
searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    performSearch(searchInput.value);
});

// Article panel
closePanel.addEventListener('click', closeSidePanel);
panelOverlay.addEventListener('click', closeSidePanel);

// Docs panel
toggleDocsPanel.addEventListener('click', toggleDocsPanelVisibility);
docsPanelExpand.addEventListener('click', toggleDocsPanelVisibility);

fileUpload.addEventListener('change', (e) => {
    uploadFiles(e.target.files);
    e.target.value = '';
});

reindexButton.addEventListener('click', reindexDocuments);
deleteSelected.addEventListener('click', deleteSelectedDocuments);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && articlePanel.classList.contains('open')) {
        closeSidePanel();
    }
});

// ==========================================
// Initialize
// ==========================================

checkHealth();
loadDocuments();
