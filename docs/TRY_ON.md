# Photo try-on, video and 3D avatars

**Shopping → Scene studio → Photo try-on** accepts a fully clothed person photo and a garment photo. The browser previews both, resizes them to a maximum 1,600-pixel edge and re-encodes JPEG without the original metadata. Choose tops, bottoms or one-pieces, then a flat-lay or model-worn garment image. Photos are held only in page memory; nothing is sent until **Create try-on image**. The app and included worker do not save photos to disk. Save an output explicitly if wanted.

The adapter calls a separately deployed **FASHN VTON 1.5** worker. When the worker is absent, generation is disabled and the page links to the [official demo](https://huggingface.co/spaces/fashn-ai/fashn-vton-1.5). A demo link is not an embedded or guaranteed-free inference service. No fallback image, mannequin recoloring or fabricated inference timing is shown as an AI result.

## Run your worker

Use a CUDA GPU host. The [official model card](https://huggingface.co/fashn-ai/fashn-vton-1.5) reports approximately 8 GB VRAM and about five seconds on an H100; these are upstream figures, **not measurements from this project**. Apple Silicon unified memory is not CUDA VRAM. This worker refuses to start without CUDA; starting the web app downloads no models.

Follow the [upstream installation guide](https://github.com/fashn-AI/fashn-vton-1.5) in a dedicated environment:

```bash
git clone https://github.com/fashn-AI/fashn-vton-1.5.git
cd fashn-vton-1.5
python -m venv .venv
source .venv/bin/activate
pip install -e .
python scripts/download_weights.py --weights-dir ./weights
```

Then, using that environment, run this repository's worker with absolute paths:

```bash
python /path/to/agentic-jev/local/tryon_serve.py --weights-dir /path/to/fashn-vton-1.5/weights
```

The worker binds only to `127.0.0.1:8789`. Initialization loads the real model; the human-parser dependency may download additional weights on first use. It reports ready only after initialization. Click **Check try-on connection** in the app. To change the local port, set `TRYON_BASE_URL=http://127.0.0.1:PORT` in `.env` and restart Node.

For a GPU machine you control, forward the worker without exposing its port publicly:

```bash
ssh -N -L 8789:127.0.0.1:8789 user@gpu-host
```

Clicking Generate then sends photos through that tunnel to **your GPU host**. Its operator and any added storage are under your control. The adapter accepts loopback HTTP only, rejecting remote URLs, credentials in URLs and redirects. Self-hosting needs no third-party paid inference key; GPU infrastructure and electricity still have costs.

## Interface and validation

- `GET /api/tryon/status` checks `/health` with a 1.5-second deadline and verifies model identity.
- `POST /api/tryon/run` validates image data and categories, then calls worker `/try-on` with a 120-second deadline.
- Normalized images accept JPG, PNG and WebP, max 4 MB each; the worker also limits decoded dimensions.
- One worker job runs at a time. A Node timeout does not cancel a running GPU job; retries can return busy until it finishes.
- Outputs require image data, the expected model identity and a measured inference time. Inference and server round-trip times are distinct; neither is a Jev ranking benchmark.

Tests exercise adapter contracts, validation, disconnected workers and failures with fixtures. **Actual GPU inference has not been run in this development environment.** Upstream installation, hardware compatibility and output quality still need validation on the intended GPU host.

## Licenses and realistic alternatives

| Project                                                                 | Supplies                                                  | Boundary                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [FASHN VTON 1.5](https://github.com/fashn-AI/fashn-vton-1.5)            | Person + garment → try-on photo                           | Main code/model: Apache 2.0. Default [human parser](https://github.com/fashn-AI/fashn-human-parser#license) inherits the [SegFormer NVIDIA license](https://github.com/NVlabs/SegFormer/blob/master/LICENSE), which limits use to noncommercial research/evaluation. The full default pipeline is not automatically cleared for commercial use. |
| [CatVTON](https://github.com/Zheng-Chong/CatVTON)                       | Photo try-on                                              | Code, checkpoints and demo: CC BY-NC-SA 4.0, noncommercial.                                                                                                                                                                                                                                                                                     |
| [CatV2TON](https://github.com/Zheng-Chong/CatV2TON)                     | Image/video garment transfer                              | CC BY-NC-SA 4.0. Offline video inference is not a real-time webcam guarantee.                                                                                                                                                                                                                                                                   |
| [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) | 115 textured rigged avatars, including clothed characters | Avatar library updated to MIT in 2020. Ecommerce photos do not automatically become fitted clothing meshes.                                                                                                                                                                                                                                     |
| [LHM](https://github.com/aigc3d/LHM)                                    | Animatable human reconstruction from photos               | Apache 2.0 project; check checkpoints, body-model and other dependencies separately. Requires a GPU workflow.                                                                                                                                                                                                                                   |

The default interface no longer renders a mannequin. Video and 3D projects above are references, not installed integrations. No camera, microphone, streaming try-on or body reconstruction is currently enabled. Jev can choose clothes; another image/video/3D system creates the visual result. A choice score is not fit accuracy.

Sources checked 2026-09-20. The Drape social-media screenshot alone does not identify a verified public repository or its rendering provider.
