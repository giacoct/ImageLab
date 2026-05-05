<?php
require_once __DIR__ . '/src/Processor.php';

use ImageLab\Processor;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  exit('Method not allowed');
}

$processor = new Processor(__DIR__ . '/upload', __DIR__ . '/temp', __DIR__ . '/output');
$result = $processor->handle($_FILES['files'] ?? [], $_POST);

if ($result['ok']) {
  if (!empty($result['zip'])) {
    header('Location: download.php?file=' . urlencode($result['zip']));
  } else {
    header('Location: download.php?file=' . urlencode($result['files'][0] ?? ''));
  }
  exit;
}

http_response_code(400);
echo "<h3>Processing failed</h3><pre>" . htmlspecialchars(implode("\n", $result['errors'])) . "</pre>";
