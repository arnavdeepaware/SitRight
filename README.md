# SitRight

**Real-time AI posture detection that runs entirely in your browser — no server, no data leaves your device.**

SitRight monitors your sitting posture through your webcam and delivers instant visual and audio feedback. MediaPipe JS detects body landmarks directly in the browser, and a custom neural network (trained from scratch, no AutoML) scores your posture in real time. All inference runs client-side via WebGL — the webcam feed never touches a network. Deploy it as a static site for free.

This project started at a hackathon with a server-side Python architecture, then evolved through production profiling and iterative redesign into a fully client-side system. The [architecture history](#previous-architecture-v1--server-side-inference) below documents that journey.

![SitRight](frontend/assets/SIT%20RIGHT.png)

---

## Motivation

The average person spends over 6 hours daily in front of screens. Chronic poor posture during desk work is a leading contributor to neck and lower back pain in young adults. SitRight was built to be a frictionless, privacy-respecting tool — no app install, no account, no data leaving your machine — that makes posture awareness as passive as possible.

---

## What It Does

1. Captures your webcam feed at ~10 FPS
2. Runs **MediaPipe Pose Landmarker** (JS, WebGL-accelerated) to extract body landmarks
3. Engineers **7 geometric features** (joint angles, distances, ratios) from those landmarks
4. Passes features through a **custom neural network** (929 parameters, plain JS forward pass) to produce a posture score (0-100)
5. Displays a color-coded score with an annotated skeleton overlay on the live canvas

All processing happens locally. No network requests during inference.

---

## Architecture

```
Browser (all processing local)
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  getUserMedia()                                              │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────────────┐                                    │
│  │ MediaPipe Pose       │  WebGL-accelerated                 │
│  │ Landmark Detection   │  landmark extraction               │
│  └──────────┬───────────┘                                    │
│             │                                                │
│             ▼                                                │
│  ┌──────────────────────┐                                    │
│  │ Feature Engineering  │  7 geometric features              │
│  │ (angles, distances,  │  (JS implementation)               │
│  │  ratios)             │                                    │
│  └──────────┬───────────┘                                    │
│             │                                                │
│             ▼                                                │
│  ┌──────────────────────┐                                    │
│  │ Neural Network       │  929 params, 4 dense layers        │
│  │ Forward Pass (JS)    │  weights hardcoded in JS           │
│  │ MinMax scaled input  │  <50ms per frame                   │
│  └──────────┬───────────┘                                    │
│             │                                                │
│             ▼                                                │
│  Canvas skeleton overlay + Score widget + Chart.js analytics │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## ML Pipeline

The model is not a wrapper around a pre-existing posture API. Every layer was designed and built manually:

**Feature Engineering** — Rather than feeding raw pixel data or all landmarks into a model (which would require far more training data and compute), 7 semantically meaningful features are extracted:

| Feature | Captures |
|---------|---------|
| `dist_nose_shoulders` | How far forward the head is relative to the torso |
| `ratio_nose_shoulders` | Scale-invariant head forward tilt |
| `neck_tilt_angle` | Lateral neck angle using ear-nose-ear geometry |
| `dist_left_ear_nose` | Asymmetry in head position |
| `dist_right_ear_nose` | Asymmetry in head position |
| `angle_left_shoulder` | Shoulder roll relative to head |
| `angle_right_shoulder` | Shoulder roll relative to head |

**Model Architecture** — A 4-layer fully-connected network with ReLU activations and a sigmoid output. 929 total parameters. Binary cross-entropy loss with label normalization (raw 0-100 scores mapped to 0.0-1.0 for training). Weights are exported and hardcoded directly into the JavaScript inference file — no model-loading step, no external weight files.

**Training** — 5-fold cross-validation with a cyclic learning rate scheduler (low: 0.0001, high: 0.01) to escape local minima. The final model is retrained on the full dataset after CV confirms generalization. The training pipeline lives in `ml/` and runs offline in Python.

---

## Features

- Real-time posture scoring at ~10 FPS
- Color-coded feedback: green (good) / yellow (warning) / red (poor)
- Skeleton overlay drawn on the live webcam canvas
- Configurable score threshold with audio alerts via Web Audio API
- Session analytics with interactive Chart.js line graph
- CSV export of session data
- Complete privacy — webcam feed never leaves the device

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | HTML5, CSS3, JavaScript (ES Modules), Chart.js | No framework overhead; runs anywhere with a browser |
| ML — Browser | MediaPipe Tasks-Vision JS (pose detection), Custom Dense Neural Network (929 params, 4 layers, plain JS forward pass) | Real-time inference without server round-trip; WebGL acceleration |
| ML — Training | Python, TensorFlow/Keras, scikit-learn, MediaPipe Python | Offline training pipeline in `ml/`; model weights exported to JS |
| Deployment | Any static hosting (GitHub Pages, Netlify, Vercel) | No server required — zero cost, zero maintenance |

---

## Quick Start

### Use the App

Open the deployed URL in any modern browser with a webcam:

**Live:** `https://sitright-zz9r.onrender.com`

Or serve it locally:

```bash
cd SitRight/frontend
python3 -m http.server 8080
# Open http://localhost:8080
```

### Developer Setup

```bash
git clone https://github.com/arnavdeepaware/SitRight.git
cd SitRight/frontend
python3 -m http.server 8080
# Open http://localhost:8080 in a browser with camera access
```

> **Note:** The `ml/` directory contains the Python training pipeline for retraining the model. See `ml/sequential.py` for the training script and `ml/Predictor.py` for feature engineering. Retraining requires Python 3.11, TensorFlow, and MediaPipe Python.

---

## Project Structure

```
SitRight/
├── frontend/
│   ├── index.html            # Main app (webcam, score, chart)
│   ├── landing.html          # Landing page
│   ├── script.js             # Video pipeline, MediaPipe integration, charts
│   ├── posture-model.js      # Neural network weights + forward pass (browser inference)
│   ├── styles.css / landing.css
│   └── assets/
├── backend/                  # v1 server-side architecture (retained for reference)
│   ├── websocket_server.py   # aiohttp server: HTTP + WebSocket on one port
│   ├── pose_detector.py      # MediaPipe landmark extraction (Python)
│   └── requirements.txt
├── ml/
│   ├── Predictor.py          # Feature engineering + model inference
│   ├── sequential.py         # Model training (K-fold CV, cyclic LR)
│   └── model/
│       ├── posture_model.h5  # Trained Keras model
│       └── scaler.pkl        # MinMaxScaler fitted on training data
├── Dockerfile                # v1 deployment (retained for reference)
├── docker-compose.yml
└── .env.example
```

---

## Deployment

### Current: Client-Side Inference (v2)

The entire application is static files. Deploy the `frontend/` directory to any static hosting provider:

**GitHub Pages**
```bash
# Push to a gh-pages branch, or configure Pages to serve from frontend/
```

**Netlify / Vercel**
```
Build command: (none)
Publish directory: frontend/
```

No environment variables, no build step, no server process. The app loads MediaPipe from a CDN and runs all inference in the browser.

#### Why Client-Side?

The migration from server-side to browser-side inference was motivated by production data from v1:

| Metric | v1 (Server) | v2 (Browser) |
|--------|-------------|--------------|
| Inference latency | ~400-600ms (including network) | <50ms |
| Hosting cost | $7+/month (Render Starter) | Free (static hosting) |
| Privacy | Frames sent to server | Frames never leave device |
| Concurrent users | 1 (MediaPipe not thread-safe) | Unlimited (each user runs locally) |
| Deployment complexity | Docker + process management | Upload static files |

**Model details:** 929 parameters across 4 dense layers. 7 input features, MinMax-scaled, with weights hardcoded directly in `posture-model.js`. The forward pass is a plain JS matrix multiply — no ML framework loaded at runtime. MediaPipe JS handles pose detection with WebGL GPU acceleration.

#### Observed Performance (v2 — Local Inference)

The following metrics were captured during local testing after migration:

| Metric | Observed Value |
|--------|---------------|
| Per-frame inference latency | <50ms (vs ~500ms round-trip in v1) |
| MediaPipe pose detection (WebGL) | ~20-35ms |
| Neural network forward pass (plain JS) | <1ms |
| Effective frame rate | ~10 FPS (throttled via `requestAnimationFrame`) |
| First-load time (MediaPipe model download) | ~2-5 seconds (CDN, cached after first run) |
| Subsequent load time | <500ms (browser cache) |
| Lag accumulation over session | None — no buffer to fill |

#### Implementation Challenges

1. **Coordinate normalization mismatch (silent wrong output)** — The Python training pipeline had a non-obvious coordinate transform: MediaPipe returns landmarks in normalized [0,1] space, `pose_detector.py` multiplied them by frame pixel dimensions to get pixel coordinates, then `Predictor.py` divided by a hardcoded `video_width=100, video_height=100` — not the actual frame dimensions. This means the model was trained on features computed from coordinates in roughly the 0–6.4 range, not [0,1]. Porting this incorrectly would produce wrong scores with no error or warning. Catching it required tracing the full data path from MediaPipe output to model input and running the JS implementation against a known Python test case (`score: 88`) before any other code was written.

2. **Model architecture undocumented in source** — The training script (`ml/sequential.py`) and original README both described a 5-layer network (32→16→8→4→1). The actual saved `.h5` was a 4-layer network (32→16→8→1). These differ by one layer and ~36 parameters. The discrepancy was caught by extracting and counting weights from the file directly. The `.h5` is ground truth; comments and docs were wrong.

3. **ES module vs. global scope** — MediaPipe JS requires `import` syntax, which forces `script.js` to be a `type="module"` file. Modules have their own scope — globals declared in one module aren't automatically visible in another. But `posture-model.js` (loaded as a plain `<script>` before the module) needs to expose `extractFeatures()` and `predictPosture()` to `script.js`. The fix was intentional: load `posture-model.js` as a regular script (attaches to `window`), then load `script.js` as a module. Both files share the global scope, which is the correct behavior here since `posture-model.js` is effectively a statically-linked dependency with no imports of its own.

4. **Weight portability tradeoff** — Hardcoding 929 parameters directly in JS eliminates a model-loading step and removes any runtime dependency on TensorFlow.js or ONNX. The tradeoff is that retraining the model requires re-extracting the weights and updating `posture-model.js`. At this model size that's a 30-second Python script, not a real concern — but it's the wrong pattern for a model that changes frequently.

#### What v2 Taught Me

The migration confirmed that the bottleneck in v1 was never compute — it was the network. Moving 640×480 JPEG frames from a browser to a cloud VM and back at 10 FPS generates ~1.2MB/s of traffic and adds 80-150ms of irreducible latency regardless of how fast the server processes the frame. On local hardware, the same inference took ~30ms end-to-end. That 16× difference is purely architectural.

The more transferable lesson: model size determines what deployment options are viable. At 929 parameters (3.6KB of weights), this model can be hardcoded in JavaScript, hosted on a CDN, and run in a browser tab. At 50MB, it becomes a file to download. At 500MB, it needs a server. Choosing the right model size for the deployment target is a design decision, not just a training one.

---

### Previous Architecture (v1) — Server-Side Inference

The original architecture used a Python backend running MediaPipe and TensorFlow on a cloud server. The browser captured webcam frames, Base64-encoded them, sent them over WebSocket to the server, which ran inference and returned annotated frames with posture scores.

This section documents what was learned from deploying v1 in production. These findings directly motivated the migration to v2.

```
Browser                                Server (Python / aiohttp)
┌──────────────────────┐  WebSocket   ┌───────────────────────────────┐
│  getUserMedia()       │─────────────▶│  Frame Handler                │
│  Canvas (640×480)     │  base64 JPEG │                               │
│  Score Widget         │              │  ┌─────────────────────────┐  │
│  Chart.js Analytics   │◀─────────────│  │ MediaPipe Pose          │  │
└──────────────────────┘  score +      │  │ 26 landmark extraction  │  │
                          ann. frame   │  └────────────┬────────────┘  │
                                       │               │               │
                                       │  ┌────────────▼────────────┐  │
                                       │  │ Feature Engineering     │  │
                                       │  │ 7 geometric features    │  │
                                       │  │ (angles, distances,     │  │
                                       │  │  ratios)                │  │
                                       │  └────────────┬────────────┘  │
                                       │               │               │
                                       │  ┌────────────▼────────────┐  │
                                       │  │ Keras Classifier        │  │
                                       │  │ 32→16→8→4→1 neurons     │  │
                                       │  │ MinMax scaled input     │  │
                                       │  └─────────────────────────┘  │
                                       └───────────────────────────────┘
```

#### Measured Performance (Render Starter tier)

The following metrics were captured from production logs during a live session:

| Metric | Observed Value |
|--------|---------------|
| TensorFlow inference per frame | ~97-105ms |
| Total `model.predict()` call time | ~195-200ms |
| Estimated network round trip (US East) | ~80-150ms |
| Effective server-side frame rate | ~1.5-2 FPS |
| End-to-end perceived latency | ~400-600ms |

#### Identified Bottlenecks

1. **`model.predict()` overhead (~2x inference cost)** — Keras's `model.predict()` is designed for batched dataset evaluation. On each single-sample inference call it allocates a result accumulator, runs progress callbacks, and renders a progress bar, doubling the actual compute time. This was caught by reading the production logs and noticing the two timing values Keras prints. The fix was replacing `model.predict(x)` with `model(x, training=False).numpy()` — a direct forward pass with no batch infrastructure overhead.

2. **Network round-trip is irreducible at this tier** — Each webcam frame travels from the user's browser to Render's US datacenter and back. Even with minimal processing, this adds 80-150ms per frame that does not exist in local execution. Combined with inference time, the server cannot keep up with the 10 FPS the client sends, causing frames to queue in the WebSocket buffer and lag to compound over time.

3. **RAM ceiling on free tier** — TensorFlow + MediaPipe together consume ~450-510MB at runtime. Render's free tier allocates 512MB, leaving virtually no headroom. The container was prone to OOM kills during inference spikes. Upgrading to the Starter tier (768MB) resolved stability.

4. **Protobuf deprecation warnings at inference frequency** — `drawing_styles.get_default_pose_landmarks_style()` internally calls `SymbolDatabase.GetPrototype()`, a deprecated protobuf API. This fires on every frame and cannot be suppressed without patching the mediapipe internals or upgrading to a version that removed the `solutions` API entirely (which breaks the rest of the codebase). This is a dependency version trap: mediapipe >= 0.10.15 removes `solutions`, but earlier versions carry this warning.

#### Architecture Tradeoffs — What v1 Taught Me

The server-side inference architecture made sense during the hackathon: Python has the most mature MediaPipe and TensorFlow tooling, the model was already in Keras `.h5` format, and getting a working demo deployed quickly was the priority.

In production, the core problem was structural: sending raw video frames over a network to run inference and send annotated frames back is doing three expensive operations (encode, transmit, transmit back) that add latency before the user sees any result. On hardware I control (my laptop), total frame processing was ~30ms. On a shared cloud CPU behind a network, it was ~500ms. The gap is not a hosting tier problem — it's an architectural one.

This analysis led directly to v2: move inference to the browser, eliminate the network entirely, and deploy as a static site. The model is small enough (929 parameters) that a plain JS forward pass is faster than even the Python inference was on local hardware.

---

## Known Limitations

- **HTTPS required in production** — browsers block `getUserMedia` on non-secure origins
- **Lighting sensitivity** — MediaPipe landmark confidence degrades in low light or with glasses/hats occluding the face
- **Fixed camera angle assumption** — the model was trained on front-facing webcam data; steep angles (looking down at a laptop) reduce accuracy

---

## License

MIT
