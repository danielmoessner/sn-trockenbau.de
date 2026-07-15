<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\Exception as PHPMailerException;
use PHPMailer\PHPMailer\PHPMailer;

// Secure form handler with basic anti-spam protections.
const RATE_LIMIT_WINDOW_SECONDS = 900; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 5;

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

function bool_from_mixed(mixed $value, bool $default = false): bool
{
    if (is_bool($value)) {
        return $value;
    }
    if (is_int($value)) {
        return $value !== 0;
    }
    if (!is_string($value)) {
        return $default;
    }

    $normalized = strtolower(trim($value));
    if ($normalized === '') {
        return $default;
    }

    return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
}

function contact_mail_config(string $host, string $defaultTo): array
{
    $fileConfig = [];
    $configPath = __DIR__ . '/.smtp-config.php';
    if (is_file($configPath)) {
        $loaded = require $configPath;
        if (is_array($loaded)) {
            $fileConfig = $loaded;
        }
    }

    $smtpHost = (string)($fileConfig['smtp_host'] ?? getenv('CONTACT_FORM_SMTP_HOST') ?: '');
    $smtpPort = (int)($fileConfig['smtp_port'] ?? getenv('CONTACT_FORM_SMTP_PORT') ?: 587);
    $smtpSecure = strtolower(trim((string)($fileConfig['smtp_secure'] ?? getenv('CONTACT_FORM_SMTP_SECURE') ?: 'tls')));
    $smtpAuth = bool_from_mixed($fileConfig['smtp_auth'] ?? getenv('CONTACT_FORM_SMTP_AUTH') ?: '1', true);
    $smtpUser = (string)($fileConfig['smtp_user'] ?? getenv('CONTACT_FORM_SMTP_USER') ?: '');
    $smtpPass = (string)($fileConfig['smtp_pass'] ?? getenv('CONTACT_FORM_SMTP_PASS') ?: '');

    $mailTo = (string)($fileConfig['mail_to'] ?? getenv('CONTACT_FORM_TO') ?: $defaultTo);
    $fromEmail = (string)($fileConfig['from_email'] ?? getenv('CONTACT_FORM_FROM_EMAIL') ?: ('no-reply@' . $host));
    $fromName = (string)($fileConfig['from_name'] ?? getenv('CONTACT_FORM_FROM_NAME') ?: 'SN Trockenbau Website');

    return [
        'smtp_host' => $smtpHost,
        'smtp_port' => $smtpPort > 0 ? $smtpPort : 587,
        'smtp_secure' => in_array($smtpSecure, ['ssl', 'tls'], true) ? $smtpSecure : 'tls',
        'smtp_auth' => $smtpAuth,
        'smtp_user' => $smtpUser,
        'smtp_pass' => $smtpPass,
        'mail_to' => $mailTo,
        'from_email' => $fromEmail,
        'from_name' => $fromName,
    ];
}

function send_contact_mail(array $config, string $cleanName, string $cleanEmail, string $subject, string $body): bool
{
    if (!class_exists(PHPMailer::class)) {
        error_log('[contact-form] PHPMailer class not found.');
        return false;
    }

    if ($config['smtp_host'] === '' || $config['mail_to'] === '') {
        error_log('[contact-form] SMTP host or recipient is missing.');
        return false;
    }

    if (!filter_var((string)$config['from_email'], FILTER_VALIDATE_EMAIL)) {
        error_log('[contact-form] Invalid configured from_email.');
        return false;
    }

    if (!filter_var((string)$config['mail_to'], FILTER_VALIDATE_EMAIL)) {
        error_log('[contact-form] Invalid configured mail_to address.');
        return false;
    }

    $primarySecure = $config['smtp_secure'] === 'ssl' ? 'ssl' : 'tls';
    $primaryPort = (int)$config['smtp_port'];

    $attempts = [
        ['secure' => $primarySecure, 'port' => $primaryPort],
    ];

    // Fallback for hosters where only one SMTP transport is enabled.
    if ($primarySecure === 'tls') {
        $attempts[] = ['secure' => 'ssl', 'port' => 465];
    } else {
        $attempts[] = ['secure' => 'tls', 'port' => 587];
    }

    $seen = [];
    foreach ($attempts as $attempt) {
        $secure = $attempt['secure'];
        $port = (int)$attempt['port'];
        $key = $secure . ':' . $port;
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;

        try {
            $mailer = new PHPMailer(true);
            $mailer->CharSet = 'UTF-8';
            $mailer->isSMTP();
            $mailer->Host = $config['smtp_host'];
            $mailer->Port = $port;
            $mailer->SMTPAuth = (bool)$config['smtp_auth'];
            $mailer->SMTPAutoTLS = true;
            $mailer->Timeout = 20;

            if ($mailer->SMTPAuth) {
                $mailer->Username = $config['smtp_user'];
                $mailer->Password = $config['smtp_pass'];
            }

            $mailer->SMTPSecure = $secure === 'ssl'
                ? PHPMailer::ENCRYPTION_SMTPS
                : PHPMailer::ENCRYPTION_STARTTLS;

            $mailer->setFrom($config['from_email'], $config['from_name']);
            $mailer->addAddress($config['mail_to']);

            // Reply-To is optional because form input is intentionally not strictly validated.
            if (filter_var($cleanEmail, FILTER_VALIDATE_EMAIL)) {
                $replyName = trim($cleanName) !== '' ? $cleanName : 'Website Kontakt';
                $mailer->addReplyTo($cleanEmail, $replyName);
            }

            $mailer->Subject = $subject;
            $mailer->Body = $body;

            if ($mailer->send()) {
                return true;
            }

            error_log('[contact-form] Mail send returned false on ' . $key . ': ' . $mailer->ErrorInfo);
        } catch (PHPMailerException $e) {
            error_log('[contact-form] Mail send failed on ' . $key . ': ' . $e->getMessage());
        }
    }

    return false;
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

// Honeypot should stay empty. Return fake success to avoid bot feedback.
if ($honeypot !== '') {
    redirect_with_status('success');
}

// Basic content checks to reduce low-effort spam.
if (preg_match_all('/https?:\/\//i', $message) > 2) {
    redirect_with_status('too_many_links');
}

$subject = 'Neue Kontaktanfrage von der Website';

$cleanName = str_replace(["\r", "\n"], ' ', $name);
$cleanEmail = str_replace(["\r", "\n"], '', $email);
$host = base_url_host();

$autoloadPath = __DIR__ . '/vendor/autoload.php';
if (!is_file($autoloadPath)) {
    redirect_with_status('mailer_missing');
}
require_once $autoloadPath;

$config = contact_mail_config($host, 'info@sn-trockenbau.de');

$body = "Neue Anfrage über das Website-Formular\n\n"
    . "Name: {$name}\n"
    . "Unternehmen: {$company}\n"
    . "E-Mail: {$email}\n"
    . "Telefon: {$phone}\n"
    . "IP: {$ip}\n"
    . "Zeit: " . date('c') . "\n\n"
    . "Nachricht:\n{$message}\n";

$ok = send_contact_mail($config, $cleanName, $cleanEmail, $subject, $body);
if (!$ok) {
    redirect_with_status('mail_failed');
}

redirect_with_status('success');
