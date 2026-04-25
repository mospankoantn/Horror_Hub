document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('article-content');
  if (!container) return;

  const articleId = getArticleId();
  if (!articleId) {
    renderArticleError('Помилка 404', 'Статтю не знайдено або її поглинула темрява.');
    return;
  }

  const commentsList = document.getElementById('comments-list');
  const commentFormContainer = document.getElementById('comment-form-container');

  try {
    const response = await fetch(`https://api.telegra.ph/getPage/${articleId}?return_content=true`, {
      headers: { Accept: 'application/json' }
    });
    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || 'Telegraph API error');
    }

    renderArticle(data.result);
    loadComments();
    checkAuthAndShowForm();
  } catch (error) {
    console.error('Помилка завантаження статті:', error);
    renderArticleError(
      'Щось пішло не так...',
      "Не вдалося зв'язатися з Telegraph. Можливо, стаття була видалена."
    );
  }

  function getArticleId() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('id') || '').trim().replace(/^\/+/, '');
  }

  function renderArticle(page) {
    const title = document.createElement('h1');
    title.textContent = page.title || 'Без назви';

    const meta = document.createElement('div');
    meta.className = 'article-meta';

    const author = document.createElement('span');
    author.textContent = `Автор: ${page.author_name || 'Невідомий'}`;

    const sourceLink = document.createElement('a');
    sourceLink.href = `https://telegra.ph/${articleId}`;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    sourceLink.className = 'tg-button';
    sourceLink.textContent = 'Відкрити в Telegraph';

    meta.append(author, sourceLink);

    const body = document.createElement('div');
    body.className = 'article-body';

    (page.content || []).forEach((node) => {
      body.appendChild(renderTelegraphNode(node));
    });

    container.replaceChildren(title, meta, body);
    document.title = `${title.textContent} - Horror Hub`;
  }

  function renderTelegraphNode(node) {
    if (typeof node === 'string') {
      return document.createTextNode(node);
    }

    if (!node || typeof node !== 'object') {
      return document.createTextNode('');
    }

    const tag = String(node.tag || '').toLowerCase();
    const allowedTags = new Set([
      'a', 'aside', 'b', 'blockquote', 'br', 'code', 'em', 'figcaption',
      'figure', 'h3', 'h4', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre',
      's', 'strong', 'u', 'ul'
    ]);

    if (!allowedTags.has(tag)) {
      return renderChildrenAsFragment(node.children);
    }

    const element = document.createElement(tag);

    if (tag === 'a' && node.attrs?.href) {
      setSafeLink(element, node.attrs.href);
    }

    if (tag === 'img') {
      const hasSafeImage = setSafeImage(element, node.attrs?.src, node.attrs?.alt);
      if (!hasSafeImage) return document.createDocumentFragment();
    }

    if (!['br', 'hr', 'img'].includes(tag)) {
      (node.children || []).forEach((child) => {
        element.appendChild(renderTelegraphNode(child));
      });
    }

    return element;
  }

  function renderChildrenAsFragment(children = []) {
    const fragment = document.createDocumentFragment();
    children.forEach((child) => fragment.appendChild(renderTelegraphNode(child)));
    return fragment;
  }

  function setSafeLink(link, rawHref) {
    try {
      const url = new URL(rawHref, 'https://telegra.ph');
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return;

      link.href = url.href;
      if (url.protocol !== 'mailto:') {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    } catch (error) {
      link.removeAttribute('href');
    }
  }

  function setSafeImage(image, rawSrc, alt = '') {
    if (!rawSrc) return false;

    try {
      const url = new URL(rawSrc, 'https://telegra.ph');
      if (!['http:', 'https:'].includes(url.protocol)) return false;

      image.src = url.href;
      image.alt = alt || '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => {
        image.src = 'images/placeholder.jpg';
      }, { once: true });
      return true;
    } catch (error) {
      return false;
    }
  }

  function renderArticleError(titleText, messageText) {
    const title = document.createElement('h1');
    title.textContent = titleText;

    const message = document.createElement('p');
    message.textContent = messageText;

    container.replaceChildren(title, message);
  }

  async function loadComments() {
    if (!commentsList) return;

    try {
      const response = await fetch(`api_comments.php?action=get&article_id=${encodeURIComponent(articleId)}`, {
        headers: { Accept: 'application/json' }
      });
      const comments = await response.json();

      if (!response.ok || !Array.isArray(comments)) {
        throw new Error('Невірна відповідь сервера коментарів');
      }

      if (comments.length === 0) {
        commentsList.replaceChildren(createMutedText('Поки немає коментарів. Будьте першим, хто порушить тишу...'));
        return;
      }

      const fragment = document.createDocumentFragment();
      comments.forEach((comment) => fragment.appendChild(createComment(comment)));
      commentsList.replaceChildren(fragment);
    } catch (error) {
      console.error('Помилка завантаження коментарів:', error);
      const message = createMutedText('Помилка завантаження коментарів.');
      message.classList.add('error-text');
      commentsList.replaceChildren(message);
    }
  }

  async function checkAuthAndShowForm() {
    if (!commentFormContainer) return;

    try {
      const response = await fetch('api_auth.php?action=status', {
        headers: { Accept: 'application/json' }
      });
      const auth = await response.json();

      if (auth.logged_in) {
        commentFormContainer.replaceChildren(createCommentForm());
      } else {
        commentFormContainer.replaceChildren(createLoginPrompt());
      }
    } catch (error) {
      console.error('Помилка перевірки авторизації:', error);
      commentFormContainer.replaceChildren(createLoginPrompt());
    }
  }

  function createComment(comment) {
    const item = document.createElement('article');
    item.className = 'comment-item';

    const header = document.createElement('div');
    header.className = 'comment-header';

    const avatar = document.createElement('img');
    avatar.className = 'comment-avatar';
    avatar.src = getSafeLocalOrRemoteUrl(comment.avatar, 'images/default_avatar.png');
    avatar.alt = '';
    avatar.loading = 'lazy';
    avatar.addEventListener('error', () => {
      avatar.src = 'images/default_avatar.png';
    }, { once: true });

    const username = document.createElement('strong');
    username.textContent = comment.username || 'Гість';

    if (comment.role === 'admin') {
      const badge = document.createElement('span');
      badge.className = 'admin-badge';
      badge.textContent = 'Адмін';
      username.appendChild(badge);
    }

    const date = document.createElement('time');
    date.textContent = comment.created_at || '';

    header.append(avatar, username, date);

    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = decodeEntities(comment.comment_text || '');

    item.append(header, body);
    return item;
  }

  function createCommentForm() {
    const form = document.createElement('form');
    form.className = 'comment-form';

    const textarea = document.createElement('textarea');
    textarea.id = 'commentText';
    textarea.rows = 3;
    textarea.placeholder = 'Напишіть свій моторошний коментар...';
    textarea.required = true;
    textarea.maxLength = 2000;

    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Відправити';

    const note = document.createElement('p');
    note.className = 'form-note';

    form.append(textarea, button, note);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (!text) return;

      button.disabled = true;
      button.textContent = 'Надсилання...';
      note.textContent = '';

      try {
        const formData = new FormData();
        formData.append('action', 'post');
        formData.append('article_id', articleId);
        formData.append('comment_text', text);

        const response = await fetch('api_comments.php', { method: 'POST', body: formData });
        const result = await response.json();

        if (!response.ok || result.status !== 'success') {
          throw new Error(result.message || 'Не вдалося додати коментар');
        }

        textarea.value = '';
        await loadComments();
      } catch (error) {
        note.textContent = error.message;
      } finally {
        button.disabled = false;
        button.textContent = 'Відправити';
      }
    });

    return form;
  }

  function createLoginPrompt() {
    const prompt = createMutedText('Щоб залишити коментар, ');
    const link = document.createElement('a');
    link.href = 'login.html';
    link.className = 'inline-link';
    link.textContent = 'увійдіть або зареєструйтесь';
    prompt.append(link, document.createTextNode('.'));
    return prompt;
  }

  function createMutedText(text) {
    const paragraph = document.createElement('p');
    paragraph.className = 'muted-text';
    paragraph.textContent = text;
    return paragraph;
  }

  function decodeEntities(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value);
    return textarea.value;
  }

  function getSafeLocalOrRemoteUrl(rawUrl, fallback) {
    try {
      const url = new URL(rawUrl || fallback, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch (error) {
      return fallback;
    }
  }
});
