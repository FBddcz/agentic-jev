"""Optional CUDA worker for FASHN VTON 1.5. See docs/TRY_ON.md.

No image persistence, cloud calls, browser CORS or automatic model installation.
Model dependencies may download their weights on first initialization.
"""
import argparse
import base64
import io
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = "FASHN VTON 1.5"
MAX_BYTES = 12 * 1024 * 1024


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights-dir", required=True)
    parser.add_argument("--port", type=int, default=8789)
    args = parser.parse_args()
    import torch
    from PIL import Image, ImageOps
    from fashn_vton import TryOnPipeline

    if not torch.cuda.is_available():
        raise SystemExit("This worker requires a CUDA GPU. Use a GPU host and an SSH tunnel; see docs/TRY_ON.md.")
    Image.MAX_IMAGE_PIXELS = 20_000_000
    pipeline = TryOnPipeline(weights_dir=args.weights_dir)
    lock = threading.Lock()

    def decode(data):
        if not isinstance(data, str) or not data.startswith(("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")):
            raise ValueError("Invalid image")
        raw = base64.b64decode(data.split(",", 1)[1], validate=True)
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError("Image too large")
        image = Image.open(io.BytesIO(raw))
        if image.width * image.height > 20_000_000:
            raise ValueError("Image dimensions too large")
        image.load()
        return ImageOps.exif_transpose(image).convert("RGB")

    class Handler(BaseHTTPRequestHandler):
        def respond(self, status, data):
            body = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def trusted(self):
            return not self.headers.get("Origin") and self.headers.get("Host") in (f"127.0.0.1:{args.port}", f"localhost:{args.port}")

        def do_GET(self):
            if not self.trusted():
                return self.respond(403, {"error": "Server-to-server access only"})
            if self.path != "/health":
                return self.respond(404, {"error": "Not found"})
            self.respond(200, {"ready": True, "model": MODEL})

        def do_POST(self):
            if not self.trusted():
                return self.respond(403, {"error": "Server-to-server access only"})
            if self.path != "/try-on" or self.headers.get("Content-Type") != "application/json":
                return self.respond(400, {"error": "Use JSON /try-on"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_BYTES:
                    raise ValueError()
            except ValueError:
                return self.respond(413, {"error": "Invalid body size"})
            self.connection.settimeout(15)
            try:
                data = json.loads(self.rfile.read(length))
                if data.get("category") not in ("tops", "bottoms", "one-pieces") or data.get("garmentPhotoType") not in ("flat-lay", "model"):
                    raise ValueError()
                person, garment = decode(data["personImage"]), decode(data["garmentImage"])
            except Exception:
                return self.respond(400, {"error": "Invalid images or category"})
            if not lock.acquire(blocking=False):
                return self.respond(409, {"error": "Busy"})
            try:
                start = time.perf_counter()
                with torch.inference_mode():
                    result = pipeline(person_image=person, garment_image=garment, category=data["category"], garment_photo_type=data["garmentPhotoType"], num_samples=1)
                elapsed = (time.perf_counter() - start) * 1000
                output = io.BytesIO()
                result.images[0].save(output, format="PNG")
                self.respond(200, {"image": "data:image/png;base64," + base64.b64encode(output.getvalue()).decode(), "model": MODEL, "inferenceMs": elapsed})
            except Exception as error:
                # Never log private images or exception text that may include request data.
                print("Inference failed:", type(error).__name__, flush=True)
                self.respond(500, {"error": "Inference failed"})
            finally:
                lock.release()

    print(f"{MODEL} ready at http://127.0.0.1:{args.port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
