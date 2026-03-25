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
        this.pendingMessages = new Map(); // Храним временные ID pending сообщений
        
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
    }

    async loadMessages() {
        try {
            console.log('📥 Загрузка сообщений...');
            
            const { data, error } = await supabaseClient
                .from('messages')
                .select('*')
                .order('created_at', { ascending: true })

            if (error) {
                console.error('❌ Ошибка загрузки:', error);
                alert('Ошибка загрузки сообщений: ' + error.message);
                return;
            }

            console.log('✅ Загружено сообщений:', data?.length || 0);
            
            this.messagesArea.innerHTML = '';
            this.loadedMessageIds.clear();
            
            if (data && data.length > 0) {
                data.forEach(msg => {
                    this.loadedMessageIds.add(msg.id);
                    this.appendMessage(msg, false); // false = не pending
                });
            }
            
            this.scrollToBottom();
        } catch (err) {
            console.error('❌ Ошибка загрузки сообщений:', err);
        }
    }

    async sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content) return;

        // Генерируем временный ID для optimistic UI
        const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        try {
            console.log('📤 Отправка сообщения:', content);
            
            // 1. СРАЗУ добавляем сообщение в UI (optimistic update)
            this.appendMessage({
                id: tempId,
                username: this.username,
                content: content,
                created_at: new Date().toISOString()
            }, true); // true = pending
            
            // 2. Отправляем на сервер
            const { data, error } = await supabaseClient
                .from('messages')
                .insert([{
                    username: this.username,
                    content: content
                }])
                .select();

            if (error) {
                console.error('❌ Ошибка отправки:', error);
                // Удаляем pending сообщение при ошибке
                this.removeMessage(tempId);
                alert('Не удалось отправить сообщение: ' + error.message);
                return;
            }

            console.log('✅ Сообщение отправлено:', data);
            
            // 3. Заменяем pending сообщение на реальное (когда придёт realtime - оно не дублируется)
            this.pendingMessages.set(tempId, data[0]?.id);
            this.messageInput.value = '';
            
        } catch (err) {
            console.error('❌ Ошибка отправки:', err);
            this.removeMessage(tempId);
            alert('Не удалось отправить сообщение');
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
                alert('Не удалось удалить сообщение: ' + error.message);
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
                    
                    // Проверяем, нет ли уже такого сообщения
                    if (this.loadedMessageIds.has(payload.new.id)) {
                        // Это наше сообщение, убираем pending статус
                        this.markMessageAsDelivered(payload.new.id);
                        return;
                    }
                    
                    this.loadedMessageIds.add(payload.new.id);
                    this.appendMessage(payload.new, false);
                    this.scrollToBottom();
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

    markMessageAsDelivered(realId) {
        // Ищем pending сообщение и заменяем его ID на реальный
        for (const [tempId, storedRealId] of this.pendingMessages.entries()) {
            if (storedRealId === realId) {
                const pendingEl = document.querySelector(`[data-message-id="${tempId}"]`);
                if (pendingEl) {
                    pendingEl.setAttribute('data-message-id', realId);
                    pendingEl.classList.remove('message-pending');
                    this.loadedMessageIds.add(realId);
                    this.pendingMessages.delete(tempId);
                    console.log('✅ Сообщение подтверждено:', realId);
                }
                break;
            }
        }
    }

    appendMessage(msg, isPending = false) {
        // Проверяем, существует ли уже сообщение с таким ID
        const existingMsg = document.querySelector(`[data-message-id="${msg.id}"]`);
        if (existingMsg) {
            return;
        }

        const isOwnMessage = msg.username === this.username;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwnMessage ? 'message-own' : 'message-other'} ${isPending ? 'message-pending' : ''}`;
        messageDiv.setAttribute('data-message-id', msg.id);
        
        messageDiv.innerHTML = `
            <div class="message-username">${this.escapeHtml(msg.username)}</div>
            <div class="message-content">${this.escapeHtml(msg.content)}</div>
            <div class="message-time">${isPending ? 'Отправка...' : new Date(msg.created_at).toLocaleTimeString()}</div>
        `;

        // Контекстное меню только для своих сообщений (не pending)
        if (isOwnMessage && !isPending) {
            messageDiv.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, msg.id, messageDiv);
            });
        }

        this.messagesArea.appendChild(messageDiv);
    }

    removeMessage(messageId) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            messageEl.remove();
            console.log('💬 Сообщение удалено из DOM:', messageId);
        }
    }

    createContextMenu() {
        // Удаляем старое меню если есть
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) existingMenu.remove();

        // Создаём элемент контекстного меню
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu';
        this.contextMenu.innerHTML = `
            <div class="context-menu-item" id="deleteMessageBtn">
                <span>Удалить</span>
            </div>
        `;
        document.body.appendChild(this.contextMenu);

        // Обработчик удаления
        document.getElementById('deleteMessageBtn').addEventListener('click', () => {
            if (this.currentMessageId) {
                this.deleteMessage(this.currentMessageId);
            }
            this.hideContextMenu();
        });

        // Скрытие меню при клике в любом месте
        document.addEventListener('click', (e) => {
            if (!this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });

        // Скрытие при прокрутке
        this.messagesArea?.addEventListener('scroll', () => {
            this.hideContextMenu();
        });
    }

    showContextMenu(e, messageId, messageElement) {
        this.currentMessageId = messageId;
        
        const menu = this.contextMenu;
        const messageRect = messageElement.getBoundingClientRect();
        const containerRect = this.messagesArea.getBoundingClientRect();
        
        // Позиционируем меню относительно сообщения
        let left = messageRect.right - containerRect.left - 150; // 150px - ширина меню
        let top = messageRect.top - containerRect.top;
        
        // Проверка чтобы меню не выходило за границы слева
        if (left < 10) {
            left = 10;
        }
        
        // Проверка чтобы меню не выходило за границы справа
        if (left + 150 > containerRect.width - 10) {
            left = containerRect.width - 160;
        }
        
        // Проверка чтобы меню не выходило за границы снизу
        if (top + 40 > containerRect.height) {
            top = containerRect.height - 50;
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
