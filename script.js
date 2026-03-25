document.addEventListener('DOMContentLoaded', () => {
    const chatListPanel = document.getElementById('chatListPanel');
    const resizeHandle = document.getElementById('resizeHandle');
    
    let isResizing = false;

    // 1. Начало перетаскивания (нажали кнопку мыши)
    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizeHandle.classList.add('active'); // Подсветка разделителя
        document.body.style.cursor = 'col-resize'; // Глобальный курсор
        document.body.style.userSelect = 'none'; // Запрет выделения текста
    });
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        // Вычисляем новую ширину: позиция мыши минус ширина левой панели (options)
        // options-sidebar у нас 60px
        const newWidth = e.clientX - 60; 

        // Ограничения (мин и макс ширина, чтобы не сломать верстку)
        if (newWidth > 200 && newWidth < 800) {
            chatListPanel.style.width = `${newWidth}px`;
        }
    });

    // 3. Конец перетаскивания (отпустили кнопку мыши)
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('active');
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        }
    });
});