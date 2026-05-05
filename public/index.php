<?php
$modules = [
  'convert' => 'Convert',
  'edit' => 'Edit',
  'svg' => 'SVG Tools',
  'optimize' => 'Optimize',
  'batch' => 'Batch',
];
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ImageLab</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="assets/style.css" rel="stylesheet">
</head>
<body class="bg-light">
<div class="container py-4">
  <header class="mb-4 text-center">
    <h1 class="fw-bold">ImageLab</h1>
    <p class="text-muted mb-0">Local-first CLI-powered image workstation</p>
  </header>

  <section class="row g-3 mb-4">
    <?php foreach ($modules as $key => $label): ?>
      <div class="col-6 col-md-4 col-lg-2">
        <button class="btn btn-primary w-100 p-3 module-btn" data-module="<?= htmlspecialchars($key) ?>"><?= htmlspecialchars($label) ?></button>
      </div>
    <?php endforeach; ?>
  </section>

  <section class="card shadow-sm">
    <div class="card-body">
      <form id="processForm" action="process.php" method="post" enctype="multipart/form-data">
        <div class="mb-3">
          <label class="form-label">Upload image(s) or ZIP</label>
          <input class="form-control form-control-lg" type="file" name="files[]" id="files" multiple required>
          <div id="dropzone" class="mt-2 p-3 border border-2 rounded text-center text-muted">Drag & drop files here</div>
        </div>

        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label">Operation group</label>
            <select class="form-select form-select-lg" name="module" id="module" required>
              <?php foreach ($modules as $key => $label): ?>
                <option value="<?= htmlspecialchars($key) ?>"><?= htmlspecialchars($label) ?></option>
              <?php endforeach; ?>
            </select>
          </div>

          <div class="col-md-4">
            <label class="form-label">Action</label>
            <select class="form-select form-select-lg" name="action" id="action" required></select>
          </div>

          <div class="col-md-4">
            <label class="form-label">Target format (if needed)</label>
            <select class="form-select form-select-lg" name="format" id="format">
              <option value="">Keep format</option>
              <option>png</option><option>jpg</option><option>jpeg</option><option>webp</option><option>tiff</option>
              <option>gif</option><option>bmp</option><option>ico</option><option>pdf</option><option>svg</option>
            </select>
          </div>
        </div>

        <div class="row g-3 mt-1">
          <div class="col-6 col-md-3"><input class="form-control form-control-lg" name="width" placeholder="Width"></div>
          <div class="col-6 col-md-3"><input class="form-control form-control-lg" name="height" placeholder="Height"></div>
          <div class="col-6 col-md-3"><input class="form-control form-control-lg" name="angle" placeholder="Rotate angle"></div>
          <div class="col-6 col-md-3"><input class="form-control form-control-lg" name="quality" placeholder="Quality 1-100"></div>
          <div class="col-6 col-md-3"><input class="form-control form-control-lg" name="crop" placeholder="Crop WxH+X+Y"></div>
          <div class="col-6 col-md-3"><input class="form-control form-control-lg" name="brightness" placeholder="Brightness -100..100"></div>
          <div class="col-6 col-md-3"><input class="form-control form-control-lg" name="contrast" placeholder="Contrast -100..100"></div>
          <div class="col-6 col-md-3"><input class="form-control form-control-lg" name="replace" placeholder="from,to (#RRGGBB,#RRGGBB)"></div>
        </div>

        <button class="btn btn-success btn-lg w-100 mt-3" type="submit">Process</button>
      </form>

      <div id="spinner" class="text-center mt-3 d-none">
        <div class="spinner-border" role="status"></div>
        <p class="mb-0 mt-2">Processing…</p>
      </div>

      <div id="preview" class="row g-2 mt-2"></div>
    </div>
  </section>
</div>
<script src="assets/app.js"></script>
</body>
</html>
