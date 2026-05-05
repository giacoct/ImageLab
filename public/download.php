<?php
$file = basename($_GET['file'] ?? '');
$path = __DIR__ . '/output/' . $file;
if (!$file || !is_file($path)) {
  http_response_code(404);
  exit('File not found');
}
header('Content-Description: File Transfer');
header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="' . $file . '"');
header('Content-Length: ' . filesize($path));
readfile($path);
