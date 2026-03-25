// chat.js
class ChatManager {
    constructor() {
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.messagesArea = document.getElementById('chatMessagesArea');
        this.username = localStorage.getItem('chatUsername') || 'User_' + Math.floor(Math.random() * 1000);
        localStorage.setItem('chatUsername', this.username);
        
        this.contextMenu = null;
        
        if (typeof supabaseClient === 'undefined') {
            console.error('Supabase клиент не инициализирован!');
            return;
        }
        
        this.init();
    }

    init() {
        this.loadMessages();
        this.setupEventListeners();
        this.subscribeToMessages();
        this.createContextMenu();
        console.log('Чат инициализирован для:', this.username);
    }

    async loadMessages() {
        try {
            console.log('Загрузка сообщений...');
            const { data, error } = await supabaseClient
                .from('messages')
                .select('*')
                .order('created_at', { ascending: true })
                .limit(100);

            if (error) {
                console.error('Ошибка загрузки:', error);
                alert('Ошибка загрузки сообщений: ' + error.message);
                return;
            }

            console.log('Загружено сообщений:', data?.length);
            this.messagesArea.innerHTML = '';
            if (data) {
                data.forEach(msg => this.appendMessage(msg));
            }
            this.scrollToBottom();
        } catch (err) {
            console.error('Ошибка загрузки сообщений:', err);
        }
    }

    async sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content) return;

        try {
            console.log('Отправка сообщения:', content);
            const { data, error } = await supabaseClient
                .from('messages')
                .insert([{
                    username: this.username,
                    content: content
                }])
                .select();

            if (error) {
                console.error('Ошибка отправки:', error);
                alert('Не удалось отправить сообщение: ' + error.message);
                return;
            }

            console.log('Сообщение отправлено:', data);
            this.messageInput.value = '';
        } catch (err) {
            console.error('Ошибка отправки:', err);
            alert('Не удалось отправить сообщение');
        }
    }

    async deleteMessage(messageId) {
        if (!confirm('Удалить это сообщение?')) return;

        try {
            const { error } = await supabaseClient
                .from('messages')
                .delete()
                .eq('id', messageId);

            if (error) {
                console.error('Ошибка удаления:', error);
                alert('Не удалось удалить сообщение');
                return;
            }

            console.log('Сообщение удалено');
        } catch (err) {
            console.error('Ошибка удаления:', err);
        }
    }

    subscribeToMessages() {
        supabaseClient
            .channel('messages')
            .on('postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload) => {
                    console.log('Новое сообщение:', payload.new);
                    this.appendMessage(payload.new);
                    this.scrollToBottom();
                }
            )
            .on('postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'messages' },
                (payload) => {
                    console.log('Сообщение удалено:', payload.old);
                    this.removeMessage(payload.old.id);
                }
            )
            .subscribe();
    }

    appendMessage(msg) {
        // Проверяем, существует ли уже сообщение с таким ID
        const existingMsg = document.querySelector(`[data-message-id="${msg.id}"]`);
        if (existingMsg) return;

        const isOwnMessage = msg.username === this.username;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwnMessage ? 'message-own' : 'message-other'}`;
        messageDiv.setAttribute('data-message-id', msg.id);
        
        messageDiv.innerHTML = `
            <div class="message-username">${this.escapeHtml(msg.username)}</div>
            <div class="message-content">${this.escapeHtml(msg.content)}</div>
            <div class="message-time">${new Date(msg.created_at).toLocaleTimeString()}</div>
        `;

        // Контекстное меню только для своих сообщений
        if (isOwnMessage) {
            messageDiv.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, msg.id);
            });
        }

        this.messagesArea.appendChild(messageDiv);
    }

    removeMessage(messageId) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            messageEl.remove();
        }
    }

    createContextMenu() {
        // Создаём элемент контекстного меню
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu';
        this.contextMenu.innerHTML = `
            <div class="context-menu-item" id="deleteMessageBtn">
                <span>🗑️</span>
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

    showContextMenu(e, messageId) {
        this.currentMessageId = messageId;
        
        const menu = this.contextMenu;
        const rect = this.messagesArea.getBoundingClientRect();
        
        // Позиционируем меню
        let left = e.clientX - rect.left;
        let top = e.clientY - rect.top;
        
        // Проверка чтобы меню не выходило за границы
        if (left + 150 > rect.width) {
            left = rect.width - 150;
        }
        if (top + 50 > rect.height) {
            top = rect.height - 50;
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
