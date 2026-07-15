<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\Exception as PHPMailerException;
use PHPMailer\PHPMailer\PHPMailer;

function redirect_with_status(string $status): never
{
    $defaultPath = '/kontakt';
    $referer = (string)($_SERVER['HTTP_REFERER'] ?? '');
    $path = $defaultPath;

    if ($referer !== '') {
        $parts = parse_url($referer);
        $candidate = $parts['path'] ?? '';
        if (is_string($candidate) && in_array($candidate, ['/kontakt', '/partner'], true)) {
            $path = $candidate;
        }
    }

    $separator = str_contains($path, '?') ? '&' : '?';
    $anchor = $path === '/partner' ? 'partner-form' : 'kontakt-form';
    header('Location: ' . $path . $separator . 'form_status=' . rawurlencode($status) . '#' . $anchor, true, 303);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    redirect_with_status('invalid_method');
}

$name = trim((string)($_POST['name'] ?? ''));
$company = trim((string)($_POST['company'] ?? ''));
$email = trim((string)($_POST['email'] ?? ''));
$phone = trim((string)($_POST['phone'] ?? ''));
$message = trim((string)($_POST['message'] ?? ''));
$honeypot = trim((string)($_POST['website'] ?? ''));
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');

// Honeypot should stay empty. Fake success so bots get no signal.
if ($honeypot !== '') {
    redirect_with_status('success');
}

if (preg_match_all('/https?:\/\//i', $message) > 2) {
    redirect_with_status('too_many_links');
}

$autoloadPath = __DIR__ . '/vendor/autoload.php';
if (!is_file($autoloadPath)) {
    redirect_with_status('mailer_missing');
}
require_once $autoloadPath;

$config = [];
$configPath = __DIR__ . '/.smtp-config.php';
if (is_file($configPath)) {
    $loaded = require $configPath;
    if (is_array($loaded)) {
        $config = $loaded;
    }
}

$smtpHost = (string)($config['smtp_host'] ?? '');
$smtpPort = max(1, (int)($config['smtp_port'] ?? 587));
$smtpSecure = strtolower(trim((string)($config['smtp_secure'] ?? 'tls')));
$smtpAuth = (bool)($config['smtp_auth'] ?? true);
$smtpUser = (string)($config['smtp_user'] ?? '');
$smtpPass = (string)($config['smtp_pass'] ?? '');
$mailTo = (string)($config['mail_to'] ?? 'info@sn-trockenbau.de');
$fromEmail = (string)($config['from_email'] ?? '');
$fromName = (string)($config['from_name'] ?? 'SN Trockenbau Website');

if ($smtpHost === '' || !filter_var($mailTo, FILTER_VALIDATE_EMAIL) || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
    redirect_with_status('mail_config_invalid');
}

$subject = 'Neue Kontaktanfrage von der Website';
$body = "Neue Anfrage über das Website-Formular\n\n"
    . "Name: {$name}\n"
    . "Unternehmen: {$company}\n"
    . "E-Mail: {$email}\n"
    . "Telefon: {$phone}\n"
    . "IP: {$ip}\n"
    . "Zeit: " . date('c') . "\n\n"
    . "Nachricht:\n{$message}\n";

try {
    $mailer = new PHPMailer(true);
    $mailer->CharSet = 'UTF-8';
    $mailer->isSMTP();
    $mailer->Host = $smtpHost;
    $mailer->Port = $smtpPort;
    $mailer->SMTPAuth = $smtpAuth;

    if ($mailer->SMTPAuth) {
        $mailer->Username = $smtpUser;
        $mailer->Password = $smtpPass;
    }

    $mailer->SMTPSecure = $smtpSecure === 'ssl'
        ? PHPMailer::ENCRYPTION_SMTPS
        : PHPMailer::ENCRYPTION_STARTTLS;

    $mailer->setFrom($fromEmail, $fromName);
    $mailer->addAddress($mailTo);

    if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $replyName = $name !== '' ? str_replace(["\r", "\n"], ' ', $name) : 'Website Kontakt';
        $mailer->addReplyTo($email, $replyName);
    }

    $mailer->Subject = $subject;
    $mailer->Body = $body;
    $mailer->send();
} catch (PHPMailerException) {
    redirect_with_status('mail_failed');
}

redirect_with_status('success');
