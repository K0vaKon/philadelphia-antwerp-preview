<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

$dataPath = PHILADELPHIA_API_STORAGE . '/events.json';
$lockPath = PHILADELPHIA_API_STORAGE . '/events.lock';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $events = apiReadJsonFile($dataPath, []);
    apiRespond(200, ['events' => $events]);
}

if (!in_array($method, ['POST', 'PUT', 'DELETE'], true)) {
    header('Allow: GET, POST, PUT, DELETE');
    apiRespond(405, ['error' => 'Метод не поддерживается.']);
}

apiRequireSameOrigin();
apiStartSession();
apiRequireAuthenticated();
$lock = fopen($lockPath, 'c');
if ($lock === false || !flock($lock, LOCK_EX)) {
    error_log('Philadelphia API could not lock the events data file.');
    apiRespond(500, ['error' => 'Не удалось заблокировать данные событий. Попробуйте ещё раз.']);
}

$events = apiReadJsonFile($dataPath, []);
if (array_values($events) !== $events) {
    flock($lock, LOCK_UN);
    fclose($lock);
    error_log('Philadelphia API found a non-list events data structure.');
    apiRespond(500, ['error' => 'Формат списка событий повреждён.']);
}

if ($method === 'POST') {
    $input = apiReadJsonBody();
    $event = apiValidateEvent($input);
    foreach ($events as $existingEvent) {
        if (($existingEvent['id'] ?? null) === $event['id']) {
            flock($lock, LOCK_UN);
            fclose($lock);
            apiRespond(409, ['error' => 'Событие с таким идентификатором уже существует.']);
        }
    }
    array_unshift($events, $event);
} elseif ($method === 'PUT') {
    $input = apiReadJsonBody();
    if (isset($_GET['id'])) {
        $id = is_string($_GET['id']) ? $_GET['id'] : '';
        $event = apiValidateEvent($input);
        if ($event['id'] !== $id) {
            flock($lock, LOCK_UN);
            fclose($lock);
            apiRespond(422, ['error' => 'Идентификатор события не совпадает.']);
        }
        $found = false;
        foreach ($events as $index => $existingEvent) {
            if (($existingEvent['id'] ?? null) === $id) {
                $events[$index] = $event;
                $found = true;
                break;
            }
        }
        if (!$found) {
            flock($lock, LOCK_UN);
            fclose($lock);
            apiRespond(404, ['error' => 'Событие не найдено.']);
        }
    } else {
        $replacement = $input['events'] ?? null;
        if (!is_array($replacement) || array_values($replacement) !== $replacement || count($replacement) > 500) {
            flock($lock, LOCK_UN);
            fclose($lock);
            apiRespond(422, ['error' => 'Некорректный список событий.']);
        }
        $events = [];
        $ids = [];
        foreach ($replacement as $item) {
            if (!is_array($item)) {
                flock($lock, LOCK_UN);
                fclose($lock);
                apiRespond(422, ['error' => 'Некорректная запись в списке событий.']);
            }
            $event = apiValidateEvent($item);
            if (isset($ids[$event['id']])) {
                flock($lock, LOCK_UN);
                fclose($lock);
                apiRespond(422, ['error' => 'В списке повторяется событие.']);
            }
            $ids[$event['id']] = true;
            $events[] = $event;
        }
    }
} else {
    $id = is_string($_GET['id'] ?? null) ? $_GET['id'] : '';
    if ($id === '') {
        flock($lock, LOCK_UN);
        fclose($lock);
        apiRespond(400, ['error' => 'Не указан идентификатор события.']);
    }
    $events = array_values(array_filter(
        $events,
        static fn (array $event): bool => ($event['id'] ?? null) !== $id
    ));
}

apiWriteJsonFile($dataPath, $events);
flock($lock, LOCK_UN);
fclose($lock);
apiRespond(200, ['events' => $events]);
