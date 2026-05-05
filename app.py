import os
import uuid
import json
import shutil
import zipfile
import threading
import subprocess
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime
from queue import Queue

from flask import Flask, render_template, request, redirect, url_for, send_file, jsonify, abort
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).parent.resolve()
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
JOB_DIR = DATA_DIR / "jobs"
ALLOWED_EXTENSIONS = {
    "png", "jpg", "jpeg", "webp", "tiff", "tif", "gif", "bmp", "ico", "svg"
}

for d in (DATA_DIR, UPLOAD_DIR, JOB_DIR):
    d.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024  # 300MB


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


TOOLS = {
    "convert": {
        "name": "Format Conversion",
        "category": "Format",
        "description": "Convert PNG/JPG/WEBP/TIFF/GIF/BMP/ICO/SVG",
        "params": ["target_format", "quality"],
    },
    "resize": {
        "name": "Resize",
        "category": "Editing",
        "description": "Resize by pixels or percent",
        "params": ["resize_mode", "width", "height", "percent"],
    },
    "optimize": {
        "name": "Optimize",
        "category": "Optimization",
        "description": "Reduce file size and strip metadata",
        "params": ["quality_preset", "strip_metadata"],
    },
    "grayscale": {
        "name": "Grayscale",
        "category": "Editing",
        "description": "Convert images to grayscale",
        "params": [],
    },
    "rotate": {
        "name": "Rotate / Flip",
        "category": "Editing",
        "description": "Rotate and/or flip images",
        "params": ["rotate_degrees", "flip_mode"],
    },
    "palette": {
        "name": "Extract Palette",
        "category": "Color",
        "description": "Extract dominant colors from image",
        "params": ["colors"],
    },
    "metadata": {
        "name": "View Metadata",
        "category": "Metadata",
        "description": "View EXIF basic information",
        "params": [],
    },
}

@dataclass
class Job:
    id: str
    tool: str
    status: str = "queued"
    progress: int = 0
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    params: dict = field(default_factory=dict)
    inputs: list = field(default_factory=list)
    outputs: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    result_zip: str | None = None
    metadata: dict = field(default_factory=dict)

    def to_dict(self):
        return self.__dict__


jobs: dict[str, Job] = {}
job_queue: Queue = Queue()


def run_cmd(cmd: list[str]):
    return subprocess.run(cmd, capture_output=True, text=True)


def job_paths(job_id: str):
    root = JOB_DIR / job_id
    in_dir = root / "in"
    out_dir = root / "out"
    preview_dir = root / "preview"
    for d in (root, in_dir, out_dir, preview_dir):
        d.mkdir(parents=True, exist_ok=True)
    return root, in_dir, out_dir, preview_dir


def convert_file(tool: str, src: Path, out_dir: Path, params: dict, job: Job):
    base = src.stem
    suffix = src.suffix.lower().lstrip(".")

    if tool == "convert":
        target = params.get("target_format", "png").lower()
        if target == "jpeg":
            target = "jpg"
        out = out_dir / f"{base}.{target}"
        cmd = ["convert", str(src)]
        quality = params.get("quality")
        if quality:
            cmd += ["-quality", str(quality)]
        cmd.append(str(out))
        res = run_cmd(cmd)
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or "convert failed")
        return out

    if tool == "resize":
        out = out_dir / f"{base}.{suffix}"
        mode = params.get("resize_mode", "pixels")
        resize_arg = "100%"
        if mode == "percent":
            resize_arg = f"{params.get('percent', '100')}%"
        else:
            w = params.get("width", "")
            h = params.get("height", "")
            resize_arg = f"{w}x{h}" if (w or h) else "100%"
        cmd = ["convert", str(src), "-resize", resize_arg, str(out)]
        res = run_cmd(cmd)
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or "resize failed")
        return out

    if tool == "optimize":
        out = out_dir / f"{base}.{suffix}"
        shutil.copy2(src, out)
        preset = params.get("quality_preset", "medium")
        q = {"high": "85", "medium": "75", "smallest": "60"}.get(preset, "75")
        run_cmd(["mogrify", "-strip" if params.get("strip_metadata") else "", "-quality", q, str(out)])
        return out

    if tool == "grayscale":
        out = out_dir / f"{base}.{suffix}"
        res = run_cmd(["convert", str(src), "-colorspace", "Gray", str(out)])
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or "grayscale failed")
        return out

    if tool == "rotate":
        out = out_dir / f"{base}.{suffix}"
        cmd = ["convert", str(src)]
        deg = params.get("rotate_degrees")
        if deg:
            cmd += ["-rotate", str(deg)]
        flip_mode = params.get("flip_mode")
        if flip_mode == "horizontal":
            cmd += ["-flop"]
        elif flip_mode == "vertical":
            cmd += ["-flip"]
        cmd.append(str(out))
        res = run_cmd(cmd)
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or "rotate failed")
        return out

    if tool == "palette":
        out = out_dir / f"{base}_palette.txt"
        count = str(params.get("colors", 6))
        cmd = ["convert", str(src), "-resize", "200x200", "-colors", count, "-unique-colors", "txt:-"]
        res = run_cmd(cmd)
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or "palette failed")
        out.write_text(res.stdout)
        return out

    if tool == "metadata":
        out = out_dir / f"{base}_metadata.json"
        res = run_cmd(["exiftool", "-j", str(src)])
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or "metadata failed")
        out.write_text(res.stdout)
        return out

    raise RuntimeError("Unknown tool")


def worker_loop():
    while True:
        job_id = job_queue.get()
        job = jobs.get(job_id)
        if not job:
            continue
        job.status = "processing"
        root, in_dir, out_dir, preview_dir = job_paths(job_id)
        total = len(job.inputs)
        for idx, input_name in enumerate(job.inputs):
            src = in_dir / input_name
            try:
                out = convert_file(job.tool, src, out_dir, job.params, job)
                job.outputs.append(out.name)
                if out.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
                    preview = preview_dir / f"{out.stem}.jpg"
                    run_cmd(["convert", str(out), "-thumbnail", "600x600>", str(preview)])
            except Exception as exc:
                job.errors.append(f"{input_name}: {exc}")
            job.progress = int(((idx + 1) / max(1, total)) * 100)

        if len(job.outputs) > 1:
            zip_path = root / f"{job.id}_results.zip"
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for name in job.outputs:
                    zf.write(out_dir / name, arcname=name)
            job.result_zip = zip_path.name

        job.status = "done" if not job.errors else ("partial" if job.outputs else "failed")
        job_queue.task_done()


threading.Thread(target=worker_loop, daemon=True).start()


@app.get("/")
def index():
    grouped = {}
    for key, tool in TOOLS.items():
        grouped.setdefault(tool["category"], []).append((key, tool))
    return render_template("index.html", grouped=grouped)


@app.get("/tool/<tool>")
def tool_page(tool):
    if tool not in TOOLS:
        abort(404)
    return render_template("tool.html", tool_key=tool, tool=TOOLS[tool])


@app.post("/process/<tool>")
def process_tool(tool):
    if tool not in TOOLS:
        abort(404)
    files = request.files.getlist("files")
    valid = [f for f in files if f and f.filename and allowed_file(f.filename)]
    if not valid:
        return "No valid files uploaded.", 400

    job_id = uuid.uuid4().hex[:12]
    _, in_dir, _, _ = job_paths(job_id)
    params = dict(request.form)

    input_names = []
    for f in valid:
        name = secure_filename(f.filename)
        if not name:
            continue
        f.save(in_dir / name)
        input_names.append(name)

    job = Job(id=job_id, tool=tool, params=params, inputs=input_names)
    jobs[job_id] = job
    job_queue.put(job_id)

    return redirect(url_for("progress_page", job_id=job_id))


@app.get("/progress/<job_id>")
def progress_page(job_id):
    if job_id not in jobs:
        abort(404)
    return render_template("progress.html", job_id=job_id)


@app.get("/api/job/<job_id>")
def job_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "not found"}), 404
    return jsonify(job.to_dict())


@app.get("/results/<job_id>")
def results_page(job_id):
    job = jobs.get(job_id)
    if not job:
        abort(404)
    return render_template("results.html", job=job)


@app.get("/download/<job_id>/<name>")
def download_output(job_id, name):
    job = jobs.get(job_id)
    if not job:
        abort(404)
    root, _, out_dir, _ = job_paths(job_id)
    if name == "zip" and job.result_zip:
        return send_file(root / job.result_zip, as_attachment=True)
    if name not in job.outputs:
        abort(404)
    return send_file(out_dir / name, as_attachment=True)


@app.get("/preview/<job_id>/<name>")
def preview(job_id, name):
    _, _, _, preview_dir = job_paths(job_id)
    p = preview_dir / name
    if not p.exists():
        abort(404)
    return send_file(p)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=False)
