// chat.js
class ChatManager {
    constructor() {
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.messagesArea = document.getElementById('chatMessagesArea');
        this.username = 'User_' + Math.floor(Math.random() * 1000);
        
        this.init();
    }

    init() {
        this.loadMessages();
        this.setupEventListeners();
        this.subscribeToMessages();
    }

    // Загрузка сообщений
    async loadMessages() {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(50);

        if (error) {
            console.error('Ошибка загрузки:', error);
            return;
        }

        this.messagesArea.innerHTML = '';
        data.forEach(msg => this.appendMessage(msg));
        this.scrollToBottom();
    }

    // Отправка сообщения
    async sendMessage() {
        const content = this.messageInput.value.trim();
        if (!content) return;

        const { error } = await supabase
            .from('messages')
            .insert([{
                username: this.username,
                content: content
            }]);

        if (error) {
            console.error('Ошибка отправки:', error);
            alert('Не удалось отправить сообщение');
            return;
        }

        this.messageInput.value = '';
        this.scrollToBottom();
    }

    // Подписка на новые сообщения (Realtime)
    subscribeToMessages() {
        supabase
            .channel('messages')
            .on('postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload) => {
                    this.appendMessage(payload.new);
                    this.scrollToBottom();
                }
            )
            .subscribe();
    }

    // Отображение сообщения
    appendMessage(msg) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.innerHTML = `
            <div class="message-username">${this.escapeHtml(msg.username)}</div>
            <div class="message-content">${this.escapeHtml(msg.content)}</div>
            <div class="message-time">${new Date(msg.created_at).toLocaleTimeString()}</div>
        `;
        this.messagesArea.appendChild(messageDiv);
    }

    // Прокрутка вниз
    scrollToBottom() {
        this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
    }

    // Защита от XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Обработчики событий
    setupEventListeners() {
        this.sendButton?.addEventListener('click', () => this.sendMessage());
        
        this.messageInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }
}

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    window.chatManager = new ChatManager();
});