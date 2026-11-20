<?php
declare(strict_types=1);

function hh_security_headers(bool $admin = false): void {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    $scripts = $admin ? "'self' 'unsafe-inline'" : "'self'";
    header("Content-Security-Policy: default-src 'self'; script-src $scripts; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: http: data:; connect-src 'self' https://api.telegra.ph; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}
