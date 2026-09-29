<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    apiRespond(405, ['error' => 'Метод не поддерживается.']);
}

$id = is_string($_GET['id'] ?? null) ? $_GET['id'] : '';
if (!preg_match('/^[A-Za-z0-9_-]{1,100}$/', $id)) {
    apiRespond(404, ['error' => 'Фотография не найдена.']);
}

$photos = apiReadJsonFile(PHILADELPHIA_API_STORAGE . '/gallery.json', []);
$found = false;
foreach ($photos as $photo) {
    if (is_array($photo) && ($photo['id'] ?? null) === $id) {
        $found = true;
        break;
    }
}
if (!$found) {
    apiRespond(404, ['error' => 'Фотография не найдена.']);
}

$imagePath = PHILADELPHIA_API_STORAGE . '/gallery-images/' . $id . '.jpg';
if (!is_file($imagePath) || !is_readable($imagePath)) {
    error_log('Philadelphia API could not read a gallery image.');
    apiRespond(404, ['error' => 'Фотография не найдена.']);
}

header('Content-Type: image/jpeg');
header('Content-Length: ' . (string) filesize($imagePath));
header('Cache-Control: public, max-age=300');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD' && readfile($imagePath) === false) {
    error_log('Philadelphia API failed while streaming a gallery image.');
}
