# SitRight

**Real-time AI posture detection — built from the ground up, from data collection to deployment.**

SitRight monitors your sitting posture through your webcam and delivers instant visual and audio feedback. The neural network, training pipeline, and feature engineering were built from scratch without AutoML or pre-trained classifiers. This project was developed for a hackathon and continued beyond it as a system design and deployment learning exercise.

![SitRight](frontend/assets/SIT%20RIGHT.png)

---

## What It Does

1. Captures your webcam feed at 10 FPS
2. Runs **MediaPipe Pose** to extract 26 body landmarks
3. Engineers **7 geometric features** (joint angles, distances, ratios) from those landmarks
4. Passes those features through a **custom Keras neural network** to produce a posture score (0–100)
5. Returns a color-coded score and an annotated skeleton overlay in real time

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | HTML5, Vanilla JS, Chart.js | No framework overhead; fast iteration during hackathon |
| Backend | Python, aiohttp | Single process serves both HTTP and WebSocket on one port |
| Computer Vision | MediaPipe Pose | Accurate 26-landmark detection without a GPU |
| ML | TensorFlow/Keras, scikit-learn | Custom-trained classifier, 5-fold cross-validated |
| Containerization | Docker | Reproducible builds; eliminates dependency hell across environments |

---

## Architecture

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

---

## ML Pipeline

The model is not a wrapper around a pre-existing posture API. Every layer was designed and built manually:

**Feature Engineering** — Rather than feeding raw pixel data or all 26 landmarks into a model (which would require far more training data and compute), 7 semantically meaningful features are extracted:

| Feature | Captures |
|---------|---------|
| `dist_nose_shoulders` | How far forward the head is relative to the torso |
| `ratio_nose_shoulders` | Scale-invariant head forward tilt |
| `neck_tilt_angle` | Lateral neck angle using ear-nose-ear geometry |
| `dist_left_ear_nose` | Asymmetry in head position |
| `dist_right_ear_nose` | Asymmetry in head position |
| `angle_left_shoulder` | Shoulder roll relative to head |
| `angle_right_shoulder` | Shoulder roll relative to head |

**Model Architecture** — A 5-layer fully-connected network (32→16→8→4→1) with ReLU activations and a sigmoid output. Binary cross-entropy loss with label normalization (raw 0–100 scores mapped to 0.0–1.0 for training).

**Training** — 5-fold cross-validation with a cyclic learning rate scheduler (low: 0.0001, high: 0.01) to escape local minima. The final model is retrained on the full dataset after CV confirms generalization.

---

## Features

- Real-time posture scoring at up to 10 FPS
- Color-coded feedback: green (good) / yellow (warning) / red (poor)
- Skeleton overlay drawn on the live webcam canvas
- Configurable score threshold with audio alerts via Web Audio API
- Session analytics with interactive Chart.js line graph
- CSV export of session data
- WebSocket reconnection with exponential backoff (5 attempts)

---

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/arnavdeepaware/SitRight.git
cd SitRight
docker compose up --build
# Open http://localhost:8765
```

### Local Python

```bash
cd SitRight/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python websocket_server.py
# Open http://localhost:8765
```

**Python 3.11 required.** Dependency versions are pinned (`mediapipe==0.10.14`, `tensorflow==2.16.2`) due to a protobuf compatibility constraint between these two libraries. Do not upgrade without testing.

---

## Project Structure

```
SitRight/
├── frontend/
│   ├── index.html            # Main app (webcam, score, chart)
│   ├── landing.html          # Landing page
│   ├── script.js             # WebSocket client, video pipeline, charts
│   ├── styles.css / landing.css
│   └── assets/
├── backend/
│   ├── websocket_server.py   # aiohttp server: HTTP + WebSocket on one port
│   ├── pose_detector.py      # MediaPipe landmark extraction
│   └── requirements.txt
├── ml/
│   ├── Predictor.py          # Feature engineering + model inference
│   ├── sequential.py         # Model training (K-fold CV, cyclic LR)
│   └── model/
│       ├── posture_model.h5  # Trained Keras model
│       └── scaler.pkl        # MinMaxScaler fitted on training data
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Deployment

### Current: Render (Server-Side Inference)

The application is containerized and deployed on Render as a single Docker service. The aiohttp server handles both static file serving and WebSocket connections on one port, which simplified deployment significantly — no reverse proxy or separate static hosting required.

**Live deployment:** `https://sitright-zz9r.onrender.com`

#### Measured Performance (Render Starter tier)

The following metrics were captured from production logs during a live session:

| Metric | Observed Value |
|--------|---------------|
| TensorFlow inference per frame | ~97–105ms |
| Total `model.predict()` call time | ~195–200ms |
| Estimated network round trip (US East) | ~80–150ms |
| Effective server-side frame rate | ~1.5–2 FPS |
| End-to-end perceived latency | ~400–600ms |

**Identified bottlenecks:**

1. **`model.predict()` overhead (~2× inference cost)** — Keras's `model.predict()` is designed for batched dataset evaluation. On each single-sample inference call it allocates a result accumulator, runs progress callbacks, and renders a progress bar, doubling the actual compute time. This was caught by reading the production logs and noticing the two timing values Keras prints. The fix is replacing `model.predict(x)` with `model(x, training=False).numpy()` — a direct forward pass with no batch infrastructure overhead.

2. **Network round-trip is irreducible at this tier** — Each webcam frame travels from the user's browser to Render's US datacenter and back. Even with minimal processing, this adds 80–150ms per frame that does not exist in local execution. Combined with inference time, the server cannot keep up with the 10 FPS the client sends, causing frames to queue in the WebSocket buffer and lag to compound over time.

3. **RAM ceiling on free tier** — TensorFlow + MediaPipe together consume ~450–510MB at runtime. Render's free tier allocates 512MB, leaving virtually no headroom. The container was prone to OOM kills during inference spikes. Upgrading to the Starter tier (768MB) resolved stability.

4. **Protobuf deprecation warnings at inference frequency** — `drawing_styles.get_default_pose_landmarks_style()` internally calls `SymbolDatabase.GetPrototype()`, a deprecated protobuf API. This fires on every frame and cannot be suppressed without patching the mediapipe internals or upgrading to a version that removed the `solutions` API entirely (which breaks the rest of the codebase). This is a dependency version trap: mediapipe ≥ 0.10.15 removes `solutions`, but earlier versions carry this warning.

#### Architecture Tradeoffs — What I Learned

The server-side inference architecture made sense during the hackathon: Python has the most mature MediaPipe and TensorFlow tooling, the model was already in Keras `.h5` format, and getting a working demo deployed quickly was the priority.

In production, the core problem is structural: sending raw video frames over a network to run inference and send annotated frames back is doing three expensive operations (encode, transmit, transmit back) that add latency before the user sees any result. On hardware I control (my laptop), total frame processing is ~30ms. On a shared cloud CPU behind a network, it's ~500ms. The gap is not a hosting tier problem — it's an architectural one.

---

### Next: Client-Side Inference (In Progress)

The planned next iteration migrates all ML inference to the browser using [MediaPipe's JavaScript Pose Landmarker](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker/web_js) and a TensorFlow.js conversion of the trained model. Inference runs on the user's device via WebGL — the network round trip is eliminated entirely. The backend becomes optional (session storage only), and the app can be deployed as a static site on GitHub Pages or Netlify for free with zero latency overhead.

This requires:
- Converting `posture_model.h5` → TensorFlow.js `model.json` format (`tensorflowjs_converter`)
- Reimplementing the 7-feature extraction in JavaScript using the JS landmark format
- Replacing the WebSocket video pipeline with a `requestAnimationFrame` loop reading directly from a `<video>` element

The tradeoff: JavaScript inference is slightly less flexible to iterate on, and the model format conversion adds a step to the training pipeline. But for a real-time webcam application with a small, fast model, running in-browser is the correct architecture.

---

## Known Limitations

- **Single-user per instance** — the MediaPipe `Pose` object is not thread-safe; concurrent WebSocket connections share one detector
- **HTTPS required in production** — browsers block `getUserMedia` on non-secure origins
- **Lighting sensitivity** — MediaPipe landmark confidence degrades in low light or with glasses/hats occluding the face
- **Fixed camera angle assumption** — the model was trained on front-facing webcam data; steep angles (looking down at a laptop) reduce accuracy

---

## Motivation

The average person spends over 6 hours daily in front of screens. Chronic poor posture during desk work is a leading contributor to neck and lower back pain in young adults. SitRight was built to be a frictionless, privacy-respecting tool — no app install, no account, no data leaving your machine — that makes posture awareness as passive as possible.

---

## License

MIT
