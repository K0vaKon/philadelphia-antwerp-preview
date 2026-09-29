<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');

function apiRespond(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function apiStartSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_name('philadelphia_admin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    ini_set('session.use_strict_mode', '1');
    if (!is_dir(PHILADELPHIA_API_STORAGE) || !is_writable(PHILADELPHIA_API_STORAGE)) {
        apiRespond(500, ['error' => 'Папка api/storage должна быть доступна PHP для записи.']);
    }
    session_save_path(PHILADELPHIA_API_STORAGE);
    session_start();
}

function apiRequireSameOrigin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $expectedOrigin = $scheme . '://' . $host;

    if ($origin === '' || !hash_equals($expectedOrigin, $origin)) {
        apiRespond(403, ['error' => 'Запрос отклонён: неверный источник.']);
    }
}

function apiReadJsonBody(): array
{
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > PHILADELPHIA_MAX_REQUEST_BYTES) {
        apiRespond(413, ['error' => 'Данные слишком большие. Уменьшите размер фотографии.']);
    }

    $body = file_get_contents('php://input');
    if ($body === false || $body === '') {
        apiRespond(400, ['error' => 'Пустой запрос.']);
    }
    if (strlen($body) > PHILADELPHIA_MAX_REQUEST_BYTES) {
        apiRespond(413, ['error' => 'Данные слишком большие. Уменьшите размер фотографии.']);
    }

    try {
        $decoded = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        apiRespond(400, ['error' => 'Некорректный JSON.']);
    }

    if (!is_array($decoded)) {
        apiRespond(400, ['error' => 'Ожидался объект JSON.']);
    }
    return $decoded;
}

function apiRequireAuthenticated(): void
{
    if (empty($_SESSION['authenticated']) || !is_string($_SESSION['csrf_token'] ?? null)) {
        apiRespond(401, ['error' => 'Сеанс завершён. Войдите в админку снова.']);
    }

    $providedToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($providedToken === '' || !hash_equals($_SESSION['csrf_token'], $providedToken)) {
        apiRespond(403, ['error' => 'Защитный токен отсутствует или устарел. Обновите страницу.']);
    }
}

function apiReadJsonFile(string $path, array $default): array
{
    if (!is_file($path)) {
        return $default;
    }

    $contents = file_get_contents($path);
    if ($contents === false) {
        error_log('Philadelphia API could not read ' . basename($path));
        apiRespond(500, ['error' => 'Не удалось прочитать данные с сервера.']);
    }

    try {
        $data = json_decode($contents, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        error_log('Philadelphia API found invalid JSON in ' . basename($path));
        apiRespond(500, ['error' => 'Файл серверных данных повреждён. Обратитесь к администратору сайта.']);
    }

    if (!is_array($data)) {
        error_log('Philadelphia API found an invalid structure in ' . basename($path));
        apiRespond(500, ['error' => 'Формат серверных данных повреждён.']);
    }
    return $data;
}

function apiWriteJsonFile(string $path, array $data): void
{
    $encoded = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $temporaryPath = tempnam(PHILADELPHIA_API_STORAGE, '.write-');
    if ($temporaryPath === false) {
        error_log('Philadelphia API could not create a temporary data file.');
        apiRespond(500, ['error' => 'Не удалось подготовить запись на сервере. Проверьте права на папку api/storage.']);
    }

    if (file_put_contents($temporaryPath, $encoded, LOCK_EX) === false || !rename($temporaryPath, $path)) {
        @unlink($temporaryPath);
        error_log('Philadelphia API could not save ' . basename($path));
        apiRespond(500, ['error' => 'Не удалось сохранить данные. Проверьте права на папку api/storage.']);
    }
    @chmod($path, 0600);
}

function apiLoadAdminPasswordHash(): ?string
{
    $data = apiReadJsonFile(PHILADELPHIA_API_STORAGE . '/admin-password.json', []);
    $hash = $data['passwordHash'] ?? null;
    return is_string($hash) && $hash !== '' ? $hash : null;
}

function apiRegisterAuthAttempt(): string
{
    $key = hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $lock = fopen(PHILADELPHIA_API_STORAGE . '/auth-attempts.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        error_log('Philadelphia API could not lock authentication rate-limit data.');
        apiRespond(500, ['error' => 'Не удалось проверить ограничение попыток входа.']);
    }

    $path = PHILADELPHIA_API_STORAGE . '/auth-attempts.json';
    $attempts = apiReadJsonFile($path, []);
    $now = time();
    $recent = array_values(array_filter(
        $attempts[$key] ?? [],
        static fn ($timestamp): bool => is_int($timestamp) && $timestamp > $now - 900
    ));
    if (count($recent) >= 10) {
        $retryAfter = max(1, $recent[0] + 900 - $now);
        flock($lock, LOCK_UN);
        fclose($lock);
        header('Retry-After: ' . $retryAfter);
        apiRespond(429, ['error' => 'Слишком много попыток входа. Подождите 15 минут и попробуйте снова.']);
    }

    $recent[] = $now;
    $attempts[$key] = $recent;
    apiWriteJsonFile($path, $attempts);
    flock($lock, LOCK_UN);
    fclose($lock);
    return $key;
}

function apiClearAuthAttempts(string $key): void
{
    $lock = fopen(PHILADELPHIA_API_STORAGE . '/auth-attempts.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        error_log('Philadelphia API could not lock authentication rate-limit data for reset.');
        apiRespond(500, ['error' => 'Не удалось завершить проверку входа.']);
    }
    $path = PHILADELPHIA_API_STORAGE . '/auth-attempts.json';
    $attempts = apiReadJsonFile($path, []);
    unset($attempts[$key]);
    apiWriteJsonFile($path, $attempts);
    flock($lock, LOCK_UN);
    fclose($lock);
}

function apiValidateEvent(array $event): array
{
    $text = static function (string $key, int $maxBytes, bool $required = false) use ($event): string {
        $value = $event[$key] ?? '';
        if (!is_string($value)) {
            apiRespond(422, ['error' => 'Некорректное поле события: ' . $key]);
        }
        $value = trim($value);
        if (strlen($value) > $maxBytes || ($required && $value === '')) {
            apiRespond(422, ['error' => 'Проверьте поле события: ' . $key]);
        }
        return $value;
    };

    $id = $text('id', 100, true);
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $id)) {
        apiRespond(422, ['error' => 'Некорректный идентификатор события.']);
    }

    $date = $text('date', 10, true);
    $dateParts = explode('-', $date);
    if (count($dateParts) !== 3 || !checkdate((int) ($dateParts[1] ?? 0), (int) ($dateParts[2] ?? 0), (int) ($dateParts[0] ?? 0))) {
        apiRespond(422, ['error' => 'Укажите корректную дату события.']);
    }

    $time = $text('time', 5, true);
    if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $time)) {
        apiRespond(422, ['error' => 'Укажите время в формате 24 часа, например 18:30.']);
    }

    $translations = $event['translations'] ?? [];
    if (!is_array($translations)) {
        apiRespond(422, ['error' => 'Некорректные переводы события.']);
    }
    $normalizedTranslations = [];
    foreach (['nl', 'en'] as $language) {
        $translation = $translations[$language] ?? [];
        if (!is_array($translation)) {
            apiRespond(422, ['error' => 'Некорректный перевод события.']);
        }
        $normalizedTranslations[$language] = [];
        foreach (['title' => 600, 'tag' => 300, 'description' => 12000] as $field => $maxBytes) {
            $value = $translation[$field] ?? '';
            if (!is_string($value) || strlen($value) > $maxBytes) {
                apiRespond(422, ['error' => 'Некорректный перевод: ' . $field]);
            }
            $normalizedTranslations[$language][$field] = trim($value);
        }
    }

    $image = $text('image', 5 * 1024 * 1024, true);
    $isDataImage = preg_match('/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/', $image) === 1;
    $isHttpsImage = filter_var($image, FILTER_VALIDATE_URL) !== false && str_starts_with($image, 'https://');
    if (!$isDataImage && !$isHttpsImage) {
        apiRespond(422, ['error' => 'Фото события должно быть изображением или HTTPS-ссылкой.']);
    }

    return [
        'id' => $id,
        'title' => $text('title', 600, true),
        'date' => $date,
        'time' => $time,
        'tag' => $text('tag', 300),
        'description' => $text('description', 12000, true),
        'translations' => $normalizedTranslations,
        'image' => $image,
    ];
}
