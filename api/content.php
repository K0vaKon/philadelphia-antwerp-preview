<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

$dataPath = PHILADELPHIA_API_STORAGE . '/content.json';
$lockPath = PHILADELPHIA_API_STORAGE . '/content.lock';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = is_string($_GET['action'] ?? null) ? $_GET['action'] : '';
$collection = is_string($_GET['collection'] ?? null) ? $_GET['collection'] : '';
$recordCollections = [
    'leaders' => ['title', 'tag', 'description'],
    'homeGroups' => ['leader', 'location', 'day', 'description'],
    'presbyters' => ['title', 'tag', 'description', 'husbandFirstName', 'husbandLastName', 'wifeFirstName', 'wifeLastName'],
];
$defaultPageVisibility = ['about' => true, 'leaders' => true, 'gallery' => true, 'holidayGallery' => false];
$defaultHolidayGalleryTitles = ['ru' => 'Галерея праздников', 'nl' => 'Feestgalerij', 'en' => 'Holiday gallery'];

$readContent = static function () use ($dataPath, $recordCollections, $defaultPageVisibility, $defaultHolidayGalleryTitles): array {
    $content = apiReadJsonFile($dataPath, []);
    foreach ($recordCollections as $name => $_) {
        if (!isset($content[$name])) $content[$name] = [];
        if (!is_array($content[$name]) || array_values($content[$name]) !== $content[$name]) {
            error_log('Philadelphia API found invalid ' . $name . ' content.');
            apiRespond(500, ['error' => 'Формат содержимого сайта повреждён.']);
        }
        if (count($content[$name]) > 500) {
            error_log('Philadelphia API found too many ' . $name . ' records.');
            apiRespond(500, ['error' => 'В серверном содержимом превышено допустимое количество записей.']);
        }
        foreach ($content[$name] as $record) {
            if (!is_array($record) || !is_string($record['id'] ?? null)
                || !preg_match('/^[A-Za-z0-9_-]{1,100}$/', $record['id'])) {
                error_log('Philadelphia API found invalid ' . $name . ' records.');
                apiRespond(500, ['error' => 'Запись серверного содержимого повреждена.']);
            }
        }
    }
    $visibility = $content['pageVisibility'] ?? apiReadJsonFile(dirname(__DIR__) . '/page-visibility.json', $defaultPageVisibility);
    if (!is_array($visibility)) {
        error_log('Philadelphia API found invalid page visibility settings.');
        apiRespond(500, ['error' => 'Настройки видимости страниц повреждены.']);
    }
    foreach ($defaultPageVisibility as $page => $default) {
        if (!is_bool($visibility[$page] ?? null)) {
            $visibility[$page] = $default;
        }
    }
    $titles = $visibility['holidayGalleryTitles'] ?? [];
    if (!is_array($titles)) $titles = [];
    foreach ($defaultHolidayGalleryTitles as $language => $default) {
        $title = $titles[$language] ?? $default;
        $visibility['holidayGalleryTitles'][$language] = is_string($title) && trim($title) !== '' && strlen($title) <= 480
            ? trim($title)
            : $default;
    }
    $content['pageVisibility'] = $visibility;
    return $content;
};

$validateRecord = static function (array $record) use ($collection, $recordCollections): array {
    $allowedText = array_merge(
        ['id', 'title', 'tag', 'description', 'leader', 'location', 'day', 'husbandFirstName', 'husbandLastName', 'wifeFirstName', 'wifeLastName'],
        ['image', 'spouseImage']
    );
    $normalized = [];
    foreach ($record as $key => $value) {
        if ($key === 'translations') {
            if (!is_array($value)) apiRespond(422, ['error' => 'Некорректные переводы записи.']);
            $translations = [];
            foreach (['nl', 'en'] as $language) {
                $fields = $value[$language] ?? [];
                if (!is_array($fields)) apiRespond(422, ['error' => 'Некорректный перевод записи.']);
                $translations[$language] = [];
                foreach ($recordCollections[$collection] as $field) {
                    $text = $fields[$field] ?? '';
                    if (!is_string($text) || strlen($text) > 12000) {
                        apiRespond(422, ['error' => 'Некорректное поле перевода: ' . $field]);
                    }
                    $translations[$language][$field] = trim($text);
                }
            }
            $normalized[$key] = $translations;
            continue;
        }
        if (!in_array($key, $allowedText, true) || !is_string($value)) {
            apiRespond(422, ['error' => 'Некорректное поле записи.']);
        }
        $maxBytes = in_array($key, ['image', 'spouseImage'], true) ? 5 * 1024 * 1024 : 12000;
        if (strlen($value) > $maxBytes) apiRespond(422, ['error' => 'Поле записи слишком большое.']);
        $value = trim($value);
        if (in_array($key, ['image', 'spouseImage'], true) && $value !== '') {
            $isDataImage = preg_match('/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/', $value) === 1;
            $isHttpsImage = filter_var($value, FILTER_VALIDATE_URL) !== false && str_starts_with($value, 'https://');
            if (!$isDataImage && !$isHttpsImage) apiRespond(422, ['error' => 'Фото должно быть изображением или HTTPS-ссылкой.']);
        }
        $normalized[$key] = $value;
    }

    $id = $normalized['id'] ?? null;
    if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,100}$/', $id)) {
        apiRespond(422, ['error' => 'Некорректный идентификатор записи.']);
    }
    if ($collection === 'leaders' && trim($normalized['title'] ?? '') === '') {
        apiRespond(422, ['error' => 'Укажите название служения.']);
    }
    if ($collection === 'homeGroups'
        && (trim($normalized['leader'] ?? '') === '' || trim($normalized['location'] ?? '') === ''
            || trim($normalized['description'] ?? '') === ''
            || !in_array($normalized['day'] ?? '', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], true))) {
        apiRespond(422, ['error' => 'Заполните данные домашней группы.']);
    }
    if ($collection === 'presbyters') {
        $familyFields = ['husbandFirstName', 'husbandLastName', 'wifeFirstName', 'wifeLastName'];
        $hasFamilyFields = array_filter($familyFields, static fn (string $field): bool => trim($normalized[$field] ?? '') !== '') !== [];
        if ($hasFamilyFields) {
            foreach (array_merge($familyFields, ['image', 'spouseImage']) as $field) {
                if (trim($normalized[$field] ?? '') === '') apiRespond(422, ['error' => 'Заполните имена и добавьте обе фотографии пресвитерской семьи.']);
            }
        } elseif (trim($normalized['title'] ?? '') === '' || trim($normalized['image'] ?? '') === '') {
            apiRespond(422, ['error' => 'Укажите имя и фотографию пресвитера.']);
        }
    }
    return $normalized;
};

if ($collection === '' && $method === 'GET') {
    $content = $readContent();
    apiRespond(200, $content);
}

if ($collection === 'pageVisibility') {
    if ($method === 'GET') {
        $content = $readContent();
        $storedVisibility = array_key_exists('pageVisibility', apiReadJsonFile($dataPath, []));
        apiRespond(200, ['pageVisibility' => $content['pageVisibility'], 'stored' => $storedVisibility]);
    }
    if ($method !== 'PUT') {
        header('Allow: GET, PUT');
        apiRespond(405, ['error' => 'Метод не поддерживается.']);
    }
    apiRequireSameOrigin();
    apiStartSession();
    apiRequireAuthenticated();
    $input = apiReadJsonBody();
    $visibility = $input['pageVisibility'] ?? null;
    if (!is_array($visibility) || array_diff(array_keys($visibility), array_merge(array_keys($defaultPageVisibility), ['holidayGalleryTitles'])) !== []) {
        apiRespond(422, ['error' => 'Некорректные настройки видимости страниц.']);
    }
    foreach ($defaultPageVisibility as $page => $default) {
        if (!is_bool($visibility[$page] ?? null)) apiRespond(422, ['error' => 'Укажите видимость всех страниц.']);
    }
    $titles = $visibility['holidayGalleryTitles'] ?? $defaultHolidayGalleryTitles;
    if (!is_array($titles) || array_diff(array_keys($titles), ['ru', 'nl', 'en']) !== []) {
        apiRespond(422, ['error' => 'Укажите названия галереи праздников на доступных языках.']);
    }
    foreach ($defaultHolidayGalleryTitles as $language => $default) {
        $title = $titles[$language] ?? $default;
        if (!is_string($title) || trim($title) === '' || strlen($title) > 480) {
            apiRespond(422, ['error' => 'Название галереи праздников должно содержать от 1 до 120 символов.']);
        }
        $titles[$language] = trim($title);
    }
    $visibility['holidayGalleryTitles'] = $titles;
    $lock = fopen($lockPath, 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        error_log('Philadelphia API could not lock site content.');
        apiRespond(500, ['error' => 'Не удалось сохранить настройки сайта. Попробуйте ещё раз.']);
    }
    $content = $readContent();
    $content['pageVisibility'] = $visibility;
    apiWriteJsonFile($dataPath, $content);
    flock($lock, LOCK_UN);
    fclose($lock);
    apiRespond(200, ['pageVisibility' => $visibility]);
}

if (!isset($recordCollections[$collection])) {
    apiRespond(400, ['error' => 'Не указан допустимый раздел содержимого сайта.']);
}

if ($method === 'GET') {
    $content = $readContent();
    apiRespond(200, ['items' => $content[$collection]]);
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
    error_log('Philadelphia API could not lock site content.');
    apiRespond(500, ['error' => 'Не удалось заблокировать содержимое сайта. Попробуйте ещё раз.']);
}

$content = $readContent();
$records = $content[$collection];
$id = is_string($_GET['id'] ?? null) ? $_GET['id'] : '';
if ($action === 'order' && $method === 'PUT') {
    $input = apiReadJsonBody();
    $ids = $input['ids'] ?? null;
    $knownIds = array_map(static fn (array $record): string => $record['id'], $records);
    if (!is_array($ids) || array_values($ids) !== $ids || array_filter($ids, static fn ($recordId): bool => !is_string($recordId)) !== []
        || count($ids) !== count($knownIds)
        || count(array_unique($ids)) !== count($knownIds)
        || array_diff($ids, $knownIds) !== [] || array_diff($knownIds, $ids) !== []) {
        flock($lock, LOCK_UN);
        fclose($lock);
        apiRespond(422, ['error' => 'Некорректный порядок записей. Обновите страницу и попробуйте снова.']);
    }
    $recordsById = [];
    foreach ($records as $record) $recordsById[$record['id']] = $record;
    $records = array_map(static fn (string $recordId): array => $recordsById[$recordId], $ids);
} elseif ($method === 'DELETE') {
    if ($id === '') {
        flock($lock, LOCK_UN);
        fclose($lock);
        apiRespond(400, ['error' => 'Не указан идентификатор записи.']);
    }
    $updated = array_values(array_filter($records, static fn (array $record): bool => ($record['id'] ?? null) !== $id));
    if (count($updated) === count($records)) {
        flock($lock, LOCK_UN);
        fclose($lock);
        apiRespond(404, ['error' => 'Запись не найдена.']);
    }
    $records = $updated;
} elseif ($method === 'POST') {
    $record = $validateRecord(apiReadJsonBody());
    foreach ($records as $existing) {
        if (($existing['id'] ?? null) === $record['id']) {
            flock($lock, LOCK_UN);
            fclose($lock);
            apiRespond(409, ['error' => 'Запись с таким идентификатором уже существует.']);
        }
    }
    array_unshift($records, $record);
} elseif ($id !== '') {
    $record = $validateRecord(apiReadJsonBody());
    if ($record['id'] !== $id) {
        flock($lock, LOCK_UN);
        fclose($lock);
        apiRespond(422, ['error' => 'Идентификатор записи не совпадает.']);
    }
    $found = false;
    foreach ($records as $index => $existing) {
        if (($existing['id'] ?? null) === $id) {
            $records[$index] = $record;
            $found = true;
            break;
        }
    }
    if (!$found) {
        flock($lock, LOCK_UN);
        fclose($lock);
        apiRespond(404, ['error' => 'Запись не найдена.']);
    }
} else {
    $input = apiReadJsonBody();
    $replacement = $input['items'] ?? null;
    if (!is_array($replacement) || array_values($replacement) !== $replacement || count($replacement) > 500) {
        flock($lock, LOCK_UN);
        fclose($lock);
        apiRespond(422, ['error' => 'Некорректный список записей.']);
    }
    $records = [];
    $ids = [];
    foreach ($replacement as $item) {
        if (!is_array($item)) {
            flock($lock, LOCK_UN);
            fclose($lock);
            apiRespond(422, ['error' => 'Некорректная запись в списке.']);
        }
        $record = $validateRecord($item);
        if (isset($ids[$record['id']])) {
            flock($lock, LOCK_UN);
            fclose($lock);
            apiRespond(422, ['error' => 'В списке повторяется запись.']);
        }
        $ids[$record['id']] = true;
        $records[] = $record;
    }
}

$content[$collection] = array_values($records);
apiWriteJsonFile($dataPath, $content);
flock($lock, LOCK_UN);
fclose($lock);
apiRespond(200, ['items' => $content[$collection]]);
