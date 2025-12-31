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

// Chat state
let chatHistory = [];
let currentStreamingMessage = null;

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

function addChatMessage(role, content, sources = []) {
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
                        <div class="source-item" title="${escapeHtml(s.content || '')}">
                            <span class="source-index">${i + 1}</span>
                            <span class="source-title">${escapeHtml(s.title || s.source || 'Unknown')}</span>
                        </div>
                    `).join('')}
                </div>
            `;
            messageDiv.appendChild(sourcesDiv);
        }
    }
    
    // Remove welcome message if exists
    const welcome = chatMessages.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
                    displayChatSources(sources);
                    const sourcesDiv = document.createElement('div');
                    sourcesDiv.className = 'chat-message-sources';
                    sourcesDiv.innerHTML = `
                        <div class="sources-header">📚 Sources:</div>
                        <div class="sources-list">
                            ${sources.map((s, i) => `
                                <div class="source-item" title="${escapeHtml(s.content || '')}">
                                    <span class="source-index">${i + 1}</span>
                                    <span class="source-title">${escapeHtml(s.title || s.source || 'Unknown')}</span>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    messageDiv.appendChild(sourcesDiv);
                }
                
                // Render markdown
                if (typeof marked !== 'undefined') {
                    marked.setOptions({ breaks: true, gfm: true });
                    contentDiv.innerHTML = marked.parse(fullContent);
                } else {
                    contentDiv.textContent = fullContent;
                }
                
                chatMessages.scrollTop = chatMessages.scrollHeight;
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

function displayChatSources(sources) {
    if (!chatSources) return;
    
    if (!sources || sources.length === 0) {
        chatSources.innerHTML = '';
        return;
    }
    
    chatSources.innerHTML = `
        <div class="sources-panel">
            <div class="sources-panel-header">📚 Sources (${sources.length})</div>
            <div class="sources-panel-list">
                ${sources.map((s, i) => `
                    <div class="source-panel-item" title="${escapeHtml(s.content || '')}">
                        <span class="source-panel-index">${i + 1}</span>
                        <div class="source-panel-content">
                            <div class="source-panel-title">${escapeHtml(s.title || s.source || 'Unknown')}</div>
                            <div class="source-panel-snippet">${escapeHtml((s.content || '').substring(0, 100))}...</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
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
}

