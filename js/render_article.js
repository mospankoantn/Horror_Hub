document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('article-content');
    
    // 1. Отримуємо ID статті з URL (ВІН СТВОРЮЄТЬСЯ ТУТ)
    const urlParams = new URLSearchParams(window.location.search);
    const articleId = urlParams.get('id');

    if (!articleId) {
        container.innerHTML = '<h1>Помилка 404</h1><p>Статтю не знайдено або її поглинула темрява.</p>';
        return;
    }

    // ==========================================
    // ЛОГІКА КОМЕНТАРІВ (Тепер вона бачить articleId!)
    // ==========================================
    const commentsList = document.getElementById('comments-list');
    const commentFormContainer = document.getElementById('comment-form-container');

    // Функція завантаження коментарів
    async function loadComments() {
        try {
            // Ось тут використовується articleId (рядок 89 у твоїй помилці)
            const res = await fetch(`api_comments.php?action=get&article_id=${articleId}`);
            const comments = await res.json();
            
            if (!commentsList) return;

            commentsList.innerHTML = '';
            if(comments.length === 0) {
                commentsList.innerHTML = '<p>Поки немає коментарів. Будь першим, хто порушить тишу...</p>';
                return;
            }

            comments.forEach(c => {
                let adminBadge = c.role === 'admin' ? '<span style="color: red; font-size: 0.7em; margin-left: 5px;">[АДМІН]</span>' : '';
                commentsList.innerHTML += `
                    <div style="border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1rem;">
                        <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 5px;">
                            <img src="${c.avatar}" style="width:30px; height:30px; border-radius:50%; border:1px solid var(--red-dark); object-fit: cover;">
                            <strong style="color:var(--red-bright)">${c.username} ${adminBadge}</strong>
                            <span style="color:var(--text-muted); font-size: 0.8rem;">${c.created_at}</span>
                        </div>
                        <p style="color: #ddd; margin:0; padding-left: 40px;">${c.comment_text}</p>
                    </div>
                `;
            });
        } catch (error) {
            console.error("Помилка завантаження коментарів:", error);
            if (commentsList) commentsList.innerHTML = '<p style="color:red;">Помилка завантаження коментарів.</p>';
        }
    }

    // Перевірка авторизації та показ форми
    async function checkAuthAndShowForm() {
        if (!commentFormContainer) return;

        try {
            const res = await fetch('api_auth.php?action=status');
            const auth = await res.json();
            
            if (auth.logged_in) {
                commentFormContainer.innerHTML = `
                    <form id="addCommentForm" style="display: flex; flex-direction: column; gap: 10px;">
                        <textarea id="commentText" rows="3" placeholder="Напишіть свій моторошний коментар..." required style="background: var(--surface-2); color: white; border: 1px solid var(--border-red); padding: 10px; border-radius: 4px; font-family: var(--font-body); resize: vertical;"></textarea>
                        <button type="submit" style="background: var(--red-main); color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; align-self: flex-start; font-weight: bold; text-transform: uppercase;">Відправити</button>
                    </form>
                `;
                
                document.getElementById('addCommentForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const text = document.getElementById('commentText').value;
                    const fd = new FormData();
                    fd.append('action', 'post');
                    // Ось тут використовується articleId (рядок 131 у твоїй помилці)
                    fd.append('article_id', articleId);
                    fd.append('comment_text', text);
                    
                    await fetch('api_comments.php', { method: 'POST', body: fd });
                    document.getElementById('commentText').value = '';
                    loadComments(); // Оновлюємо список після додавання
                });
            } else {
                commentFormContainer.innerHTML = '<p style="color: var(--text-muted);">Щоб залишити коментар, <a href="login.html" style="color: var(--red-bright); text-decoration:underline;">увійдіть</a> або зареєструйтесь.</p>';
            }
        } catch (error) {
            console.error("Помилка перевірки авторизації:", error);
        }
    }

    // ==========================================
    // ЗАВАНТАЖЕННЯ СТАТТІ З TELEGRAPH
    // ==========================================
    try {
        const response = await fetch(`https://api.telegra.ph/getPage/${articleId}?return_content=true`);
        const data = await response.json();

        if (!data.ok) throw new Error(data.error);

        const page = data.result;
        
        let html = `
            <h1>${page.title}</h1>
            <div class="article-meta">
                <span>Автор: ${page.author_name || 'Невідомий'}</span>
                <a href="https://telegra.ph/${articleId}" target="_blank" class="tg-button">Відкрити в Telegraph</a>
            </div>
            <div class="article-body">
        `;

        function renderNode(node) {
            if (typeof node === 'string') return node;
            
            let nodeHtml = `<${node.tag}`;
            if (node.attrs) {
                for (let key in node.attrs) {
                    let value = node.attrs[key];
                    if (key === 'src' && value.startsWith('/')) {
                        value = 'https://telegra.ph' + value;
                    }
                    nodeHtml += ` ${key}="${value}"`;
                }
            }
            nodeHtml += '>';

            if (node.children) {
                for (let child of node.children) {
                    nodeHtml += renderNode(child);
                }
            }
            nodeHtml += `</${node.tag}>`;
            return nodeHtml;
        }

        for (let node of page.content) {
            html += renderNode(node);
        }

        html += `</div>`;
        container.innerHTML = html;
        document.title = `${page.title} - Horror Hub`;

        // ВИКЛИКАЄМО ФУНКЦІЇ КОМЕНТАРІВ ТІЛЬКИ ПІСЛЯ ТОГО, ЯК СТАТТЯ ЗАВАНТАЖИЛАСЬ
        loadComments();
        checkAuthAndShowForm();

    } catch (error) {
        console.error('Помилка завантаження статті:', error);
        container.innerHTML = `<h1>Щось пішло не так...</h1><p>Не вдалося зв'язатися з потойбіччям (Telegraph). Можливо, стаття була видалена.</p>`;
    }
}); // <-- Ось ця дужка закриває весь код! Вона дуже важлива.