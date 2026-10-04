<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

$collection = is_string($_GET['collection'] ?? null) ? $_GET['collection'] : 'gallery';
if (!in_array($collection, ['gallery', 'holidays'], true)) {
    apiRespond(400, ['error' => 'Неизвестная галерея.']);
}
$dataPath = PHILADELPHIA_API_STORAGE . '/' . ($collection === 'holidays' ? 'holiday-gallery.json' : 'gallery.json');
$lockPath = PHILADELPHIA_API_STORAGE . '/' . ($collection === 'holidays' ? 'holiday-gallery.lock' : 'gallery.lock');
$imageDirectory = PHILADELPHIA_API_STORAGE . '/' . ($collection === 'holidays' ? 'holiday-gallery-images' : 'gallery-images');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$validatePhotos = static function (array $photos): array {
    if (array_values($photos) !== $photos || count($photos) > 500) {
        error_log('Philadelphia API found an invalid gallery data structure.');
        apiRespond(500, ['error' => 'Формат галереи на сервере повреждён.']);
    }
    foreach ($photos as $photo) {
        if (!is_array($photo)
            || !is_string($photo['id'] ?? null)
            || !preg_match('/^[A-Za-z0-9_-]{1,100}$/', $photo['id'])
            || !is_string($photo['createdAt'] ?? null)
            || strlen($photo['createdAt']) > 50
            || strtotime($photo['createdAt']) === false
            || !is_string($photo['updatedAt'] ?? null)
            || !preg_match('/^\d{14}-[a-f0-9]{8}$/', $photo['updatedAt'])) {
            error_log('Philadelphia API found invalid gallery metadata.');
            apiRespond(500, ['error' => 'Запись фотографии на сервере повреждена.']);
        }
    }
    return $photos;
};

$publicPhotos = static function (array $photos) use ($collection): array {
    return array_map(
        static fn (array $photo): array => [
            'id' => $photo['id'],
            'createdAt' => $photo['createdAt'],
            'image' => 'api/gallery-image.php?collection=' . rawurlencode($collection) . '&id=' . rawurlencode($photo['id']) . '&v=' . rawurlencode($photo['updatedAt']),
        ],
        $photos
    );
};

$findPhotoIndex = static function (array $photos, string $id): ?int {
    foreach ($photos as $index => $photo) {
        if (($photo['id'] ?? null) === $id) {
            return $index;
        }
    }
    return null;
};

if ($method === 'GET') {
    $photos = $validatePhotos(apiReadJsonFile($dataPath, []));
    apiRespond(200, ['photos' => $publicPhotos($photos)]);
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
    error_log('Philadelphia API could not lock gallery data.');
    apiRespond(500, ['error' => 'Не удалось заблокировать данные галереи. Попробуйте ещё раз.']);
}

$photos = $validatePhotos(apiReadJsonFile($dataPath, []));
if (count($photos) > 500) {
    flock($lock, LOCK_UN);
    fclose($lock);
    error_log('Philadelphia API found an invalid gallery data structure.');
    apiRespond(500, ['error' => 'Формат галереи на сервере повреждён.']);
}

if ($method === 'DELETE') {
    $id = is_string($_GET['id'] ?? null) ? $_GET['id'] : '';
    if (!preg_match('/^[A-Za-z0-9_-]{1,100}$/', $id)) {
        flock($lock, LOCK_UN);
        fclose($lock);
        apiRespond(400, ['error' => 'Некорректный идентификатор фотографии.']);
    }
    $index = $findPhotoIndex($photos, $id);
    if ($index === null) {
        flock($lock, LOCK_UN);
        fclose($lock);
        apiRespond(404, ['error' => 'Фотография не найдена.']);
    }
    array_splice($photos, $index, 1);
    apiWriteJsonFile($dataPath, $photos);
    $imagePath = $imageDirectory . '/' . $id . '.jpg';
    if (is_file($imagePath) && !unlink($imagePath)) {
        error_log('Philadelphia API could not remove a deleted gallery image.');
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    apiRespond(200, ['photos' => $publicPhotos($photos)]);
}

$input = apiReadJsonBody();
$id = $input['id'] ?? null;
$createdAt = $input['createdAt'] ?? null;
$image = $input['image'] ?? null;
if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,100}$/', $id)
    || !is_string($createdAt) || strlen($createdAt) > 50 || strtotime($createdAt) === false
    || !is_string($image) || !preg_match('/^data:image\/jpeg;base64,([A-Za-z0-9+\/]+={0,2})$/', $image, $matches)) {
    flock($lock, LOCK_UN);
    fclose($lock);
    apiRespond(422, ['error' => 'Некорректная фотография. Загрузите изображение ещё раз.']);
}

$index = $findPhotoIndex($photos, $id);
if ($method === 'POST' && $index !== null) {
    flock($lock, LOCK_UN);
    fclose($lock);
    apiRespond(409, ['error' => 'Такая фотография уже находится в галерее.']);
}
$requestedId = is_string($_GET['id'] ?? null) ? $_GET['id'] : '';
if ($method === 'PUT' && ($index === null || $requestedId !== $id)) {
    flock($lock, LOCK_UN);
    fclose($lock);
    apiRespond(404, ['error' => 'Фотография для обновления не найдена.']);
}
if ($method === 'POST' && count($photos) >= 500) {
    flock($lock, LOCK_UN);
    fclose($lock);
    apiRespond(422, ['error' => 'Достигнут лимит галереи в 500 фотографий.']);
}

$imageBytes = base64_decode($matches[1], true);
$imageInfo = $imageBytes === false ? false : getimagesizefromstring($imageBytes);
if ($imageBytes === false || strlen($imageBytes) > 3 * 1024 * 1024
    || $imageInfo === false || ($imageInfo['mime'] ?? '') !== 'image/jpeg'
    || $imageInfo[0] > 1600 || $imageInfo[1] > 1600) {
    flock($lock, LOCK_UN);
    fclose($lock);
    apiRespond(422, ['error' => 'Фото должно быть JPEG не более 1600 пикселей и 3 МБ. Выберите его ещё раз.']);
}

if (!is_dir($imageDirectory) && !mkdir($imageDirectory, 0700, true) && !is_dir($imageDirectory)) {
    flock($lock, LOCK_UN);
    fclose($lock);
    error_log('Philadelphia API could not create its private gallery image directory.');
    apiRespond(500, ['error' => 'Не удалось подготовить закрытое хранилище фотографий.']);
}

$temporaryPath = tempnam($imageDirectory, '.upload-');
if ($temporaryPath === false) {
    flock($lock, LOCK_UN);
    fclose($lock);
    error_log('Philadelphia API could not create a temporary gallery image.');
    apiRespond(500, ['error' => 'Не удалось подготовить запись фотографии на сервере.']);
}

$imagePath = $imageDirectory . '/' . $id . '.jpg';
if (file_put_contents($temporaryPath, $imageBytes, LOCK_EX) === false
    || !chmod($temporaryPath, 0600) || !rename($temporaryPath, $imagePath)) {
    @unlink($temporaryPath);
    flock($lock, LOCK_UN);
    fclose($lock);
    error_log('Philadelphia API could not save a gallery image.');
    apiRespond(500, ['error' => 'Не удалось сохранить фото. Проверьте права на api/storage.']);
}

$photo = [
    'id' => $id,
    'createdAt' => $createdAt,
    'updatedAt' => gmdate('YmdHis') . '-' . bin2hex(random_bytes(4)),
];
if ($method === 'POST') {
    array_unshift($photos, $photo);
} else {
    $photos[$index] = $photo;
}
apiWriteJsonFile($dataPath, array_values($photos));
flock($lock, LOCK_UN);
fclose($lock);
apiRespond(200, ['photos' => $publicPhotos(array_values($photos))]);
