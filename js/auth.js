document.addEventListener('DOMContentLoaded', async () => {
    const userMenu = document.getElementById('user-menu');
    if(!userMenu) return;

    try {
        const res = await fetch('api_auth.php?action=status');
        const data = await res.json();

        if (data.logged_in) {
            let adminLink = data.user.role === 'admin' ? `<a href="admin/admin.php" style="color:var(--red-bright)">Адмінка</a>` : '';
            userMenu.innerHTML = `
                <a href="profile.html" style="color:var(--text); font-family:var(--font-body); font-size:0.8rem; margin-right:10px; text-decoration: none; display: inline-flex; align-items: center;">
                <img src="${data.user.avatar}" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:5px; border: 1px solid var(--red-main); object-fit: cover;">
                <span style="transition: color 0.3s;" onmouseover="this.style.color='var(--red-bright)'" onmouseout="this.style.color='var(--text)'">${data.user.username}</span>
                </a>
                ${adminLink}
                <a href="#" id="logout-btn" style="color:var(--text-muted)">Вийти</a>
            `;
            
            document.getElementById('logout-btn').addEventListener('click', async (e) => {
                e.preventDefault();
                await fetch('api_auth.php', { method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: 'action=logout' });
                location.reload();
            });
        } else {
            userMenu.innerHTML = `<a href="login.html" style="color:var(--red-main)">Увійти / Реєстрація</a>`;
        }
    } catch(e) { console.error('Auth error', e); }
});