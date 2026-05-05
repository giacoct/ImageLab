const actions = {
  convert: ["to_format"],
  edit: ["resize", "crop", "rotate", "flip_h", "flip_v", "brightness_contrast", "replace_color", "grayscale", "sepia", "invert"],
  svg: ["to_svg", "svg_to_png", "svg_to_jpg", "svg_to_pdf", "cleanup", "resize_canvas"],
  optimize: ["png", "jpeg", "gif", "strip_meta"],
  batch: ["batch_run"]
};

const moduleSelect = document.getElementById('module');
const actionSelect = document.getElementById('action');
const form = document.getElementById('processForm');
const spinner = document.getElementById('spinner');
const filesInput = document.getElementById('files');
const dropzone = document.getElementById('dropzone');
const preview = document.getElementById('preview');

function populateActions() {
  const module = moduleSelect.value;
  actionSelect.innerHTML = '';
  (actions[module] || []).forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a.replace(/_/g, ' ');
    actionSelect.appendChild(opt);
  });
}

moduleSelect.addEventListener('change', populateActions);
document.querySelectorAll('.module-btn').forEach(btn => btn.addEventListener('click', () => {
  moduleSelect.value = btn.dataset.module;
  populateActions();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}));

form.addEventListener('submit', () => spinner.classList.remove('d-none'));

filesInput.addEventListener('change', () => renderPreviews(filesInput.files));
['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('active'); }));
['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('active'); }));
dropzone.addEventListener('drop', e => {
  filesInput.files = e.dataTransfer.files;
  renderPreviews(e.dataTransfer.files);
});

function renderPreviews(files) {
  preview.innerHTML = '';
  [...files].slice(0, 8).forEach(file => {
    const col = document.createElement('div');
    col.className = 'col-3';
    const card = document.createElement('div');
    card.className = 'small text-truncate';
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.className = 'img-fluid rounded border';
      img.src = URL.createObjectURL(file);
      card.appendChild(img);
    }
    const name = document.createElement('div');
    name.textContent = file.name;
    card.appendChild(name);
    col.appendChild(card);
    preview.appendChild(col);
  });
}
populateActions();
