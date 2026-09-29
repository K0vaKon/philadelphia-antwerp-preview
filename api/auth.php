<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
apiStartSession();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    apiRespond(200, [
        'authenticated' => !empty($_SESSION['authenticated']),
        'configured' => apiLoadAdminPasswordHash() !== null,
        'csrfToken' => $_SESSION['csrf_token'] ?? null,
    ]);
}

if ($method === 'POST') {
    apiRequireSameOrigin();
    $attemptKey = apiRegisterAuthAttempt();
    $input = apiReadJsonBody();
    $passwordHash = apiLoadAdminPasswordHash();

    if ($passwordHash === null) {
        $setupLock = fopen(PHILADELPHIA_API_STORAGE . '/setup.lock', 'c');
        if ($setupLock === false || !flock($setupLock, LOCK_EX)) {
            error_log('Philadelphia API could not lock initial admin setup.');
            apiRespond(500, ['error' => 'Не удалось начать настройку администратора.']);
        }
        if (apiLoadAdminPasswordHash() !== null) {
            flock($setupLock, LOCK_UN);
            fclose($setupLock);
            apiRespond(409, ['error' => 'Пароль уже настроен. Перезагрузите страницу и войдите.']);
        }

        $setupCode = $input['setupCode'] ?? '';
        $newPassword = $input['newPassword'] ?? '';
        if (!is_string($setupCode) || strlen($setupCode) > 256
            || !hash_equals(PHILADELPHIA_SETUP_CODE_SHA256, hash('sha256', $setupCode))) {
            flock($setupLock, LOCK_UN);
            fclose($setupLock);
            apiRespond(401, ['error' => 'Неверный одноразовый код настройки.']);
        }
        if (!is_string($newPassword) || strlen($newPassword) < 12 || strlen($newPassword) > 200) {
            flock($setupLock, LOCK_UN);
            fclose($setupLock);
            apiRespond(422, ['error' => 'Создайте пароль длиной не менее 12 символов.']);
        }

        $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
        if (!is_string($passwordHash)) {
            flock($setupLock, LOCK_UN);
            fclose($setupLock);
            error_log('Philadelphia API could not hash the initial admin password.');
            apiRespond(500, ['error' => 'Не удалось создать пароль администратора.']);
        }
        apiWriteJsonFile(PHILADELPHIA_API_STORAGE . '/admin-password.json', ['passwordHash' => $passwordHash]);
        flock($setupLock, LOCK_UN);
        fclose($setupLock);
    } else {
        $password = $input['password'] ?? '';
        if (!is_string($password) || strlen($password) > 200 || !password_verify($password, $passwordHash)) {
            apiRespond(401, ['error' => 'Неверный пароль. Попробуйте ещё раз.']);
        }
    }

    apiClearAuthAttempts($attemptKey);
    session_regenerate_id(true);
    $_SESSION['authenticated'] = true;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    apiRespond(200, ['authenticated' => true, 'csrfToken' => $_SESSION['csrf_token']]);
}

if ($method === 'DELETE') {
    apiRequireSameOrigin();
    apiRequireAuthenticated();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'secure' => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => $params['samesite'],
        ]);
    }
    session_destroy();
    apiRespond(200, ['authenticated' => false]);
}

header('Allow: GET, POST, DELETE');
apiRespond(405, ['error' => 'Метод не поддерживается.']);
