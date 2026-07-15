<?php
declare(strict_types=1);

// Secure form handler with basic anti-spam protections.
const RATE_LIMIT_WINDOW_SECONDS = 900; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 5;
const MIN_SUBMIT_SECONDS = 3;
const MAX_SUBMIT_SECONDS = 7200; // 2 hours

function base_url_host(): string
{
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return preg_replace('/[^a-zA-Z0-9.:-]/', '', $host) ?: 'localhost';
}

function client_ip(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return preg_replace('/[^0-9a-fA-F:.,]/', '', $ip) ?: 'unknown';
}

function back_path(): string
{
    $default = '/kontakt';
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    if ($referer === '') {
        return $default;
    }

    $parts = parse_url($referer);
    $path = $parts['path'] ?? $default;
    if (!is_string($path) || $path === '' || $path[0] !== '/') {
        return $default;
    }

    // Only allow local known form pages for redirects.
    $allowed = ['/kontakt', '/partner'];
    return in_array($path, $allowed, true) ? $path : $default;
}

function redirect_with_status(string $status): never
{
    $path = back_path();
    $separator = str_contains($path, '?') ? '&' : '?';
    header('Location: ' . $path . $separator . 'form_status=' . rawurlencode($status) . '#kontakt-form', true, 303);
    exit;
}

function rate_limit_allow(string $ip): bool
{
    $dir = sys_get_temp_dir() . '/sn_trockenbau_rate_limit';
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        // Fail open if storage is unavailable.
        return true;
    }

    $file = $dir . '/' . hash('sha256', $ip) . '.json';
    $now = time();
    $windowStart = $now - RATE_LIMIT_WINDOW_SECONDS;
    $timestamps = [];

    $fh = @fopen($file, 'c+');
    if ($fh === false) {
        return true;
    }

    if (!flock($fh, LOCK_EX)) {
        fclose($fh);
        return true;
    }

    $raw = stream_get_contents($fh);
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            foreach ($decoded as $ts) {
                if (is_int($ts) && $ts >= $windowStart) {
                    $timestamps[] = $ts;
                }
            }
        }
    }

    $allowed = count($timestamps) < RATE_LIMIT_MAX_REQUESTS;
    if ($allowed) {
        $timestamps[] = $now;
    }

    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($timestamps, JSON_THROW_ON_ERROR));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);

    return $allowed;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    redirect_with_status('invalid_method');
}

$ip = client_ip();
if (!rate_limit_allow($ip)) {
    redirect_with_status('rate_limited');
}

$name = trim((string)($_POST['name'] ?? ''));
$company = trim((string)($_POST['company'] ?? ''));
$email = trim((string)($_POST['email'] ?? ''));
$phone = trim((string)($_POST['phone'] ?? ''));
$message = trim((string)($_POST['message'] ?? ''));
$honeypot = trim((string)($_POST['website'] ?? ''));
$formStarted = (int)($_POST['form_started'] ?? 0);

// Honeypot should stay empty. Return fake success to avoid bot feedback.
if ($honeypot !== '') {
    redirect_with_status('success');
}

$now = time();
if ($formStarted <= 0 || ($now - $formStarted) < MIN_SUBMIT_SECONDS || ($now - $formStarted) > MAX_SUBMIT_SECONDS) {
    redirect_with_status('spam_time_check');
}

if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
    redirect_with_status('invalid_name');
}

if ($company !== '' && mb_strlen($company) > 180) {
    redirect_with_status('invalid_company');
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 254) {
    redirect_with_status('invalid_email');
}

if (!preg_match('/^[0-9+()\-\/.\s]{6,40}$/', $phone)) {
    redirect_with_status('invalid_phone');
}

if (mb_strlen($message) < 10 || mb_strlen($message) > 5000) {
    redirect_with_status('invalid_message');
}

// Basic content checks to reduce low-effort spam.
if (preg_match_all('/https?:\/\//i', $message) > 2) {
    redirect_with_status('too_many_links');
}

$blockedWords = ['viagra', 'casino', 'bitcoin', 'crypto', 'loan', 'seo service'];
$lowerMessage = mb_strtolower($message);
foreach ($blockedWords as $word) {
    if (str_contains($lowerMessage, $word)) {
        redirect_with_status('spam_content');
    }
}

$to = getenv('CONTACT_FORM_TO') ?: 'info@sn-trockenbau.de';
$subject = 'Neue Kontaktanfrage von der Website';

$cleanName = str_replace(["\r", "\n"], ' ', $name);
$cleanEmail = str_replace(["\r", "\n"], '', $email);
$host = base_url_host();

$body = "Neue Anfrage über das Website-Formular\n\n"
    . "Name: {$name}\n"
    . "Unternehmen: {$company}\n"
    . "E-Mail: {$email}\n"
    . "Telefon: {$phone}\n"
    . "IP: {$ip}\n"
    . "Zeit: " . date('c') . "\n\n"
    . "Nachricht:\n{$message}\n";

$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'From: SN Trockenbau Website <no-reply@' . $host . '>',
    'Reply-To: ' . $cleanName . ' <' . $cleanEmail . '>',
    'X-Mailer: PHP/' . phpversion(),
];

$ok = @mail($to, $subject, $body, implode("\r\n", $headers));
if (!$ok) {
    redirect_with_status('mail_failed');
}

redirect_with_status('success');
