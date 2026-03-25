// chat.js
class ChatManager {
    constructor() {
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.messagesArea = document.getElementById('chatMessagesArea');
        // Генерируем имя пользователя один раз при загрузке
        this.username = localStorage.getItem('chatUsername') || 'User_' + Math.floor(Math.random() * 1000);
        localStorage.setItem('chatUsername', this.username);
        
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
    }

    async loadMessages() {
        try {
            const { data, error } = await supabaseClient
                .from('messages')
                .select('*')
                .order('created_at', { ascending: true })
                .limit(50);

            if (error) throw error;

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
            const { error } = await supabaseClient
                .from('messages')
                .insert([{
                    username: this.username,
                    content: content
                }]);

            if (error) throw error;

            this.messageInput.value = '';
        } catch (err) {
            console.error('Ошибка отправки:', err);
            alert('Не удалось отправить сообщение');
        }
    }

    subscribeToMessages() {
        supabaseClient
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

    appendMessage(msg) {
        const messageDiv = document.createElement('div');
        // Проверяем, своё ли это сообщение
        const isOwnMessage = msg.username === this.username;
        messageDiv.className = `message ${isOwnMessage ? 'message-own' : 'message-other'}`;
        
        messageDiv.innerHTML = `
            <div class="message-username">${this.escapeHtml(msg.username)}</div>
            <div class="message-content">${this.escapeHtml(msg.content)}</div>
            <div class="message-time">${new Date(msg.created_at).toLocaleTimeString()}</div>
        `;
        this.messagesArea.appendChild(messageDiv);
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
