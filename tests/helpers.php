<?php
require_once dirname(__DIR__) . '/includes/bootstrap.php';
function check(bool $condition, string $name): void {
    if (!$condition) throw new RuntimeException('FAIL: ' . $name);
}
check(hh_length('Привіт') === 6, 'Unicode length');
check(hh_length('') === 0, 'Empty length');
check(hh_safe_url('https://example.com/article?q=hello'), 'HTTPS');
check(hh_safe_url('mailto:hello@example.com', true), 'Mailto links');
foreach (['javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.com', 'https://example.com/ bad', 'file:///C:/Windows', 'https://example.com\\@evil.test'] as $url) {
    check(!hh_safe_url($url), 'Unsafe URL');
}
check(hh_local_path('images/default_avatar.png', 'images', ['png']), 'Existing avatar');
check(!hh_local_path('images/../.env', 'images', ['png']), 'Traversal');
check(!hh_local_path('images/%2e%2e/.env', 'images', ['png']), 'Encoded traversal');
check(!hh_local_path('images/missing.png', 'images', ['png']), 'Missing file');
check(!hh_local_path('images/default_avatar.png?x=1', 'images', ['png']), 'Query path');
check(hh_local_path('content/internet_horror/scp.html', 'content', ['html']), 'Existing article');
check(strlen(hh_csrf_token()) === 64 && hh_csrf_token() === hh_csrf_token(), 'Stable token');
hh_destroy_session();
echo "PASS: Unicode, URLs, local paths and CSRF helpers\n";
