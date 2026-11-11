<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

$dataPath = PHILADELPHIA_API_STORAGE . '/analytics.json';
$lockPath = PHILADELPHIA_API_STORAGE . '/analytics.lock';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$retentionDays = 180;
$timeZone = new DateTimeZone('Europe/Brussels');
$trackedPages = ['index.html', 'about.html', 'leaders.html', 'gallery.html', 'holiday-gallery.html'];

if ($method === 'POST') {
    apiRequireSameOrigin();
    $input = apiReadJsonBody();
    $requestedPath = $input['page'] ?? '';
    if (!is_string($requestedPath)) {
        apiRespond(422, ['error' => 'Некорректная страница для подсчёта.']);
    }

    $parsedPath = parse_url($requestedPath, PHP_URL_PATH);
    if (!is_string($parsedPath)) {
        apiRespond(422, ['error' => 'Некорректная страница для подсчёта.']);
    }
    $pagePath = trim($parsedPath, '/');
    $page = $pagePath === '' ? 'index.html' : $pagePath;
    if (!in_array($page, $trackedPages, true)) {
        apiRespond(422, ['error' => 'Эта страница не учитывается в статистике.']);
    }

    $lock = fopen($lockPath, 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        error_log('Philadelphia analytics could not lock its statistics file.');
        apiRespond(500, ['error' => 'Не удалось обновить статистику посещений.']);
    }

    $statistics = apiReadJsonFile($dataPath, []);
    $now = new DateTimeImmutable('now', $timeZone);
    $today = $now->format('Y-m-d');
    $minimumDate = $now->modify('-' . $retentionDays . ' days')->format('Y-m-d');
    foreach (array_keys($statistics) as $date) {
        if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            flock($lock, LOCK_UN);
            fclose($lock);
            error_log('Philadelphia analytics found an invalid date in its statistics file.');
            apiRespond(500, ['error' => 'Формат статистики посещений повреждён.']);
        }
        if ($date < $minimumDate) unset($statistics[$date]);
    }

    $day = $statistics[$today] ?? ['views' => 0, 'pages' => []];
    if (!is_array($day) || !is_int($day['views'] ?? null) || !is_array($day['pages'] ?? null)) {
        flock($lock, LOCK_UN);
        fclose($lock);
        error_log('Philadelphia analytics found invalid daily statistics.');
        apiRespond(500, ['error' => 'Формат статистики посещений повреждён.']);
    }
    $day['views']++;
    $day['pages'][$page] = ($day['pages'][$page] ?? 0) + 1;
    $statistics[$today] = $day;
    apiWriteJsonFile($dataPath, $statistics);
    flock($lock, LOCK_UN);
    fclose($lock);
    apiRespond(200, ['recorded' => true]);
}

if ($method === 'GET') {
    apiStartSession();
    if (empty($_SESSION['authenticated'])) {
        apiRespond(401, ['error' => 'Войдите в админку, чтобы просмотреть статистику.']);
    }

    $statistics = apiReadJsonFile($dataPath, []);
    $days = [];
    $now = new DateTimeImmutable('now', $timeZone);
    for ($offset = 0; $offset < 30; $offset++) {
        $date = $now->modify('-' . $offset . ' days')->format('Y-m-d');
        $day = $statistics[$date] ?? ['views' => 0, 'pages' => []];
        if (!is_array($day) || !is_int($day['views'] ?? null) || !is_array($day['pages'] ?? null)) {
            error_log('Philadelphia analytics found invalid daily statistics.');
            apiRespond(500, ['error' => 'Формат статистики посещений повреждён.']);
        }
        $pages = [];
        foreach ($day['pages'] as $page => $views) {
            if (!is_string($page) || !in_array($page, $trackedPages, true) || !is_int($views) || $views < 0) {
                error_log('Philadelphia analytics found invalid page statistics.');
                apiRespond(500, ['error' => 'Данные статистики посещений повреждены.']);
            }
            $pages[$page] = $views;
        }
        $days[] = ['date' => $date, 'views' => $day['views'], 'pages' => $pages];
    }
    apiRespond(200, ['days' => $days]);
}

header('Allow: GET, POST');
apiRespond(405, ['error' => 'Метод не поддерживается.']);
