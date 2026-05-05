<?php
namespace ImageLab;

class Processor {
  private string $uploadDir;
  private string $tempDir;
  private string $outputDir;

  public function __construct(string $uploadDir, string $tempDir, string $outputDir) {
    $this->uploadDir = $uploadDir;
    $this->tempDir = $tempDir;
    $this->outputDir = $outputDir;
    foreach ([$uploadDir, $tempDir, $outputDir] as $dir) {
      if (!is_dir($dir)) mkdir($dir, 0775, true);
    }
  }

  public function handle(array $files, array $post): array {
    $saved = $this->saveUploads($files);
    $errors = [];
    $outputs = [];

    foreach ($saved as $file) {
      $out = $this->processOne($file, $post, $errors);
      if ($out) $outputs[] = $out;
    }

    if (count($outputs) > 1) {
      $zip = $this->packZip($outputs);
      return ['ok' => empty($errors), 'files' => $outputs, 'zip' => basename($zip), 'errors' => $errors];
    }

    return ['ok' => !empty($outputs) && empty($errors), 'files' => array_map('basename', $outputs), 'errors' => $errors];
  }

  private function saveUploads(array $files): array {
    $saved = [];
    if (empty($files['name'])) return $saved;
    foreach ($files['name'] as $i => $name) {
      if (($files['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) continue;
      $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', basename($name));
      $target = $this->uploadDir . '/' . uniqid('up_', true) . '_' . $safe;
      if (move_uploaded_file($files['tmp_name'][$i], $target)) $saved[] = $target;
    }
    return $saved;
  }

  private function processOne(string $input, array $post, array &$errors): ?string {
    $module = $post['module'] ?? 'convert';
    $action = $post['action'] ?? '';
    $format = strtolower(trim($post['format'] ?? ''));

    if (strtolower(pathinfo($input, PATHINFO_EXTENSION)) === 'zip' || $module === 'batch') {
      return $this->processBatchZip($input, $post, $errors);
    }

    $base = pathinfo($input, PATHINFO_FILENAME);
    $ext = $format ?: pathinfo($input, PATHINFO_EXTENSION);
    $output = $this->outputDir . '/' . $base . '_' . time() . '.' . $ext;

    $cmd = $this->buildCommand($module, $action, $input, $output, $post);
    if (!$cmd) { $errors[] = "Unsupported operation: $module/$action"; return null; }

    exec($cmd . ' 2>&1', $out, $code);
    if ($code !== 0) {
      $errors[] = "Command failed: $cmd\n" . implode("\n", $out);
      return null;
    }

    return $output;
  }

  private function buildCommand(string $module, string $action, string $in, string $out, array $p): ?string {
    $inE = escapeshellarg($in); $outE = escapeshellarg($out);
    $w = (int)($p['width'] ?? 0); $h = (int)($p['height'] ?? 0); $a = (float)($p['angle'] ?? 0);
    $q = max(1, min(100, (int)($p['quality'] ?? 85)));

    if ($module === 'convert') return "magick $inE $outE";

    if ($module === 'edit') {
      return match ($action) {
        'resize' => "magick $inE -resize {$w}x{$h} $outE",
        'crop' => "magick $inE -crop " . escapeshellarg($p['crop'] ?? '100x100+0+0') . " +repage $outE",
        'rotate' => "magick $inE -rotate {$a} $outE",
        'flip_h' => "magick $inE -flop $outE",
        'flip_v' => "magick $inE -flip $outE",
        'grayscale' => "magick $inE -colorspace Gray $outE",
        'sepia' => "magick $inE -sepia-tone 80% $outE",
        'invert' => "magick $inE -negate $outE",
        'brightness_contrast' => "magick $inE -brightness-contrast " . escapeshellarg(($p['brightness'] ?? 0) . 'x' . ($p['contrast'] ?? 0)) . " $outE",
        'replace_color' => $this->replaceColorCmd($inE, $outE, (string)($p['replace'] ?? '')),
        default => null,
      };
    }

    if ($module === 'optimize') {
      return match ($action) {
        'png' => "pngquant --force --output $outE --quality=50-{$q} $inE && optipng -o2 $outE",
        'jpeg' => "cp $inE $outE && jpegoptim -m{$q} --strip-all $outE",
        'strip_meta' => "cp $inE $outE && exiftool -overwrite_original -all= $outE",
        'gif' => "gifsicle -O3 $inE -o $outE",
        default => null,
      };
    }

    if ($module === 'svg') {
      return match ($action) {
        'to_svg' => "magick $inE -threshold 50% " . escapeshellarg($this->tempDir . '/trace.pbm') . " && potrace " . escapeshellarg($this->tempDir . '/trace.pbm') . " -s -o $outE",
        'svg_to_png' => "inkscape $inE --export-type=png --export-filename=$outE",
        'svg_to_jpg' => "inkscape $inE --export-type=jpg --export-filename=$outE",
        'svg_to_pdf' => "inkscape $inE --export-type=pdf --export-filename=$outE",
        'cleanup' => "scour -i $inE -o $outE",
        'resize_canvas' => "inkscape $inE --export-area-page --export-filename=$outE",
        default => null,
      };
    }

    return null;
  }

  private function replaceColorCmd(string $inE, string $outE, string $replace): string {
    [$from, $to] = array_pad(array_map('trim', explode(',', $replace)), 2, '#000000');
    return "magick $inE -fuzz 10% -fill " . escapeshellarg($to) . " -opaque " . escapeshellarg($from) . " $outE";
  }

  private function processBatchZip(string $zipPath, array $post, array &$errors): ?string {
    $work = $this->tempDir . '/' . uniqid('batch_', true);
    mkdir($work, 0775, true);
    exec('unzip -o ' . escapeshellarg($zipPath) . ' -d ' . escapeshellarg($work) . ' 2>&1', $out, $code);
    if ($code !== 0) { $errors[] = 'ZIP extraction failed'; return null; }

    $files = glob($work . '/*.{png,jpg,jpeg,webp,tiff,gif,bmp,svg}', GLOB_BRACE) ?: [];
    $processed = [];
    foreach ($files as $f) {
      $p = $this->processOne($f, $post, $errors);
      if ($p) $processed[] = $p;
    }
    if (!$processed) return null;

    return $this->packZip($processed);
  }

  private function packZip(array $files): string {
    $zip = $this->outputDir . '/imagelab_' . time() . '.zip';
    $za = new \ZipArchive();
    $za->open($zip, \ZipArchive::CREATE | \ZipArchive::OVERWRITE);
    foreach ($files as $file) $za->addFile($file, basename($file));
    $za->close();
    return $zip;
  }
}
