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

// File type icons
const FILE_ICONS = {
    'md': '📝',
    'pdf': '📕',
    'docx': '📘',
    'default': '📄'
};

function getFileIcon(fileType) {
    return FILE_ICONS[fileType] || FILE_ICONS['default'];
}

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
        
        const icon = getFileIcon(doc.file_type);
        const fileTypeLabel = doc.file_type ? doc.file_type.toUpperCase() : '';
        
        li.innerHTML = `
            <input type="checkbox" class="doc-checkbox" data-filename="${doc.filename}">
            <span class="doc-icon">${icon}</span>
            <div class="doc-info">
                <div class="doc-name" title="${doc.filename}">${doc.filename}</div>
                <div class="doc-meta">${formatFileSize(doc.size)} • ${doc.chunks} chunks${fileTypeLabel ? ' • ' + fileTypeLabel : ''}</div>
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
    
    // Determine file type
    const ext = filename.split('.').pop().toLowerCase();
    
    try {
        if (ext === 'pdf') {
            await renderPDF(filename);
        } else if (ext === 'docx') {
            await renderDOCX(filename);
        } else {
            // Markdown and other text files
            const response = await fetch(`${API_BASE}/documents/${encodeURIComponent(filename)}`);
            if (!response.ok) throw new Error('Failed to load document');
            
            const data = await response.json();
            marked.setOptions({ breaks: true, gfm: true });
            articleContent.innerHTML = marked.parse(data.content);
        }
    } catch (e) {
        articleContent.innerHTML = `<p class="error">Failed to load document: ${e.message}</p>`;
    }
}

// Global PDF viewer state
let pdfViewerState = null;
let currentRenderTask = null;

// Render PDF using PDF.js with text search
async function renderPDF(filename, searchText = null, targetPage = null) {
    const url = `${API_BASE}/documents/${encodeURIComponent(filename)}/raw`;
    
    // Create PDF container with controls
    articleContent.innerHTML = `
        <div class="pdf-viewer">
            <div class="pdf-controls">
                <button class="pdf-btn" id="pdf-prev-btn" title="Previous page">◀</button>
                <span class="pdf-page-info">
                    Page <span id="pdf-page-num">1</span> of <span id="pdf-page-count">-</span>
                </span>
                <button class="pdf-btn" id="pdf-next-btn" title="Next page">▶</button>
                <div class="pdf-page-search">
                    <input type="text" id="pdf-page-search-input" class="pdf-search-input" placeholder="Search in page..." />
                    <button class="pdf-btn pdf-search-btn" id="pdf-search-prev" title="Previous match">▲</button>
                    <button class="pdf-btn pdf-search-btn" id="pdf-search-next" title="Next match">▼</button>
                    <span class="pdf-search-count" id="pdf-search-count"></span>
                </div>
                <span class="pdf-zoom-controls">
                    <button class="pdf-btn" id="pdf-zoom-out-btn" title="Zoom out">−</button>
                    <span id="pdf-zoom-level">100%</span>
                    <button class="pdf-btn" id="pdf-zoom-in-btn" title="Zoom in">+</button>
                </span>
                <a href="${url}" download="${filename}" class="pdf-btn pdf-download" title="Download">⬇ Download</a>
            </div>
            ${searchText ? `<div class="pdf-search-info" id="pdf-search-info">
                <span class="search-indicator">🔍 Highlighting search matches</span>
            </div>` : ''}
            <div class="pdf-canvas-container" id="pdf-canvas-container">
                <canvas id="pdf-canvas"></canvas>
                <div id="pdf-text-layer" class="pdf-text-layer"></div>
            </div>
        </div>
    `;
    
    // Attach event listeners to buttons (more reliable than inline onclick)
    document.getElementById('pdf-prev-btn').addEventListener('click', pdfPrevPage);
    document.getElementById('pdf-next-btn').addEventListener('click', pdfNextPage);
    document.getElementById('pdf-zoom-out-btn').addEventListener('click', pdfZoomOut);
    document.getElementById('pdf-zoom-in-btn').addEventListener('click', pdfZoomIn);
    
    // Page search event listeners
    const pageSearchInput = document.getElementById('pdf-page-search-input');
    pageSearchInput.addEventListener('input', debounce(performPageSearch, 300));
    pageSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                navigatePageSearchMatch(-1);
            } else {
                navigatePageSearchMatch(1);
            }
        } else if (e.key === 'Escape') {
            pageSearchInput.value = '';
            clearPageSearchHighlights();
        }
    });
    document.getElementById('pdf-search-prev').addEventListener('click', () => navigatePageSearchMatch(-1));
    document.getElementById('pdf-search-next').addEventListener('click', () => navigatePageSearchMatch(1));
    
    // Load PDF.js dynamically
    const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
    
    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
    
    // Get the first page to calculate fit-to-width scale
    const firstPage = await pdf.getPage(1);
    const defaultViewport = firstPage.getViewport({ scale: 1.0 });
    
    // Calculate the scale needed to fit the page width to the container
    const container = document.getElementById('pdf-canvas-container');
    const containerWidth = container.clientWidth - 40; // Account for padding
    const fitWidthScale = containerWidth / defaultViewport.width;
    
    // Store state globally - start with fit-to-width scale
    pdfViewerState = {
        currentPage: 1,
        scale: fitWidthScale,
        pdf: pdf,
        searchText: searchText
    };
    
    // Update the zoom level display to show the calculated percentage
    const zoomEl = document.getElementById('pdf-zoom-level');
    if (zoomEl) zoomEl.textContent = Math.round(fitWidthScale * 100) + '%';
    
    document.getElementById('pdf-page-count').textContent = pdf.numPages;
    
    // Jump to target page - use provided page number or search for text
    if (targetPage && targetPage >= 1 && targetPage <= pdf.numPages) {
        // Use the page number from metadata directly
        pdfViewerState.currentPage = targetPage;
    } else if (searchText) {
        // Fallback: search for the page containing the text
        pdfViewerState.currentPage = await findPdfPageWithText(searchText);
    }
    
    // Initial render
    await renderPdfPage();
    
    // Scroll to first highlight after rendering
    if (searchText) {
        setTimeout(() => {
            scrollToFirstPdfHighlight();
        }, 300);
    }
}

// Scroll to the first highlighted text in PDF
function scrollToFirstPdfHighlight() {
    const textLayer = document.getElementById('pdf-text-layer');
    if (!textLayer) return;
    
    const firstHighlight = textLayer.querySelector('.search-highlight');
    if (firstHighlight) {
        const container = document.getElementById('pdf-canvas-container');
        if (container) {
            // Get the highlight position relative to the container
            const highlightRect = firstHighlight.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            // Calculate scroll position to center the highlight
            const scrollTop = container.scrollTop + (highlightRect.top - containerRect.top) - (containerRect.height / 3);
            container.scrollTo({
                top: Math.max(0, scrollTop),
                behavior: 'smooth'
            });
            
            // Add flash animation to highlight
            firstHighlight.classList.add('highlight-flash');
            setTimeout(() => {
                firstHighlight.classList.remove('highlight-flash');
            }, 2000);
        }
    }
}

async function renderPdfPage() {
    if (!pdfViewerState) {
        console.error('renderPdfPage: pdfViewerState is null');
        return;
    }
    
    const container = document.getElementById('pdf-canvas-container');
    if (!container) {
        console.error('renderPdfPage: container element not found');
        return;
    }
    
    // Cancel any pending render task
    if (currentRenderTask) {
        try {
            currentRenderTask.cancel();
        } catch (e) {
            // Ignore cancellation errors
        }
        currentRenderTask = null;
    }
    
    // Get the page and viewport
    const page = await pdfViewerState.pdf.getPage(pdfViewerState.currentPage);
    const viewport = page.getViewport({ scale: pdfViewerState.scale });
    
    // Remove old content, create new wrapper for canvas and text layer
    container.innerHTML = '';
    
    // Create a wrapper div to hold canvas and text layer together
    // This ensures they scroll together and the text layer is positioned correctly
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    wrapper.style.width = viewport.width + 'px';
    wrapper.style.height = viewport.height + 'px';
    
    const canvas = document.createElement('canvas');
    canvas.id = 'pdf-canvas';
    // Set internal canvas size
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    // IMPORTANT: Also set CSS display size to prevent auto-scaling
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    canvas.style.display = 'block';
    console.log('Canvas dimensions set to:', canvas.width, 'x', canvas.height, 'at scale', pdfViewerState.scale);
    wrapper.appendChild(canvas);
    
    const textLayer = document.createElement('div');
    textLayer.id = 'pdf-text-layer';
    textLayer.className = 'pdf-text-layer';
    textLayer.style.width = viewport.width + 'px';
    textLayer.style.height = viewport.height + 'px';
    wrapper.appendChild(textLayer);
    
    container.appendChild(wrapper);
    
    const ctx = canvas.getContext('2d');
    
    // Render the page
    const renderContext = {
        canvasContext: ctx,
        viewport: viewport
    };
    
    currentRenderTask = page.render(renderContext);
    
    try {
        await currentRenderTask.promise;
    } catch (e) {
        if (e.name === 'RenderingCancelledException') {
            // This is expected when we cancel a render
            return;
        }
        throw e;
    }
    
    currentRenderTask = null;
    
    const pageNumEl = document.getElementById('pdf-page-num');
    if (pageNumEl) pageNumEl.textContent = pdfViewerState.currentPage;
    
    // Render the text layer with positioned spans for text selection and search
    const textContent = await page.getTextContent();
    renderTextLayer(textLayer, textContent, viewport);
    
    // Render highlight boxes for RAG search matches
    // Highlights only the specific matching words, not entire text items
    if (pdfViewerState.searchText) {
        const searchTerms = getSearchTerms(pdfViewerState.searchText);
        const pageWrapper = document.querySelector('.pdf-page-wrapper');
        
        textContent.items.forEach(item => {
            if (!item.str || item.str.trim() === '') return;
            
            const text = item.str;
            const textLower = text.toLowerCase();
            
            // Get transform values: [scaleX, skewY, skewX, scaleY, translateX, translateY]
            const tx = item.transform;
            
            // Use viewport.convertToViewportPoint for coordinate conversion
            const [viewX, viewY] = viewport.convertToViewportPoint(tx[4], tx[5]);
            
            // Font height: the vertical scaling component of the transform, scaled by viewport
            const fontHeight = Math.hypot(tx[2], tx[3]) * viewport.scale;
            
            // Item width in viewport coordinates (item.width is in PDF units)
            const itemWidth = (item.width || text.length * fontHeight * 0.5) * viewport.scale;
            
            // Character width (approximate)
            const charWidth = text.length > 0 ? itemWidth / text.length : fontHeight * 0.6;
            
            // viewY is at the baseline, subtract font height for top
            const baseTop = viewY - fontHeight;
            
            // Find and highlight each occurrence of each search term
            searchTerms.forEach(term => {
                let startIndex = 0;
                let matchIndex;
                
                while ((matchIndex = textLower.indexOf(term, startIndex)) !== -1) {
                    // Calculate position for this specific match
                    const matchLeft = viewX + (matchIndex * charWidth);
                    const matchWidth = term.length * charWidth;
                    
                    // Create highlight box for just this word
                    const highlight = document.createElement('div');
                    highlight.className = 'pdf-highlight-box';
                    highlight.style.position = 'absolute';
                    highlight.style.left = Math.round(matchLeft) + 'px';
                    highlight.style.top = Math.round(baseTop) + 'px';
                    highlight.style.width = Math.round(Math.max(matchWidth, 8)) + 'px';
                    highlight.style.height = Math.round(fontHeight * 1.2) + 'px';
                    
                    if (pageWrapper) {
                        pageWrapper.appendChild(highlight);
                    } else {
                        textLayer.appendChild(highlight);
                    }
                    
                    startIndex = matchIndex + 1;
                }
            });
        });
    }
}

// Render text layer with positioned spans (for potential text selection)
function renderTextLayer(textLayerDiv, textContent, viewport) {
    textContent.items.forEach((item, index) => {
        if (!item.str || item.str.trim() === '') return;
        
        const tx = item.transform;
        
        // Create span for this text item
        const span = document.createElement('span');
        span.textContent = item.str;
        span.dataset.itemIndex = index;
        
        // Use viewport.convertToViewportPoint for consistent coordinate conversion
        const [viewX, viewY] = viewport.convertToViewportPoint(tx[4], tx[5]);
        
        // Calculate font height (scaled)
        const fontHeight = Math.hypot(tx[2], tx[3]) * viewport.scale;
        
        // Get angle for rotation if any
        const angle = Math.atan2(tx[1], tx[0]);
        
        // viewY is at baseline, subtract font height for top
        const top = viewY - fontHeight;
        
        // Apply styles
        span.style.position = 'absolute';
        span.style.left = `${viewX}px`;
        span.style.top = `${top}px`;
        span.style.fontSize = `${fontHeight}px`;
        span.style.fontFamily = item.fontName || 'sans-serif';
        span.style.transformOrigin = '0% 0%';
        span.style.whiteSpace = 'pre';
        
        // Apply rotation if needed
        if (Math.abs(angle) > 0.001) {
            span.style.transform = `rotate(${angle}rad)`;
        }
        
        // Scale width to match PDF text width
        if (item.width && item.str.length > 0) {
            const targetWidth = item.width * viewport.scale;
            // Use a canvas to measure natural text width
            span.style.width = `${targetWidth}px`;
            span.style.display = 'inline-block';
        }
        
        textLayerDiv.appendChild(span);
    });
}

// Extract search terms from query
function getSearchTerms(searchText) {
    if (!searchText || searchText.length < 2) return [];
    
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'it', 'its']);
    
    const words = searchText.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length >= 2 && !stopWords.has(w))
        .slice(0, 5);
    
    // If all filtered out, use original
    if (words.length === 0) {
        words.push(searchText.toLowerCase().trim());
    }
    
    return words;
}

async function findPdfPageWithText(text) {
    if (!pdfViewerState || !text) return 1;
    const searchLower = text.toLowerCase().substring(0, 50);
    
    for (let i = 1; i <= pdfViewerState.pdf.numPages; i++) {
        const page = await pdfViewerState.pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ').toLowerCase();
        if (pageText.includes(searchLower)) {
            return i;
        }
    }
    return 1;
}

// PDF navigation functions
async function pdfPrevPage() {
    if (!pdfViewerState || pdfViewerState.currentPage <= 1) return;
    pdfViewerState.currentPage--;
    try {
        await renderPdfPage();
        // Re-apply page search if there's an active search term
        const searchInput = document.getElementById('pdf-page-search-input');
        if (searchInput?.value.trim()) {
            performPageSearch();
        }
    } catch (e) {
        console.error('Error rendering PDF page:', e);
    }
}

async function pdfNextPage() {
    if (!pdfViewerState || pdfViewerState.currentPage >= pdfViewerState.pdf.numPages) return;
    pdfViewerState.currentPage++;
    try {
        await renderPdfPage();
        // Re-apply page search if there's an active search term
        const searchInput = document.getElementById('pdf-page-search-input');
        if (searchInput?.value.trim()) {
            performPageSearch();
        }
    } catch (e) {
        console.error('Error rendering PDF page:', e);
    }
}

async function pdfZoomIn() {
    console.log('pdfZoomIn called, current state:', pdfViewerState);
    if (!pdfViewerState) {
        console.error('pdfZoomIn: pdfViewerState is null');
        return;
    }
    const oldScale = pdfViewerState.scale;
    pdfViewerState.scale = Math.min(pdfViewerState.scale + 0.2, 3);
    console.log('Scale changed from', oldScale, 'to', pdfViewerState.scale);
    const zoomEl = document.getElementById('pdf-zoom-level');
    if (zoomEl) {
        const zoomText = Math.round(pdfViewerState.scale * 100) + '%';
        console.log('Updating zoom text to:', zoomText);
        zoomEl.textContent = zoomText;
    } else {
        console.error('Zoom level element not found');
    }
    try {
        console.log('Calling renderPdfPage...');
        await renderPdfPage();
        console.log('renderPdfPage completed');
    } catch (e) {
        console.error('Error rendering PDF page:', e);
    }
}

async function pdfZoomOut() {
    if (!pdfViewerState) return;
    pdfViewerState.scale = Math.max(pdfViewerState.scale - 0.2, 0.3);
    const zoomEl = document.getElementById('pdf-zoom-level');
    if (zoomEl) zoomEl.textContent = Math.round(pdfViewerState.scale * 100) + '%';
    try {
        await renderPdfPage();
    } catch (e) {
        console.error('Error rendering PDF page:', e);
    }
}

// Make PDF functions globally available
window.pdfPrevPage = pdfPrevPage;
window.pdfNextPage = pdfNextPage;
window.pdfZoomIn = pdfZoomIn;
window.pdfZoomOut = pdfZoomOut;

// ==========================================
// PDF Page Search Functions
// ==========================================

// Page search state
let pageSearchState = {
    matches: [],
    currentMatchIndex: -1,
    searchTerm: ''
};

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Perform search on current page
async function performPageSearch() {
    const searchInput = document.getElementById('pdf-page-search-input');
    const searchCountEl = document.getElementById('pdf-search-count');
    const searchTerm = searchInput?.value.trim().toLowerCase();
    
    // Clear previous highlights
    clearPageSearchHighlights();
    
    // Reset state
    pageSearchState = {
        matches: [],
        currentMatchIndex: -1,
        searchTerm: searchTerm || ''
    };
    
    if (!searchTerm || searchTerm.length < 2 || !pdfViewerState) {
        if (searchCountEl) searchCountEl.textContent = '';
        return;
    }
    
    try {
        const pageWrapper = document.querySelector('.pdf-page-wrapper');
        if (!pageWrapper) {
            console.error('Page wrapper not found');
            return;
        }
        
        const page = await pdfViewerState.pdf.getPage(pdfViewerState.currentPage);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: pdfViewerState.scale });
        
        const matches = [];
        
        textContent.items.forEach((item, itemIndex) => {
            if (!item.str) return;
            
            const text = item.str;
            const textLower = text.toLowerCase();
            let startIndex = 0;
            let matchIndex;
            
            while ((matchIndex = textLower.indexOf(searchTerm, startIndex)) !== -1) {
                // Get transform values: [scaleX, skewY, skewX, scaleY, translateX, translateY]
                const tx = item.transform;
                
                // Use viewport.convertToViewportPoint for coordinate conversion
                // This handles the PDF->viewport coordinate transformation including scale
                const [viewX, viewY] = viewport.convertToViewportPoint(tx[4], tx[5]);
                
                // Font height: the vertical scaling component of the transform
                // Already need to scale by viewport for display
                const fontHeight = Math.hypot(tx[2], tx[3]) * viewport.scale;
                
                // Item width in viewport coordinates
                // item.width is in PDF units, needs scaling
                const itemWidth = (item.width || text.length * fontHeight * 0.5) * viewport.scale;
                
                // Character width (approximate - assumes monospace-ish distribution)
                const charWidth = text.length > 0 ? itemWidth / text.length : fontHeight * 0.6;
                
                // Calculate match position within the text item
                const matchLeft = viewX + (matchIndex * charWidth);
                const matchWidth = searchTerm.length * charWidth;
                
                // viewY from convertToViewportPoint is at the text baseline
                // Subtract font height to get top of text
                const matchTop = viewY - fontHeight;
                
                matches.push({
                    itemIndex,
                    textIndex: matchIndex,
                    left: Math.round(matchLeft),
                    top: Math.round(matchTop),
                    width: Math.round(Math.max(matchWidth, 8)),
                    height: Math.round(fontHeight * 1.2),
                    text: text.substring(matchIndex, matchIndex + searchTerm.length)
                });
                
                startIndex = matchIndex + 1;
            }
        });
        
        pageSearchState.matches = matches;
        console.log(`Found ${matches.length} matches for "${searchTerm}"`);
        
        // Create highlight elements
        matches.forEach((match, index) => {
            const highlight = document.createElement('div');
            highlight.className = 'pdf-page-search-highlight';
            highlight.dataset.matchIndex = index;
            highlight.style.position = 'absolute';
            highlight.style.left = match.left + 'px';
            highlight.style.top = match.top + 'px';
            highlight.style.width = match.width + 'px';
            highlight.style.height = match.height + 'px';
            pageWrapper.appendChild(highlight);
        });
        
        // Update count display
        if (searchCountEl) {
            if (matches.length > 0) {
                searchCountEl.textContent = `${matches.length} found`;
                navigatePageSearchMatch(1);
            } else {
                searchCountEl.textContent = 'No matches';
            }
        }
    } catch (e) {
        console.error('Error during page search:', e);
        if (searchCountEl) searchCountEl.textContent = 'Error';
    }
}

// Navigate to next/previous match
function navigatePageSearchMatch(direction) {
    const matches = pageSearchState.matches;
    if (matches.length === 0) return;
    
    const searchCountEl = document.getElementById('pdf-search-count');
    const pageWrapper = document.querySelector('.pdf-page-wrapper');
    
    // Remove current highlight class from previous match
    if (pageSearchState.currentMatchIndex >= 0) {
        const prevHighlight = pageWrapper?.querySelector(`.pdf-page-search-highlight[data-match-index="${pageSearchState.currentMatchIndex}"]`);
        if (prevHighlight) {
            prevHighlight.classList.remove('current');
        }
    }
    
    // Calculate new index
    let newIndex = pageSearchState.currentMatchIndex + direction;
    if (newIndex >= matches.length) newIndex = 0;
    if (newIndex < 0) newIndex = matches.length - 1;
    
    pageSearchState.currentMatchIndex = newIndex;
    
    // Highlight current match
    const currentHighlight = pageWrapper?.querySelector(`.pdf-page-search-highlight[data-match-index="${newIndex}"]`);
    if (currentHighlight) {
        currentHighlight.classList.add('current');
        
        // Scroll to current match
        const container = document.getElementById('pdf-canvas-container');
        if (container) {
            const highlightRect = currentHighlight.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            const scrollTop = container.scrollTop + (highlightRect.top - containerRect.top) - (containerRect.height / 3);
            container.scrollTo({
                top: Math.max(0, scrollTop),
                behavior: 'smooth'
            });
        }
    }
    
    // Update count display
    if (searchCountEl) {
        searchCountEl.textContent = `${newIndex + 1} / ${matches.length}`;
    }
}

// Clear page search highlights
function clearPageSearchHighlights() {
    const pageWrapper = document.querySelector('.pdf-page-wrapper');
    if (pageWrapper) {
        const highlights = pageWrapper.querySelectorAll('.pdf-page-search-highlight');
        highlights.forEach(h => h.remove());
    }
    pageSearchState = {
        matches: [],
        currentMatchIndex: -1,
        searchTerm: ''
    };
    const searchCountEl = document.getElementById('pdf-search-count');
    if (searchCountEl) searchCountEl.textContent = '';
}

// Render DOCX using Mammoth.js with highlighting
async function renderDOCX(filename, searchText = null) {
    const url = `${API_BASE}/documents/${encodeURIComponent(filename)}/raw`;
    
    articleContent.innerHTML = `
        <div class="docx-viewer">
            <div class="docx-controls">
                <a href="${url}" download="${filename}" class="pdf-btn pdf-download" title="Download">⬇ Download Original</a>
            </div>
            <div class="docx-content" id="docx-content">
                <div class="docs-loading"><div class="spinner small"></div><span>Rendering document...</span></div>
            </div>
        </div>
    `;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch document');
        
        const arrayBuffer = await response.arrayBuffer();
        
        // Use Mammoth.js to convert DOCX to HTML
        const result = await mammoth.convertToHtml(
            { arrayBuffer },
            {
                styleMap: [
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh",
                    "p[style-name='Heading 3'] => h3:fresh",
                ]
            }
        );
        
        const docxContent = document.getElementById('docx-content');
        docxContent.innerHTML = result.value;
        
        // Highlight and scroll to search text if provided
        if (searchText) {
            highlightTextInElement(docxContent, searchText);
            
            // Scroll to first highlight
            setTimeout(() => {
                const firstHighlight = docxContent.querySelector('.search-highlight');
                if (firstHighlight) {
                    firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Add flash animation
                    firstHighlight.closest('p, div, li, td')?.classList.add('highlight-section');
                }
            }, 100);
        }
        
        // Show any conversion warnings
        if (result.messages.length > 0) {
            console.log('Mammoth conversion messages:', result.messages);
        }
    } catch (e) {
        document.getElementById('docx-content').innerHTML = `<p class="error">Failed to render document: ${e.message}</p>`;
    }
}

// Helper function to highlight text in an element
function highlightTextInElement(element, searchText, isPdfTextLayer = false) {
    if (!searchText || searchText.length < 2) return;
    
    // For search queries: use the whole query and significant words
    // Split by spaces and filter out very short/common words
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'it', 'its']);
    
    const words = searchText.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length >= 2 && !stopWords.has(w))
        .slice(0, 5); // Max 5 significant words
    
    if (words.length === 0) {
        // If all words were filtered out, use the original search text
        words.push(searchText.toLowerCase().trim());
    }
    
    // Build regex pattern for all words
    const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escapedWords.join('|')})`, 'gi');
    
    if (isPdfTextLayer) {
        // For PDF text layer: directly modify each span's innerHTML
        // This preserves the absolute positioning of each span
        const spans = element.querySelectorAll('span');
        spans.forEach(span => {
            const text = span.textContent;
            if (!text) return;
            
            const textLower = text.toLowerCase();
            const hasMatch = words.some(word => textLower.includes(word));
            if (!hasMatch) return;
            
            const highlighted = text.replace(pattern, '<mark class="search-highlight">$1</mark>');
            if (highlighted !== text) {
                span.innerHTML = highlighted;
            }
        });
    } else {
        // For other elements: use TreeWalker approach
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        
        for (const textNode of textNodes) {
            const parentTag = textNode.parentNode.tagName?.toLowerCase();
            if (parentTag === 'mark' || parentTag === 'script' || parentTag === 'style') continue;
            
            const text = textNode.textContent;
            const textLower = text.toLowerCase();
            
            // Check if any search word is in this text
            const hasMatch = words.some(word => textLower.includes(word));
            if (!hasMatch) continue;
            
            const highlighted = text.replace(pattern, '<mark class="search-highlight">$1</mark>');
            
            if (highlighted !== text) {
                const span = document.createElement('span');
                span.innerHTML = highlighted;
                textNode.parentNode.replaceChild(span, textNode);
            }
        }
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
    const fileType = result.metadata.file_type;
    const pageNum = result.metadata.page !== undefined ? result.metadata.page + 1 : null;
    const section = result.metadata.section;
    
    const metaTags = Object.entries(result.metadata)
        .filter(([key]) => !key.startsWith('_') && key !== 'source' && key !== 'page' && key !== 'section')
        .map(([key, value]) => {
            // Add icon for file_type
            if (key === 'file_type') {
                const icon = FILE_ICONS[value] || FILE_ICONS['default'];
                return `<span class="meta-tag">${icon} ${escapeHtml(String(value).toUpperCase())}</span>`;
            }
            return `<span class="meta-tag">${escapeHtml(key)}: ${escapeHtml(String(value))}</span>`;
        })
        .join('');
    
    const snippet = result.highlights.length > 0 
        ? result.highlights.join(' ... ')
        : escapeHtml(result.snippet);
    
    const scoreDisplay = result.normalizedScore !== undefined
        ? `<span class="result-score">Relevance: ${result.normalizedScore}</span>`
        : '';
    
    // Create location indicator for PDFs (page) or MD (section)
    let locationTag = '';
    if (fileType === 'pdf' && pageNum) {
        locationTag = `<span class="meta-tag location-tag" title="Click to jump to page ${pageNum}">📍 Page ${pageNum}</span>`;
    } else if (section) {
        locationTag = `<span class="meta-tag location-tag" title="Click to jump to section">📍 ${escapeHtml(section)}</span>`;
    }
    
    return `
        <article class="result-card" data-index="${index}">
            <h3 class="result-title">${escapeHtml(result.title)}</h3>
            <p class="result-snippet">${snippet}</p>
            <div class="result-meta">
                ${metaTags}
                ${locationTag}
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
    articleContent.innerHTML = '<div class="docs-loading"><div class="spinner small"></div><span>Loading...</span></div>';
    
    articlePanel.classList.add('open');
    appContainer.classList.add('panel-open');
    panelOverlay.classList.add('visible');
    
    // Determine file type from metadata
    const fileType = result.metadata.file_type;
    const sourceFilename = result.metadata.source_filename;
    // Use the actual search query for highlighting (not the result content)
    const searchQuery = currentSearchQuery;
    // Get page number from metadata (0-indexed in ES, convert to 1-indexed for display)
    const targetPage = result.metadata.page !== undefined ? result.metadata.page + 1 : null;
    
    try {
        if (fileType === 'pdf' && sourceFilename) {
            await renderPDF(sourceFilename, searchQuery, targetPage);
        } else if (fileType === 'docx' && sourceFilename) {
            await renderDOCX(sourceFilename, searchQuery);
        } else {
            // Markdown and other text files - use existing logic
            const fullContent = await getFullDocument(result);
            const renderedHtml = renderMarkdownWithHighlight(fullContent, result.content);
            articleContent.innerHTML = renderedHtml;
            
            setTimeout(() => {
                const highlightedSection = articleContent.querySelector('.highlight-section');
                if (highlightedSection) {
                    highlightedSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    } catch (e) {
        articleContent.innerHTML = `<p class="error">Failed to load document: ${e.message}</p>`;
    }
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
