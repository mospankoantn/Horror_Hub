const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { request } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const php = process.env.HORROR_HUB_PHP || 'C:/xampp/php/php.exe';
const baseURL = 'http://127.0.0.1:9876';
const id = Date.now();
const email = 'codex-test-' + id + '@example.test';
const password = 'Test-password-123';
const fixture = mode => execFileSync(php, ['tests/db_fixture.php', mode, email], { encoding: 'utf8' });

(async () => {
  const client = await request.newContext({ baseURL });
  try {
    let auth = await (await client.get('/api_auth.php?action=status')).json();
    const post = (url, form) => client.post(url, { headers: { 'X-CSRF-Token': auth.csrf_token }, form });
    let response = await post('/api_auth.php', { action: 'register', username: 'codex-' + id, email, password });
    assert.equal(response.status(), 200, await response.text());
    assert.equal((await post('/api_auth.php', { action: 'register', username: 'codex-' + id, email, password })).status(), 409);
    const initialCookie = (await client.storageState()).cookies[0].value;
    assert.equal((await post('/api_auth.php', { action: 'login', email, password })).status(), 200);
    auth = await (await client.get('/api_auth.php?action=status')).json();
    assert.equal(auth.logged_in, true);
    assert.notEqual((await client.storageState()).cookies[0].value, initialCookie, 'Session ID must rotate at login');
    assert.equal((await post('/api_auth.php', { action: 'update_profile', avatar: 'javascript:alert(1)' })).status(), 422);
    assert.equal((await post('/api_auth.php', { action: 'update_profile', avatar: 'images/../.env' })).status(), 422);
    assert.equal((await post('/api_auth.php', { action: 'update_profile', new_password: 'New-password-456', current_password: 'wrong' })).status(), 422);
    assert.equal((await post('/api_auth.php', { action: 'update_profile', avatar: 'images/default_avatar.png', new_password: 'New-password-456', current_password: password })).status(), 200);
    assert.equal(JSON.parse(fixture('verify')).hashed, true);
    const text = '<script>alert(1)</script> &amp; звичайний текст';
    assert.equal((await post('/api_comments.php', { action: 'post', article_id: 'fixture:' + id, comment_text: text })).status(), 200);
    const comments = await (await client.get('/api_comments.php?action=get&article_id=fixture:' + id)).json();
    assert.equal(comments[0].comment_text, text, 'Comments must preserve raw text');
    fixture('promote');
    auth = await (await client.get('/api_auth.php?action=status')).json();
    assert.equal(auth.user.role, 'admin');
    fixture('revoke');
    auth = await (await client.get('/api_auth.php?action=status')).json();
    assert.equal(auth.user.role, 'user', 'Revoked role must not persist in the session');
    fixture('ban');
    assert.equal((await post('/api_comments.php', { action: 'post', article_id: 'fixture:' + id, comment_text: 'blocked' })).status(), 401);
    auth = await (await client.get('/api_auth.php?action=status')).json();
    assert.equal(auth.logged_in, false, 'Ban must invalidate logged-in user');
    assert.equal((await post('/api_auth.php', { action: 'login', email, password: 'New-password-456' })).status(), 401);
    console.log('PASS: registration, duplicates, login/session rotation, profile, password verification, comments, role revocation and bans');
  } finally { await client.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
