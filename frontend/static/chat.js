// ==========================================
// Chat Functions
// ==========================================

// API base URL (duplicated from app.js since modules have separate scope)
const API_BASE = '/api';

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Toast notification (simplified version)
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.log(`[${type}] ${message}`);
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-message">${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// DOM Elements - Chat
const tabSearch = document.getElementById('tab-search');
const tabChat = document.getElementById('tab-chat');
const searchMain = document.querySelector('.main:not(.chat-main)');
const chatMain = document.getElementById('chat-main');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatRagToggle = document.getElementById('chat-rag-toggle');
const chatLoading = document.getElementById('chat-loading');
const chatSources = document.getElementById('chat-sources');

// Conversation Management DOM Elements
const newConversationBtn = document.getElementById('new-conversation');
const toggleHistoryBtn = document.getElementById('toggle-history');
const historyPanel = document.getElementById('conversation-history-panel');
const historyList = document.getElementById('history-list');
const historyCount = document.getElementById('history-count');
const currentConvTitle = document.getElementById('current-conv-title');
const closeHistoryBtn = document.getElementById('close-history');
const clearAllHistoryBtn = document.getElementById('clear-all-history');

// Search elements
const historySearchInput = document.getElementById('history-search-input');
const historySearchClear = document.getElementById('history-search-clear');
const historySearchResults = document.getElementById('history-search-results');
const searchResultsCount = document.getElementById('search-results-count');

// Rename dialog elements
const renameDialogOverlay = document.getElementById('rename-dialog-overlay');
const renameInput = document.getElementById('rename-input');
const renameDialogClose = document.getElementById('rename-dialog-close');
const renameCancelBtn = document.getElementById('rename-cancel');
const renameSaveBtn = document.getElementById('rename-save');

// Chat state
let chatHistory = [];
let currentStreamingMessage = null;

// Conversation Management State
const STORAGE_KEY = 'rag_chat_conversations';
let conversations = [];
let currentConversationId = null;
let renameTargetId = null;
let currentSearchQuery = '';

// ==========================================
// Conversation Management Functions
// ==========================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function loadConversations() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        conversations = stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Failed to load conversations:', e);
        conversations = [];
    }
    updateHistoryCount();
}

function saveConversations() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (e) {
        console.error('Failed to save conversations:', e);
        showToast('Failed to save conversation', 'error');
    }
}

function updateHistoryCount() {
    if (historyCount) {
        historyCount.textContent = conversations.length;
        historyCount.style.display = conversations.length > 0 ? 'inline-flex' : 'none';
    }
}

function getConversationTitle(messages) {
    if (!messages || messages.length === 0) return 'New Conversation';
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
        const title = firstUserMessage.content.substring(0, 40);
        return title.length < firstUserMessage.content.length ? title + '...' : title;
    }
    return 'New Conversation';
}

function saveCurrentConversation() {
    if (chatHistory.length === 0) return;
    
    if (currentConversationId) {
        // Update existing conversation
        const index = conversations.findIndex(c => c.id === currentConversationId);
        if (index !== -1) {
            conversations[index].messages = [...chatHistory];
            // Only update title if it hasn't been manually renamed
            if (!conversations[index].customTitle) {
                conversations[index].title = getConversationTitle(chatHistory);
            }
            conversations[index].updatedAt = Date.now();
        }
    } else {
        // Create new conversation
        const title = getConversationTitle(chatHistory);
        const newConversation = {
            id: generateId(),
            title: title,
            messages: [...chatHistory],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            pinned: false,
            customTitle: false
        };
        conversations.unshift(newConversation);
        currentConversationId = newConversation.id;
    }
    
    // Re-sort after update
    sortConversations();
    
    saveConversations();
    updateHistoryCount();
    updateCurrentConversationTitle();
}

function updateCurrentConversationTitle() {
    if (currentConvTitle) {
        let title;
        if (currentConversationId) {
            const conv = conversations.find(c => c.id === currentConversationId);
            if (conv) {
                title = conv.title;
                if (conv.pinned) {
                    title = '📌 ' + title;
                }
            } else {
                title = getConversationTitle(chatHistory);
            }
        } else {
            title = getConversationTitle(chatHistory);
        }
        currentConvTitle.textContent = title;
    }
}

function startNewConversation() {
    // Save current conversation first if it has messages
    if (chatHistory.length > 0) {
        saveCurrentConversation();
    }
    
    // Reset state
    chatHistory = [];
    currentConversationId = null;
    
    // Clear UI
    if (chatMessages) {
        chatMessages.innerHTML = `
            <div class="chat-welcome">
                <div class="welcome-icon">💬</div>
                <h2>Start a conversation</h2>
                <p>Ask questions about your documents and get AI-powered answers with RAG.</p>
            </div>
        `;
    }
    if (chatSources) {
        chatSources.innerHTML = '';
    }
    
    updateCurrentConversationTitle();
    closeHistoryPanel();
    
    if (chatInput) {
        chatInput.focus();
    }
    
    showToast('Started new conversation', 'success');
}

function loadConversation(conversationId) {
    const conversation = conversations.find(c => c.id === conversationId);
    if (!conversation) {
        showToast('Conversation not found', 'error');
        return;
    }
    
    // Save current conversation first if it has messages and is different
    if (chatHistory.length > 0 && currentConversationId !== conversationId) {
        saveCurrentConversation();
    }
    
    // Load the selected conversation
    chatHistory = [...conversation.messages];
    currentConversationId = conversationId;
    
    // Rebuild UI
    if (chatMessages) {
        chatMessages.innerHTML = '';
        chatHistory.forEach(msg => {
            addChatMessage(msg.role, msg.content, msg.sources || [], false);
        });
    }
    if (chatSources) {
        chatSources.innerHTML = '';
    }
    
    updateCurrentConversationTitle();
    closeHistoryPanel();
    
    if (chatInput) {
        chatInput.focus();
    }
    
    showToast('Loaded conversation', 'success');
}

function deleteConversation(conversationId, event) {
    event.stopPropagation();
    
    const index = conversations.findIndex(c => c.id === conversationId);
    if (index === -1) return;
    
    conversations.splice(index, 1);
    saveConversations();
    updateHistoryCount();
    renderHistoryList();
    
    // If we deleted the current conversation, start fresh
    if (currentConversationId === conversationId) {
        chatHistory = [];
        currentConversationId = null;
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="chat-welcome">
                    <div class="welcome-icon">💬</div>
                    <h2>Start a conversation</h2>
                    <p>Ask questions about your documents and get AI-powered answers with RAG.</p>
                </div>
            `;
        }
        updateCurrentConversationTitle();
    }
    
    showToast('Conversation deleted', 'success');
}

function clearAllConversations() {
    if (!confirm('Are you sure you want to delete all conversations? This cannot be undone.')) {
        return;
    }
    
    conversations = [];
    saveConversations();
    updateHistoryCount();
    renderHistoryList();
    
    // Reset current state
    chatHistory = [];
    currentConversationId = null;
    if (chatMessages) {
        chatMessages.innerHTML = `
            <div class="chat-welcome">
                <div class="welcome-icon">💬</div>
                <h2>Start a conversation</h2>
                <p>Ask questions about your documents and get AI-powered answers with RAG.</p>
            </div>
        `;
    }
    updateCurrentConversationTitle();
    
    showToast('All conversations cleared', 'success');
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // Less than 1 minute
    if (diff < 60000) return 'Just now';
    // Less than 1 hour
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    // Less than 24 hours
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    // Less than 7 days
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    // Otherwise, show date
    return date.toLocaleDateString();
}

// ==========================================
// Pin, Rename, Search Functions
// ==========================================

function togglePinConversation(conversationId, event) {
    event.stopPropagation();
    
    const index = conversations.findIndex(c => c.id === conversationId);
    if (index === -1) return;
    
    conversations[index].pinned = !conversations[index].pinned;
    conversations[index].updatedAt = Date.now();
    
    // Sort conversations: pinned first, then by updatedAt
    sortConversations();
    
    saveConversations();
    renderHistoryList();
    
    const action = conversations.find(c => c.id === conversationId)?.pinned ? 'pinned' : 'unpinned';
    showToast(`Conversation ${action}`, 'success');
}

function sortConversations() {
    conversations.sort((a, b) => {
        // Pinned conversations first
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        // Then by updatedAt (most recent first)
        return b.updatedAt - a.updatedAt;
    });
}

function openRenameDialog(conversationId, event) {
    event.stopPropagation();
    
    const conversation = conversations.find(c => c.id === conversationId);
    if (!conversation) return;
    
    renameTargetId = conversationId;
    if (renameInput) {
        renameInput.value = conversation.title;
    }
    if (renameDialogOverlay) {
        renameDialogOverlay.classList.remove('hidden');
    }
    setTimeout(() => {
        if (renameInput) {
            renameInput.focus();
            renameInput.select();
        }
    }, 100);
}

function closeRenameDialog() {
    if (renameDialogOverlay) {
        renameDialogOverlay.classList.add('hidden');
    }
    renameTargetId = null;
    if (renameInput) {
        renameInput.value = '';
    }
}

function saveRename() {
    if (!renameTargetId || !renameInput) return;
    
    const newTitle = renameInput.value.trim();
    if (!newTitle) {
        showToast('Name cannot be empty', 'error');
        return;
    }
    
    const index = conversations.findIndex(c => c.id === renameTargetId);
    if (index === -1) return;
    
    conversations[index].title = newTitle;
    conversations[index].customTitle = true; // Mark as manually renamed
    conversations[index].updatedAt = Date.now();
    
    saveConversations();
    renderHistoryList();
    
    // Update current conversation title if it's the one being renamed
    if (currentConversationId === renameTargetId) {
        updateCurrentConversationTitle();
    }
    
    closeRenameDialog();
    showToast('Conversation renamed', 'success');
}

function searchConversations(query) {
    currentSearchQuery = query.toLowerCase().trim();
    
    if (historySearchClear) {
        historySearchClear.classList.toggle('hidden', !currentSearchQuery);
    }
    
    if (!currentSearchQuery) {
        if (historySearchResults) {
            historySearchResults.classList.add('hidden');
        }
        renderHistoryList();
        return;
    }
    
    // Search in titles and message contents
    const results = conversations.filter(conv => {
        // Search in title
        if (conv.title.toLowerCase().includes(currentSearchQuery)) {
            return true;
        }
        // Search in messages
        return conv.messages.some(msg => 
            msg.content.toLowerCase().includes(currentSearchQuery)
        );
    });
    
    if (historySearchResults && searchResultsCount) {
        historySearchResults.classList.remove('hidden');
        searchResultsCount.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;
    }
    
    renderHistoryList(results);
}

function clearSearch() {
    currentSearchQuery = '';
    if (historySearchInput) {
        historySearchInput.value = '';
    }
    if (historySearchClear) {
        historySearchClear.classList.add('hidden');
    }
    if (historySearchResults) {
        historySearchResults.classList.add('hidden');
    }
    renderHistoryList();
}

function highlightSearchMatch(text, query) {
    if (!query) return escapeHtml(text);
    
    const escapedText = escapeHtml(text);
    const escapedQuery = escapeHtml(query);
    const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapedText.replace(regex, '<mark class="search-match">$1</mark>');
}

function getMatchingSnippet(messages, query) {
    if (!query) return null;
    
    for (const msg of messages) {
        const lowerContent = msg.content.toLowerCase();
        const index = lowerContent.indexOf(query);
        if (index !== -1) {
            // Get snippet around the match
            const start = Math.max(0, index - 20);
            const end = Math.min(msg.content.length, index + query.length + 40);
            let snippet = msg.content.substring(start, end);
            if (start > 0) snippet = '...' + snippet;
            if (end < msg.content.length) snippet = snippet + '...';
            return { snippet, role: msg.role };
        }
    }
    return null;
}

function renderHistoryList(filteredConversations = null) {
    if (!historyList) return;
    
    const conversationsToRender = filteredConversations || conversations;
    
    if (conversationsToRender.length === 0) {
        if (currentSearchQuery) {
            historyList.innerHTML = `
                <div class="history-empty">
                    <p>No matching conversations</p>
                    <p class="hint">Try a different search term</p>
                </div>
            `;
        } else {
            historyList.innerHTML = `
                <div class="history-empty">
                    <p>No previous conversations yet</p>
                    <p class="hint">Your conversations will appear here</p>
                </div>
            `;
        }
        return;
    }
    
    historyList.innerHTML = conversationsToRender.map(conv => {
        const matchSnippet = currentSearchQuery ? getMatchingSnippet(conv.messages, currentSearchQuery) : null;
        const titleHtml = currentSearchQuery ? highlightSearchMatch(conv.title, currentSearchQuery) : escapeHtml(conv.title);
        
        return `
        <div class="history-item ${conv.id === currentConversationId ? 'active' : ''} ${conv.pinned ? 'pinned' : ''}" 
             data-id="${conv.id}"
             title="${escapeHtml(conv.title)}">
            <div class="history-item-icon">${conv.pinned ? '📌' : '💬'}</div>
            <div class="history-item-content">
                <div class="history-item-title">${titleHtml}</div>
                ${matchSnippet ? `
                    <div class="history-item-snippet">
                        <span class="snippet-role">${matchSnippet.role === 'user' ? '👤' : '🤖'}</span>
                        ${highlightSearchMatch(matchSnippet.snippet, currentSearchQuery)}
                    </div>
                ` : ''}
                <div class="history-item-meta">
                    <span class="history-item-count">${conv.messages.length} messages</span>
                    <span class="history-item-time">${formatTimestamp(conv.updatedAt)}</span>
                </div>
            </div>
            <div class="history-item-actions">
                <button class="history-action-btn pin-btn ${conv.pinned ? 'active' : ''}" data-id="${conv.id}" title="${conv.pinned ? 'Unpin' : 'Pin to top'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2v8m0 0l-3-3m3 3l3-3M5 15h14M8 22l4-4 4 4"></path>
                    </svg>
                </button>
                <button class="history-action-btn rename-btn" data-id="${conv.id}" title="Rename">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="history-action-btn delete-btn" data-id="${conv.id}" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        </div>
    `}).join('');
    
    // Add click handlers
    historyList.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Don't trigger if clicking on action buttons
            if (e.target.closest('.history-item-actions')) return;
            loadConversation(item.dataset.id);
        });
    });
    
    historyList.querySelectorAll('.pin-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            togglePinConversation(btn.dataset.id, e);
        });
    });
    
    historyList.querySelectorAll('.rename-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            openRenameDialog(btn.dataset.id, e);
        });
    });
    
    historyList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            deleteConversation(btn.dataset.id, e);
        });
    });
}

function toggleHistoryPanel() {
    if (!historyPanel) return;
    
    const isOpen = !historyPanel.classList.contains('hidden');
    if (isOpen) {
        closeHistoryPanel();
    } else {
        openHistoryPanel();
    }
}

function openHistoryPanel() {
    if (!historyPanel) return;
    renderHistoryList();
    historyPanel.classList.remove('hidden');
    if (toggleHistoryBtn) {
        toggleHistoryBtn.classList.add('active');
    }
}

function closeHistoryPanel() {
    if (!historyPanel) return;
    historyPanel.classList.add('hidden');
    if (toggleHistoryBtn) {
        toggleHistoryBtn.classList.remove('active');
    }
}

// Initialize conversation management
function initConversationManagement() {
    loadConversations();
    
    // Sort conversations on load (pinned first)
    sortConversations();
    
    if (newConversationBtn) {
        newConversationBtn.addEventListener('click', startNewConversation);
    }
    
    if (toggleHistoryBtn) {
        toggleHistoryBtn.addEventListener('click', toggleHistoryPanel);
    }
    
    if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener('click', closeHistoryPanel);
    }
    
    if (clearAllHistoryBtn) {
        clearAllHistoryBtn.addEventListener('click', clearAllConversations);
    }
    
    // Search functionality
    if (historySearchInput) {
        historySearchInput.addEventListener('input', (e) => {
            searchConversations(e.target.value);
        });
        historySearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearSearch();
            }
        });
    }
    
    if (historySearchClear) {
        historySearchClear.addEventListener('click', clearSearch);
    }
    
    // Rename dialog
    if (renameDialogClose) {
        renameDialogClose.addEventListener('click', closeRenameDialog);
    }
    
    if (renameCancelBtn) {
        renameCancelBtn.addEventListener('click', closeRenameDialog);
    }
    
    if (renameSaveBtn) {
        renameSaveBtn.addEventListener('click', saveRename);
    }
    
    if (renameInput) {
        renameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveRename();
            } else if (e.key === 'Escape') {
                closeRenameDialog();
            }
        });
    }
    
    // Close rename dialog when clicking overlay
    if (renameDialogOverlay) {
        renameDialogOverlay.addEventListener('click', (e) => {
            if (e.target === renameDialogOverlay) {
                closeRenameDialog();
            }
        });
    }
    
    updateCurrentConversationTitle();
}

function switchTab(tabName) {
    if (!tabSearch || !tabChat || !searchMain || !chatMain) {
        console.error('Tab elements not found');
        return;
    }
    
    if (tabName === 'search') {
        tabSearch.classList.add('active');
        tabChat.classList.remove('active');
        searchMain.classList.remove('hidden');
        chatMain.classList.add('hidden');
    } else if (tabName === 'chat') {
        tabSearch.classList.remove('active');
        tabChat.classList.add('active');
        searchMain.classList.add('hidden');
        chatMain.classList.remove('hidden');
        // Focus chat input
        if (chatInput) {
            setTimeout(() => chatInput.focus(), 100);
        }
    }
}

function addChatMessage(role, content, sources = [], shouldScroll = true) {
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message chat-message-${role}`;
    
    if (role === 'user') {
        messageDiv.innerHTML = `
            <div class="chat-message-content">${escapeHtml(content)}</div>
        `;
    } else {
        // Render markdown for assistant messages
        let html = escapeHtml(content);
        if (typeof marked !== 'undefined') {
            marked.setOptions({ breaks: true, gfm: true });
            html = marked.parse(content);
        }
        messageDiv.innerHTML = `
            <div class="chat-message-content">${html}</div>
        `;
        
        // Add sources if available
        if (sources && sources.length > 0) {
            const sourcesDiv = document.createElement('div');
            sourcesDiv.className = 'chat-message-sources';
            sourcesDiv.innerHTML = `
                <div class="sources-header">📚 Sources:</div>
                <div class="sources-list">
                    ${sources.map((s, i) => `
                        <div class="source-item source-clickable" data-source-index="${i}" title="${escapeHtml(s.content || '')}">
                            <span class="source-index">${i + 1}</span>
                            <span class="source-title">${escapeHtml(s.title || s.source || 'Unknown')}</span>
                            <span class="source-arrow">→</span>
                        </div>
                    `).join('')}
                </div>
            `;
            messageDiv.appendChild(sourcesDiv);
            
            // Store sources for click handlers when loading conversation
            if (sources.length > 0) {
                window.chatSourcesData = sources;
            }
            
            // Add click handlers for inline sources
            sourcesDiv.querySelectorAll('.source-clickable').forEach(item => {
                item.addEventListener('click', () => {
                    const index = parseInt(item.dataset.sourceIndex);
                    openSourceDocument(index);
                });
            });
        }
    }
    
    // Remove welcome message if exists
    const welcome = chatMessages.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    
    chatMessages.appendChild(messageDiv);
    if (shouldScroll) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

async function sendChatMessage() {
    if (!chatInput) return;
    
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Add user message to UI
    addChatMessage('user', message);
    
    // Add to history
    chatHistory.push({ role: 'user', content: message });
    
    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    
    // Show loading
    if (chatLoading) chatLoading.classList.remove('hidden');
    if (chatSend) chatSend.disabled = true;
    chatInput.disabled = true;
    
    // Clear sources
    if (chatSources) chatSources.innerHTML = '';
    
    try {
        const useRag = chatRagToggle ? chatRagToggle.checked : true;
        await streamChatResponse(message, useRag);
    } catch (e) {
        console.error('Chat error:', e);
        addChatMessage('assistant', `Error: ${e.message}`);
        showToast('Failed to get response', 'error');
    } finally {
        if (chatLoading) chatLoading.classList.add('hidden');
        if (chatSend) chatSend.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
}

async function streamChatResponse(message, useRag) {
    if (!chatMessages) {
        throw new Error('Chat messages container not found');
    }
    
    // Store the current query for source highlighting
    window.chatSearchQuery = message;
    
    const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: message,
            history: chatHistory.slice(0, -1), // Exclude current message
            use_rag: useRag
        })
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Stream failed' }));
        throw new Error(error.detail || 'Stream failed');
    }
    
    // Create message div for streaming
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message chat-message-assistant';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-message-content';
    messageDiv.appendChild(contentDiv);
    
    // Remove welcome message if exists
    const welcome = chatMessages.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    
    chatMessages.appendChild(messageDiv);
    currentStreamingMessage = contentDiv;
    
    let fullContent = '';
    let sources = [];
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue;
            
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
                // Streaming complete
                if (currentStreamingMessage === contentDiv) {
                    currentStreamingMessage = null;
                }
                
                // Add to history
                chatHistory.push({ role: 'assistant', content: fullContent });
                
                // Display sources if available
                if (sources.length > 0) {
                    displayChatSources(sources, message);
                    const sourcesDiv = document.createElement('div');
                    sourcesDiv.className = 'chat-message-sources';
                    sourcesDiv.innerHTML = `
                        <div class="sources-header">📚 Sources:</div>
                        <div class="sources-list">
                            ${sources.map((s, i) => {
                                const pageInfo = s.page !== null && s.page !== undefined ? ` (p.${s.page + 1})` : '';
                                return `
                                    <div class="source-item source-clickable" data-source-index="${i}" title="Click to view">
                                        <span class="source-index">${i + 1}</span>
                                        <span class="source-title">${escapeHtml(s.title || s.source || 'Unknown')}${pageInfo}</span>
                                        <span class="source-arrow">→</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                    messageDiv.appendChild(sourcesDiv);
                    
                    // Add click handlers for inline sources
                    sourcesDiv.querySelectorAll('.source-clickable').forEach(item => {
                        item.addEventListener('click', () => {
                            const index = parseInt(item.dataset.sourceIndex);
                            openSourceDocument(index);
                        });
                    });
                }
                
                // Render markdown
                if (typeof marked !== 'undefined') {
                    marked.setOptions({ breaks: true, gfm: true });
                    contentDiv.innerHTML = marked.parse(fullContent);
                } else {
                    contentDiv.textContent = fullContent;
                }
                
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // Save conversation after receiving response
                saveCurrentConversation();
                updateCurrentConversationTitle();
                
                return;
            }
            
            try {
                const data = JSON.parse(dataStr);
                
                if (data.type === 'sources') {
                    sources = data.sources || [];
                } else if (data.type === 'chunk') {
                    fullContent += data.content || '';
                    // Update content in real-time (plain text for now, will render markdown at end)
                    contentDiv.textContent = fullContent;
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } else if (data.type === 'error') {
                    throw new Error(data.error || 'Streaming error');
                }
            } catch (e) {
                // Skip invalid JSON
                if (e instanceof SyntaxError) continue;
                throw e;
            }
        }
    }
}

function displayChatSources(sources, searchQuery = '') {
    if (!chatSources) return;
    
    if (!sources || sources.length === 0) {
        chatSources.innerHTML = '';
        return;
    }
    
    // Store sources globally for click handlers
    window.chatSourcesData = sources;
    window.chatSearchQuery = searchQuery;
    
    chatSources.innerHTML = `
        <div class="sources-panel">
            <div class="sources-panel-header">📚 Sources (${sources.length})</div>
            <div class="sources-panel-list">
                ${sources.map((s, i) => {
                    const fileIcon = getFileIcon(s.file_type);
                    const pageInfo = s.page !== null && s.page !== undefined ? ` • Page ${s.page + 1}` : '';
                    return `
                        <div class="source-panel-item source-clickable" 
                             data-source-index="${i}"
                             title="Click to view: ${escapeHtml(s.content || '')}">
                            <span class="source-panel-index">${i + 1}</span>
                            <div class="source-panel-content">
                                <div class="source-panel-title">
                                    <span class="source-file-icon">${fileIcon}</span>
                                    ${escapeHtml(s.title || s.source || 'Unknown')}
                                </div>
                                <div class="source-panel-meta">${escapeHtml(s.file_type?.toUpperCase() || '')}${pageInfo}</div>
                                <div class="source-panel-snippet">${escapeHtml((s.content || '').substring(0, 100))}...</div>
                            </div>
                            <span class="source-panel-arrow">→</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    // Add click handlers
    chatSources.querySelectorAll('.source-clickable').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.sourceIndex);
            openSourceDocument(index);
        });
    });
}

// File type icons
function getFileIcon(fileType) {
    const icons = {
        'md': '📝',
        'pdf': '📕',
        'docx': '📘',
    };
    return icons[fileType] || '📄';
}

// Open source document with highlighting
function openSourceDocument(index) {
    const sources = window.chatSourcesData;
    const searchQuery = window.chatSearchQuery;
    
    if (!sources || !sources[index]) return;
    
    const source = sources[index];
    const filename = source.source_filename || source.title;
    const fileType = source.file_type;
    const page = source.page;
    const content = source.content;
    
    // Call the global function to open document (defined in app.js)
    if (typeof window.openDocumentWithHighlight === 'function') {
        window.openDocumentWithHighlight(filename, fileType, page, searchQuery || content);
    } else {
        console.error('openDocumentWithHighlight function not available');
        showToast('Unable to open document', 'error');
    }
}

// Initialize chat functionality
if (tabSearch && tabChat) {
    // Tab switching
    tabSearch.addEventListener('click', () => switchTab('search'));
    tabChat.addEventListener('click', () => switchTab('chat'));
    
    // Chat send button
    if (chatSend) {
        chatSend.addEventListener('click', sendChatMessage);
    }
    
    // Auto-resize textarea
    if (chatInput) {
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
        
        // Send on Enter (Shift+Enter for new line)
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
    
    // Initialize conversation management
    initConversationManagement();
}

