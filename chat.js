// chat.js
class ChatManager {
    constructor() {
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.messagesArea = document.getElementById('chatMessagesArea');
        this.username = localStorage.getItem('chatUsername') || 'User_' + Math.floor(Math.random() * 1000);
        localStorage.setItem('chatUsername', this.username);
        
        this.contextMenu = null;
        this.currentMessageId = null;
        this.loadedMessageIds = new Set();
        this.pendingMessages = new Map();
        this.currentImage = null;
        this.imagePreview = null;
        
        if (typeof supabaseClient === 'undefined') {
            console.error('❌ Supabase клиент не инициализирован!');
            return;
        }
        
        console.log('✅ Чат инициализирован для:', this.username);
        this.init();
    }

    init() {
        this.loadMessages();
        this.setupEventListeners();
        this.subscribeToMessages();
        this.createContextMenu();
        this.setupImageHandling();
    }

    async loadMessages() {
        try {
            console.log('📥 Загрузка сообщений...');
            
            const { data, error } = await supabaseClient
                .from('messages')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) {
                console.error('❌ Ошибка загрузки:', error);
                return;
            }

            console.log('✅ Загружено сообщений:', data?.length || 0);
            
            this.messagesArea.innerHTML = '';
            this.loadedMessageIds.clear();
            
            if (data && data.length > 0) {
                data.forEach(msg => {
                    this.loadedMessageIds.add(msg.id);
                    this.appendMessage(msg, false);
                });
            }
            
            this.scrollToBottom();
        } catch (err) {
            console.error('❌ Ошибка загрузки сообщений:', err);
        }
    }

    async sendMessage() {
        const content = this.messageInput.value.trim();
        const image = this.currentImage;
        
        if (!content && !image) {
            console.log('⚠️ Нет контента для отправки');
            return;
        }
    
        // 🔍 ДОБАВЛЕНО: Логирование изображения
        console.log('📤 Отправка сообщения:', {
            content: content ? '✅ (' + content.length + ' симв.)' : '❌',
            image: image ? '✅ (' + (image.length / 1024).toFixed(2) + ' KB)' : '❌'
        });
    
        const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        try {
            this.appendMessage({
                id: tempId,
                username: this.username,
                content: content,
                image_url: image,
                created_at: new Date().toISOString()
            }, true);
            
            // 🔍 ДОБАВЛЕНО: Логирование перед отправкой в базу
            console.log('📦 Данные для вставки:', {
                username: this.username,
                content: content || null,
                image_url: image ? 'base64...' + image.substr(-20) : null,
                imageLength: image?.length
            });
            
            const { data, error } = await supabaseClient
                .from('messages')
                .insert([{
                    username: this.username,
                    content: content || null,
                    image_url: image || null
                }])
                .select();
    
            if (error) {
                console.error('❌ Ошибка отправки:', error);
                this.removeMessage(tempId);
                alert('Не удалось отправить сообщение: ' + error.message);
                return;
            }
    
            console.log('✅ Сообщение отправлено:', data);
            
            if (data && data[0]) {
                this.pendingMessages.set(tempId, data[0].id);
            }
            
            this.messageInput.value = '';
            this.clearImagePreview();
            
        } catch (err) {
            console.error('❌ Ошибка отправки:', err);
            this.removeMessage(tempId);
            alert('Не удалось отправить сообщение');
        }
    }

    async editMessage(messageId, newContent) {
        try {
            console.log('✏️ Редактирование сообщения:', messageId);
            
            const { error } = await supabaseClient
                .from('messages')
                .update({ content: newContent })
                .eq('id', messageId);

            if (error) {
                console.error('❌ Ошибка редактирования:', error);
                alert('Не удалось изменить сообщение');
                return;
            }

            console.log('✅ Сообщение изменено');
        } catch (err) {
            console.error('❌ Ошибка редактирования:', err);
        }
    }

    async deleteMessage(messageId) {
        try {
            console.log('🗑️ Удаление сообщения:', messageId);
            
            const { error } = await supabaseClient
                .from('messages')
                .delete()
                .eq('id', messageId);

            if (error) {
                console.error('❌ Ошибка удаления:', error);
                alert('Не удалось удалить сообщение');
                return;
            }

            console.log('✅ Сообщение удалено');
        } catch (err) {
            console.error('❌ Ошибка удаления:', err);
        }
    }

    subscribeToMessages() {
        const channel = supabaseClient
            .channel('messages')
            .on('postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload) => {
                    console.log('📬 Новое сообщение (Realtime):', payload.new);
                    
                    // Проверяем, не наше ли это pending сообщение
                    for (const [tempId, realId] of this.pendingMessages.entries()) {
                        if (realId === payload.new.id) {
                            // Это наше сообщение - просто подтверждаем
                            this.markMessageAsDelivered(tempId, payload.new.id);
                            return;
                        }
                    }
                    
                    // Чужое сообщение - добавляем
                    if (!this.loadedMessageIds.has(payload.new.id)) {
                        this.loadedMessageIds.add(payload.new.id);
                        this.appendMessage(payload.new, false);
                        this.scrollToBottom();
                    }
                }
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'messages' },
                (payload) => {
                    console.log('✏️ Сообщение изменено (Realtime):', payload.new);
                    this.updateMessage(payload.new);
                }
            )
            .on('postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'messages' },
                (payload) => {
                    console.log('🗑️ Сообщение удалено (Realtime):', payload.old);
                    this.removeMessage(payload.old.id);
                    this.loadedMessageIds.delete(payload.old.id);
                }
            )
            .subscribe((status) => {
                console.log('📡 Realtime статус:', status);
            });
    }

    markMessageAsDelivered(tempId, realId) {
        const pendingEl = document.querySelector(`[data-message-id="${tempId}"]`);
        if (pendingEl) {
            pendingEl.setAttribute('data-message-id', realId);
            pendingEl.classList.remove('message-pending');
            
            // Обновляем время
            const timeEl = pendingEl.querySelector('.message-time');
            if (timeEl) {
                timeEl.textContent = new Date().toLocaleTimeString();
            }
            
            this.loadedMessageIds.add(realId);
            this.pendingMessages.delete(tempId);
            console.log('✅ Сообщение подтверждено:', realId);
        }
    }

    appendMessage(msg, isPending = false) {
        // Проверяем дубликаты
        const existingMsg = document.querySelector(`[data-message-id="${msg.id}"]`);
        if (existingMsg) {
            return;
        }

        const isOwnMessage = msg.username === this.username;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwnMessage ? 'message-own' : 'message-other'} ${isPending ? 'message-pending' : ''}`;
        messageDiv.setAttribute('data-message-id', msg.id);
        
        let contentHtml = '';
        if (msg.image_url) {
            contentHtml += `<img src="${msg.image_url}" class="message-image" alt="Image">`;
        }
        if (msg.content) {
            contentHtml += `<div class="message-content">${this.escapeHtml(msg.content)}</div>`;
        }
        
        messageDiv.innerHTML = `
            <div class="message-username">${this.escapeHtml(msg.username)}</div>
            ${contentHtml}
            <div class="message-time">${isPending ? 'Отправка...' : new Date(msg.created_at).toLocaleTimeString()}</div>
        `;

        // Контекстное меню только для своих не-pending сообщений
        if (isOwnMessage && !isPending) {
            messageDiv.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, msg.id, messageDiv);
            });
        }

        this.messagesArea.appendChild(messageDiv);
    }

    updateMessage(msg) {
        const messageEl = document.querySelector(`[data-message-id="${msg.id}"]`);
        if (messageEl) {
            const contentEl = messageEl.querySelector('.message-content');
            if (contentEl) {
                contentEl.textContent = msg.content;
            }
            // Добавляем пометку об изменении
            const timeEl = messageEl.querySelector('.message-time');
            if (timeEl && !timeEl.textContent.includes('(изм.)')) {
                timeEl.textContent = timeEl.textContent + ' (изм.)';
            }
        }
    }

    removeMessage(messageId) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            messageEl.remove();
            console.log('💬 Сообщение удалено из DOM:', messageId);
        }
    }

    createContextMenu() {
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) existingMenu.remove();

        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu';
        this.contextMenu.innerHTML = `
            <div class="context-menu-item" id="editMessageBtn">
                <span>Изменить</span>
            </div>
            <div class="context-menu-item" id="deleteMessageBtn">
                <span>Удалить</span>
            </div>
        `;
        document.body.appendChild(this.contextMenu);

        document.getElementById('editMessageBtn').addEventListener('click', () => {
            if (this.currentMessageId) {
                this.promptEditMessage(this.currentMessageId);
            }
            this.hideContextMenu();
        });

        document.getElementById('deleteMessageBtn').addEventListener('click', () => {
            if (this.currentMessageId) {
                this.deleteMessage(this.currentMessageId);
            }
            this.hideContextMenu();
        });

        document.addEventListener('click', (e) => {
            if (!this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });

        this.messagesArea?.addEventListener('scroll', () => {
            this.hideContextMenu();
        });
    }

    promptEditMessage(messageId) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageEl) return;

        const contentEl = messageEl.querySelector('.message-content');
        const currentText = contentEl?.textContent || '';

        const newContent = prompt('Изменить сообщение:', currentText);
        if (newContent !== null && newContent.trim() !== '' && newContent !== currentText) {
            this.editMessage(messageId, newContent.trim());
        }
    }

    showContextMenu(e, messageId, messageElement) {
        this.currentMessageId = messageId;
        
        const menu = this.contextMenu;
        const messageRect = messageElement.getBoundingClientRect();
        const containerRect = this.messagesArea.getBoundingClientRect();
        
        // Позиционируем меню справа от сообщения (для своих сообщений)
        let left = messageRect.right - containerRect.left - 140;
        let top = messageRect.top - containerRect.top;
        
        // Ограничения
        if (left < 10) left = 10;
        if (left + 140 > containerRect.width - 10) {
            left = containerRect.width - 150;
        }
        if (top + 80 > containerRect.height) {
            top = containerRect.height - 90;
        }

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.display = 'block';
    }

    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }
        this.currentMessageId = null;
    }

    setupImageHandling() {
        // Вставка из буфера обмена
        this.messageInput.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const blob = item.getAsFile();
                    this.handleImageFile(blob);
                    break;
                }
            }
        });

        // Drag & Drop на всю область чата
        this.messagesArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.messagesArea.style.backgroundColor = '#1a1a25';
        });

        this.messagesArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.messagesArea.style.backgroundColor = '';
        });

        this.messagesArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.messagesArea.style.backgroundColor = '';
            
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (file.type.startsWith('image/')) {
                    this.handleImageFile(file);
                }
            }
        });
    }

    handleImageFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentImage = e.target.result;
            this.showImagePreview(this.currentImage);
        };
        reader.readAsDataURL(file);
    }

    showImagePreview(imageUrl) {
        // Удаляем старый превью если есть
        this.clearImagePreview();

        this.imagePreview = document.createElement('div');
        this.imagePreview.className = 'image-preview';
        this.imagePreview.innerHTML = `
            <img src="${imageUrl}" alt="Preview">
            <button class="image-preview-remove" title="Удалить изображение">✕</button>
        `;

        // Вставляем перед панелью ввода
        const inputPanel = document.querySelector('.message-input-panel');
        inputPanel.parentNode.insertBefore(this.imagePreview, inputPanel);

        // Кнопка удаления
        this.imagePreview.querySelector('.image-preview-remove').addEventListener('click', () => {
            this.clearImagePreview();
        });
    }

    clearImagePreview() {
        if (this.imagePreview) {
            this.imagePreview.remove();
            this.imagePreview = null;
        }
        this.currentImage = null;
    }

    scrollToBottom() {
        this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setupEventListeners() {
        this.sendButton?.addEventListener('click', () => this.sendMessage());
        
        this.messageInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.chatManager = new ChatManager();
});
