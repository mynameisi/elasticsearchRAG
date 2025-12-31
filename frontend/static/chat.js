// ==========================================
// Chat Functions
// ==========================================

// Helper functions (in case they're not available from app.js)
function escapeHtml(text) {
    if (!text) return '';
    // Use global escapeHtml if available, otherwise use our own
    if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') {
        return window.escapeHtml(text);
    }
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Chat state
let chatHistory = [];
let currentStreamingMessage = null;
let chatElements = {};
let chatInitialized = false;

function initChat() {
    // Prevent multiple initializations
    if (chatInitialized) return;
    chatInitialized = true;
    
    // DOM Elements - Chat
    chatElements.tabSearch = document.getElementById('tab-search');
    chatElements.tabChat = document.getElementById('tab-chat');
    // Find search main - it's the first main that's not chat-main
    const allMains = document.querySelectorAll('.main');
    chatElements.searchMain = Array.from(allMains).find(m => !m.classList.contains('chat-main'));
    chatElements.chatMain = document.getElementById('chat-main');
    chatElements.chatMessages = document.getElementById('chat-messages');
    chatElements.chatInput = document.getElementById('chat-input');
    chatElements.chatSend = document.getElementById('chat-send');
    chatElements.chatRagToggle = document.getElementById('chat-rag-toggle');
    chatElements.chatLoading = document.getElementById('chat-loading');
    chatElements.chatSources = document.getElementById('chat-sources');
    
    // Get API_BASE from window or use default
    if (typeof window.API_BASE === 'undefined') {
        window.API_BASE = '/api';
    }
    
    // Initialize event listeners
    if (chatElements.tabSearch && chatElements.tabChat) {
        chatElements.tabSearch.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchTab('search');
        });
        chatElements.tabChat.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchTab('chat');
        });
    }
    
    if (chatElements.chatSend) {
        chatElements.chatSend.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            sendChatMessage();
        });
    }
    
    if (chatElements.chatInput) {
        chatElements.chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        });
        
        chatElements.chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
}

// Wait for DOM to be ready
(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChat);
    } else {
        // Use setTimeout to ensure DOM is fully ready
        setTimeout(initChat, 0);
    }
})();

function switchTab(tabName) {
    const { tabSearch, tabChat, searchMain, chatMain, chatInput } = chatElements;
    if (!tabSearch || !tabChat || !searchMain || !chatMain) return;
    
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
    const { chatMessages } = chatElements;
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message chat-message-${role}`;
    
    if (role === 'user') {
        messageDiv.innerHTML = `
            <div class="chat-message-content">${escapeHtml(content)}</div>
        `;
    } else {
        // Render markdown for assistant messages
        if (typeof marked !== 'undefined') {
            marked.setOptions({ breaks: true, gfm: true });
            const html = marked.parse(content);
            messageDiv.innerHTML = `
                <div class="chat-message-content">${html}</div>
            `;
        } else {
            // Fallback to plain text if marked is not available
            messageDiv.innerHTML = `
                <div class="chat-message-content">${escapeHtml(content)}</div>
            `;
        }
        
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
    const { chatInput, chatLoading, chatSend, chatRagToggle, chatSources } = chatElements;
    if (!chatInput || !chatSend) return;
    
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
    chatSend.disabled = true;
    chatInput.disabled = true;
    
    // Clear sources
    if (chatSources) chatSources.innerHTML = '';
    
    try {
        const useRag = chatRagToggle ? chatRagToggle.checked : true;
        await streamChatResponse(message, useRag);
    } catch (e) {
        console.error('Chat error:', e);
        addChatMessage('assistant', `Error: ${e.message}`);
        if (typeof showToast === 'function') {
            showToast('Failed to get response', 'error');
        } else {
            alert('Failed to get response: ' + e.message);
        }
    } finally {
        if (chatLoading) chatLoading.classList.add('hidden');
        chatSend.disabled = false;
        chatInput.disabled = false;
        if (chatInput) chatInput.focus();
    }
}

async function streamChatResponse(message, useRag) {
    const { chatMessages, chatLoading } = chatElements;
    if (!chatMessages) return;
    
    const API_BASE = window.API_BASE || '/api';
    
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
    let hasError = false;
    
    try {
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
                    currentStreamingMessage = null;
                    
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
                        hasError = true;
                        throw new Error(data.error || 'Streaming error');
                    }
                } catch (e) {
                    // Skip invalid JSON
                    if (e instanceof SyntaxError) continue;
                    throw e;
                }
            }
        }
    } catch (e) {
        currentStreamingMessage = null;
        if (!hasError) {
            throw e;
        }
    } finally {
        // Ensure loading is hidden
        if (chatLoading) chatLoading.classList.add('hidden');
    }
}

function displayChatSources(sources) {
    const { chatSources } = chatElements;
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

