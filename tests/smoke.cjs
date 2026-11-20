const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, request } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.SITE_URL || 'http://127.0.0.1:8765';
const output = path.resolve('test-results');
fs.mkdirSync(output, { recursive: true });

async function securityChecks() {
  const client = await request.newContext({ baseURL });
  const status = await client.get('/api_auth.php?action=status');
  assert.equal(status.status(), 200);
  const guest = await status.json();
  assert.equal(guest.logged_in, false);
  assert.match(guest.csrf_token, /^[a-f0-9]{64}$/);
  assert.match(status.headers()['set-cookie'], /HttpOnly/i);
  assert.match(status.headers()['set-cookie'], /SameSite=Lax/i);
  for (const resource of ['/.env', '/.git/config', '/db.php', '/admin/admin.php.txt', '/messages/contact_messages.jsonl', '/includes/bootstrap.php', '/storage/runtime/server.json', '/scripts/Start-Site.ps1']) {
    const response = await client.get(resource);
    assert.equal(response.status(), 403, resource);
  }
  assert.equal((await client.get('/api_auth.php?action=logout')).status(), 405);
  assert.equal((await client.post('/api_auth.php', { form: { action: 'logout' } })).status(), 403);
  assert.equal((await client.post('/save_contact.php', { form: { name: 'test' } })).status(), 403);
  assert.equal((await client.post('/admin/admin.php', { form: { delete_article: '1' } })).status(), 403);
  assert.equal((await client.get('/api_auth.php?action%5B%5D=status')).status(), 422);
  assert.equal((await client.get('/api_comments.php?action=get&article_id%5B%5D=a')).status(), 422);
  const headers = { 'X-CSRF-Token': guest.csrf_token };
  assert.equal((await client.post('/api_auth.php', { headers, form: { action: 'register', username: 'test', email: 'test@example.com', password: 'short' } })).status(), 422);
  assert.equal((await client.post('/save_contact.php', { headers, form: { name: 'test', email: 'invalid', message: 'test' } })).status(), 422);
  assert.equal((await client.post('/api_comments.php', { headers, form: { action: 'post', article_id: 'test', comment_text: 'test' } })).status(), 401);
  const crossSite = await client.post('/api_auth.php', { headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' }, form: { action: 'logout' } });
  assert.equal(crossSite.status(), 403);
  const admin = await client.get('/admin/admin.php');
  assert.equal(admin.status(), 200);
  assert.match(await admin.text(), /name="csrf_token"/);
  assert.equal((await client.post('/api_auth.php', { headers, form: { action: 'logout' } })).status(), 200);

  // Search-engine files and static article pages (scripts/build-site.php).
  const sitemap = await client.get('/sitemap.xml');
  assert.equal(sitemap.status(), 200);
  assert.match(sitemap.headers()['content-type'], /xml/);
  assert.match(await sitemap.text(), /<loc>https?:\/\/[^<]+\/statti\/[a-z0-9-]+\.html<\/loc>/);
  const robots = await client.get('/robots.txt');
  assert.equal(robots.status(), 200);
  assert.match(await robots.text(), /Disallow: \/admin\/[\s\S]*Sitemap: https?:\/\/\S+\/sitemap\.xml/);
  const missing = await client.get('/statti/no-such-article.html');
  assert.equal(missing.status(), 404);
  assert.match(await missing.text(), /<base href="\/">/);
  const manifest = await (await client.get('/data/pages.json')).json();
  const staticPaths = Object.values(manifest.pages).map(page => page.path);
  assert.ok(staticPaths.length > 100, 'Static pages must be generated');
  for (const staticPath of staticPaths.slice(0, 20)) {
    const response = await client.get('/' + staticPath);
    assert.equal(response.status(), 200, staticPath);
    const html = await response.text();
    assert.match(html, /<meta name="description" content="[^"]{20,}">/, staticPath);
    assert.equal((html.match(/<h1>/g) || []).length, 1, staticPath);
    assert.match(html, /<div class="article-body">\s*<(p|figure|h3|ul|blockquote)/, staticPath);
  }
  const favicon = await client.get('/favicon.ico');
  assert.equal(favicon.status(), 200);
  assert.ok((await favicon.body()).length < 20000, 'favicon.ico must stay small');
  await client.dispose();
  console.log('PASS: HTTP methods, CSRF, malformed input, cookies, private files, sitemap, robots, 404 and static pages');
}

async function browserChecks() {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const pages = ['index.html', 'articles.html', 'horror_games.html', 'horror_movies.html', 'reviews.html', 'internet_horror.html', 'horror_art.html', 'horror_literature.html', 'game.html', 'contact.html', 'login.html', 'privacy.html', 'culture.html', 'statti/scp.html', 'statti/hereditary-review.html'];
    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const resource of pages) {
        const response = await page.goto('/' + resource, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200, resource);
        // On phones the user menu sits inside the collapsed main menu, so wait for it in the DOM, not on screen.
        await page.locator('#user-menu a, #user-menu button').first().waitFor({ state: 'attached' });
        if (await page.locator('#articlesGrid').count()) {
          await page.waitForFunction(() => document.querySelector('#articlesGrid')?.getAttribute('aria-busy') === 'false');
          assert.ok(await page.locator('#articlesGrid article').count(), resource);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false, resource + ' at ' + width);
        if (['game.html', 'articles.html', 'contact.html'].includes(resource) && width !== 320) {
          await page.screenshot({ path: path.join(output, resource.replace('.html', '') + '-' + width + '.png'), fullPage: true });
        }
      }
    }
    await page.goto('/articles.html');
    await page.waitForFunction(() => document.querySelector('#articlesGrid')?.getAttribute('aria-busy') === 'false');
    await page.locator('#searchInput').fill('zzzzzz-no-results');
    await page.locator('#articlesGrid .empty-state').waitFor();
    assert.ok(await page.locator('#nextPage').isDisabled());
    await page.locator('#searchInput').fill('');
    await page.locator('#articlesGrid article').first().waitFor();
    // Catalog cards open static pages with local covers; the old article.html link redirects there.
    const cardHref = await page.locator('#articlesGrid .entry__title a').first().getAttribute('href');
    assert.match(cardHref, /^statti\/[a-z0-9-]+\.html$/);
    assert.ok(await page.$$eval('#articlesGrid img', images => images.every(image => new URL(image.src).origin === location.origin)), 'Covers must be local');
    await page.goto('/article.html?id=internet_horror:scp');
    await page.waitForURL(/\/statti\/scp\.html$/);
    await page.locator('.scp-sim').waitFor();
    assert.ok(await page.locator('#article-content .article-body p').count());

    // Mobile menu: collapsed behind one button, opens and closes with Escape.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/articles.html');
    const toggle = page.locator('.site-header .nav-toggle');
    await toggle.waitFor();
    assert.equal(await page.locator('.site-nav a[href="horror_games.html"]').isVisible(), false);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(await page.locator('.site-nav a[href="horror_games.html"]').isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await page.waitForFunction(() => document.querySelector('#articlesGrid')?.getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#facets').isVisible(), false, 'Filters stay folded on phones');
    await page.locator('.filters-toggle').click();
    assert.ok(await page.locator('#facets .chip').first().isVisible(), 'Filters open from the button');
    await page.locator('#facets .chip').first().click();
    assert.equal(await page.locator('#facets .chip').first().getAttribute('aria-pressed'), 'true');
    await page.screenshot({ path: path.join(output, 'mobile-menu-390.png') });

    // Theme switch persists across pages; each section sets its own accent.
    const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.locator('.theme-toggle').click();
    const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
    assert.notEqual(themeAfter, themeBefore);
    await page.goto('/horror_movies.html');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), themeAfter, 'Theme must persist');
    const accents = [];
    for (const resource of ['horror_movies.html', 'horror_games.html', 'internet_horror.html', 'culture.html']) {
      await page.goto('/' + resource);
      accents.push(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--sa').trim()));
    }
    assert.equal(new Set(accents).size, 4, 'Sections must have their own accents');
    await page.locator('.theme-toggle').click();
    await page.setViewportSize({ width: 1366, height: 900 });
    const unsafeArticle = {
      title: '<img onerror="alert(1)">', localId: 'internet_horror:fixture-xss',
      genre: {}, developer: [], previewText: 7, imageUrl: 'javascript:alert(1)',
      contentHtml: '<p>Безпечний текст <strong>статті</strong></p><script>window.__injected=1</script><style>body{display:none}</style><a href="javascript:alert(1)">Джерело</a><img src="javascript:alert(1)" onerror="alert(1)"><form action="save_contact.php"><input name="name"></form>'
    };
    await page.route('**/articles_data.json*', route => route.fulfill({ json: [null, { title: 3, url: [] }, unsafeArticle] }));
    await page.route('**/api_comments.php?*', route => route.fulfill({ json: [{
      username: '<img onerror="alert(1)">', comment_text: '<script>alert(1)</script> &amp;', avatar: 'javascript:alert(1)', created_at: '2026-10-09'
    }] }));
    await page.goto('/articles.html');
    await page.waitForFunction(() => document.querySelector('#articlesGrid')?.getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#articlesGrid article').count(), 1);
    assert.equal(await page.locator('#articlesGrid h2').textContent(), unsafeArticle.title);
    await page.goto('/article.html?id=internet_horror:fixture-xss');
    await page.locator('.article-body strong').waitFor();
    assert.equal(await page.locator('.article-body script, .article-body style, .article-body form, .article-body input, .article-body a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__injected), undefined);
    await page.locator('.comment-body').waitFor();
    assert.equal(await page.locator('.comment-body').textContent(), '<script>alert(1)</script> &amp;');
    await page.unroute('**/articles_data.json*');
    await page.unroute('**/api_comments.php?*');
    await page.route('**/save_contact.php', async route => {
      assert.match(await route.request().headerValue('X-CSRF-Token'), /^[a-f0-9]{64}$/);
      await route.fulfill({ json: { status: 'error', message: 'Не вдалося зберегти повідомлення.' } });
    });
    await page.goto('/contact.html');
    await page.locator('#name').fill('Тест');
    await page.locator('#email').fill('fixture@example.test');
    await page.locator('#message').fill('Повідомлення, яке не можна втратити.');
    await page.locator('#submitButton').click();
    await page.locator('#statusMessage.error').waitFor();
    assert.equal(await page.locator('#message').inputValue(), 'Повідомлення, яке не можна втратити.');
    await page.unroute('**/save_contact.php');

    // Game room: catalog from the manifest, routing, quest engine and the maze engine (GameRoom.debug).
    const manifest = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/game.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('.game-card').first().waitFor();
    assert.equal(await page.locator('.game-card').count(), manifest.games.length, 'Every game in the manifest gets a card');
    await page.locator('[data-play="quest-cinema"]').click();
    await page.waitForURL(/#play\/quest-cinema/);
    await page.locator('#player').waitFor({ state: 'visible' });
    const skip = page.locator('[data-quest-skip]');
    // Show the whole scene text, then wait for its buttons (choices or the ending actions).
    const skipText = async () => {
      await page.waitForFunction(() => !document.querySelector('[data-quest-skip]')?.disabled || document.querySelector('#game-choices button'));
      if (await skip.isEnabled()) await skip.click();
      await page.locator('#game-choices button').first().waitFor();
    };
    await page.locator('#game-story').waitFor();
    await skipText();
    assert.match(await page.locator('#game-story').innerText(), /Під дошками/);
    await page.keyboard.press('1');
    await skipText();
    assert.match(await page.locator('#game-story').innerText(), /У шафі лежать маски/, 'Keys 1–9 choose options');
    await page.locator('#player [data-player="restart"]').click();
    await skipText();
    async function choose(text) {
      await page.locator('#game-choices .quest__choice').filter({ hasText: text }).click();
      await skipText();
    }
    await choose('Посвітити на шафу');
    await choose('Взяти ключ');
    assert.match(await page.locator('#questInventory').innerText(), /ключ/i);
    await choose('Йти на звук');
    await choose('Взяти квиток');
    await choose('Підійти до службового виходу');
    await choose('Вставити квиток');
    assert.match(await page.locator('.quest-ending').innerText(), /ВИ ВИБРАЛИСЯ/);
    await page.locator('.quest__found').waitFor();
    assert.match(await page.locator('.quest__found').innerText(), /Знайдено 1 з 8/);
    await page.goBack();
    await page.locator('.game-card').first().waitFor();
    await page.locator('#player').waitFor({ state: 'hidden' }); // back returns to the catalog
    assert.match(await page.locator('[data-game="quest-cinema"] .game-card__stat').innerText(), /1 з 8/);

    const mazeCard = page.locator('[data-game="maze"]');
    await mazeCard.locator('[data-mode="nightmare"]').click();
    assert.match(await mazeCard.locator('[data-play]').getAttribute('href'), /mode=nightmare/);
    await mazeCard.locator('[data-mode="normal"]').click();
    await mazeCard.locator('[data-play]').click();
    await page.waitForURL(/#play\/maze\?mode=normal/);
    await page.locator('#mazeCanvas').waitFor();
    await page.evaluate(() => window.GameRoom.debug.maze.mute());
    const mazeReport = await page.evaluate(() => {
      const game = window.GameRoom.debug.maze;
      let boundaries = true;
      let route = Infinity;
      let distance = 0;
      let batteries = Infinity;
      for (let round = 0; round < 20; round++) {
        game.startMazeGame();
        const { state } = game;
        boundaries &&= state.maze[0].every(x => x === 1) && state.maze.at(-1).every(x => x === 1) && state.maze.every(row => row[0] === 1 && row.at(-1) === 1);
        route = Math.min(route, game.findPath({ col: 1, row: 1 }, { col: 13, row: 7 }).length);
        batteries = Math.min(batteries, state.batteries.length);
        for (let i = 0; i < 4000; i++) game.updateEnemy(16.67);
        distance = Math.max(distance, Math.hypot(state.player.x - state.enemy.x, state.player.y - state.enemy.y));
      }
      // Battery pickup and sprint drain.
      game.startMazeGame();
      const { state } = game;
      state.battery = 50;
      const target = state.batteries[0];
      state.player.x = target.x;
      state.player.y = target.y;
      const before = state.batteries.length;
      game.collectBatteries();
      const picked = { count: before - state.batteries.length, battery: state.battery };
      state.battery = 100;
      state.sprinting = false;
      game.updateBattery(1000);
      const walk = 100 - state.battery;
      state.battery = 100;
      state.sprinting = true;
      game.updateBattery(1000);
      const run = 100 - state.battery;
      return { boundaries, route, distance, batteries, picked, ratio: run / walk };
    });
    assert.equal(mazeReport.boundaries, true);
    assert.ok(mazeReport.route > 1);
    assert.ok(mazeReport.distance < 2, 'Enemy must reach the player without getting stuck');
    assert.ok(mazeReport.batteries >= 2, 'Batteries are placed on the map');
    assert.deepEqual(mazeReport.picked, { count: 1, battery: 85 });
    assert.equal(Math.round(mazeReport.ratio), 2, 'Sprint drains the torch twice as fast');

    await page.locator('#player [data-player="restart"]').click();
    await page.waitForTimeout(1500);
    const pixels = await page.locator('#mazeCanvas').evaluate(canvas => {
      const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < bytes.length; i += 4) if (bytes[i] + bytes[i + 1] + bytes[i + 2] > 40) colored++;
      return colored;
    });
    assert.ok(pixels > 1000, 'Canvas must not be blank');
    await page.locator('#player [data-player="pause"]').click();
    const beforePause = await page.locator('#mazeBattery').innerText();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#mazeBattery').innerText(), beforePause);
    await page.locator('.player__dialog .btn--primary').click();
    await page.waitForTimeout(6000);
    const battery = await page.evaluate(() => window.GameRoom.debug.maze.state.battery);
    assert.ok(battery > 90 && battery < 100, 'Battery must last longer than a few seconds');
    await page.screenshot({ path: path.join(output, 'maze-desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMove = await page.evaluate(() => {
      const { state } = window.GameRoom.debug.maze;
      return { x: state.player.x, y: state.player.y, button: state.maze[1][2] === 0 ? '#btn-right' : '#btn-down' };
    });
    await page.locator(mobileMove.button).scrollIntoViewIfNeeded();
    const box = await page.locator(mobileMove.button).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.up();
    const moved = await page.evaluate(() => ({ x: window.GameRoom.debug.maze.state.player.x, y: window.GameRoom.debug.maze.state.player.y }));
    assert.ok(Math.hypot(moved.x - mobileMove.x, moved.y - mobileMove.y) > 5, 'Mobile controls must move the player');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'maze-mobile.png'), fullPage: true });

    // A win shows the result screen and stores a personal record (guest: no leaderboard submission).
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.evaluate(() => {
      const { state } = window.GameRoom.debug.maze;
      state.player.x = state.exit.x;
      state.player.y = state.exit.y;
    });
    await page.locator('.player__dialog.is-good').waitFor();
    assert.match(await page.locator('.player__dialog').innerText(), /Ви вибралися[\s\S]*Час: \d\d:\d\d\.\d[\s\S]*Увійдіть/);
    await page.goBack();
    await page.locator('[data-game="maze"] .game-card__stat').waitFor();
    assert.match(await page.locator('[data-game="maze"] .game-card__stat').innerText(), /Ваш рекорд \(«Нормально»\): \d\d:\d\d\.\d/);

    assert.deepEqual(errors, []);
    console.log(`PASS: ${pages.length * 3} responsive page checks, mobile menu, search, static links and local covers, malformed catalogs, HTML/XSS sanitization, SCP, game catalog and routing, quest keys/endings, 20 maze paths, batteries, sprint, pause, mobile movement, win screen and canvas pixels`);
    await context.close();
  } finally { await browser.close(); }
}

(async () => {
  await securityChecks();
  await browserChecks();
})().catch(error => { console.error(error); process.exitCode = 1; });
