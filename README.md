# SitRight

**AI-powered real-time posture detection using your webcam.**

SitRight monitors your sitting posture while you work, providing instant visual and audio feedback to help you maintain a healthy spine. All processing happens locally — your webcam feed never leaves your machine.

![SitRight](frontend/assets/SIT%20RIGHT.png)

## Features

- **Real-time posture detection** at 10 FPS via webcam
- **AI-powered scoring** using a custom TensorFlow neural network trained on posture landmarks
- **Color-coded feedback** — green (good), yellow (warning), red (poor posture)
- **Audio alerts** when posture drops below your configured threshold
- **Session analytics** with interactive Chart.js graphs showing posture trends over time
- **Customizable threshold** — adjust sensitivity to match your preference
- **CSV export** — download session data for offline analysis
- **Privacy-first** — all ML inference runs locally, no data sent to external servers

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript, Chart.js |
| Backend | Python, aiohttp (HTTP + WebSocket) |
| ML/CV | MediaPipe Pose, TensorFlow/Keras, scikit-learn |
| Deployment | Docker |

## Architecture

```
Browser                          Server (Python)
┌─────────────┐    WebSocket    ┌──────────────────┐
│ Webcam Feed  │───────────────▶│ aiohttp Server   │
│ (getUserMedia)│   base64 JPEG  │                  │
│              │                │ ┌──────────────┐  │
│ Canvas +     │◀───────────────│ │ MediaPipe    │  │
│ Score Widget │  score + frame │ │ Pose Detection│  │
│ Chart.js     │                │ └──────┬───────┘  │
└─────────────┘                │        │          │
                               │ ┌──────▼───────┐  │
                               │ │ TensorFlow   │  │
                               │ │ Classifier   │  │
                               │ │ (7 features) │  │
                               │ └──────────────┘  │
                               └──────────────────┘
```

1. Browser captures webcam frames and sends them as base64-encoded JPEGs over WebSocket
2. Server runs MediaPipe Pose to extract 26 body landmarks
3. 7 engineered features (distances, angles, ratios) are computed from the landmarks
4. A trained Keras neural network classifies posture quality (0-100% score)
5. Annotated frame + score are sent back to the browser for display

## Quick Start

### Option A: Docker (recommended)

```bash
git clone https://github.com/arnavdeepaware/SitRight.git
cd SitRight
docker compose up --build
```

Open [http://localhost:8765](http://localhost:8765) in your browser.

### Option B: Local Python

```bash
git clone https://github.com/arnavdeepaware/SitRight.git
cd SitRight/backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server
python websocket_server.py
```

Open [http://localhost:8765](http://localhost:8765) in your browser.

## Project Structure

```
SitRight/
├── frontend/
│   ├── index.html          # Main app interface
│   ├── landing.html        # Landing page
│   ├── script.js           # App logic, WebSocket client, charts
│   ├── styles.css          # App styles (dark theme)
│   ├── landing.css         # Landing page styles
│   └── assets/             # Images
├── backend/
│   ├── websocket_server.py # HTTP + WebSocket server (aiohttp)
│   ├── pose_detector.py    # MediaPipe landmark extraction
│   ├── requirements.txt    # Python dependencies
│   └── Procfile            # Deployment process file
├── ml/
│   ├── Predictor.py        # Feature engineering + model inference
│   ├── sequential.py       # Model training script
│   └── model/
│       ├── posture_model.h5  # Trained Keras model
│       └── scaler.pkl        # Feature scaler
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Deployment

SitRight is designed for single-container deployment. The aiohttp server serves both the static frontend and the WebSocket API on a single port.

### Render

1. Push your repo to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. Connect your repository
4. Render auto-detects the `Dockerfile`
5. Set environment variable `PORT` (Render provides this automatically)
6. Deploy

> **Note:** The free tier has 512MB RAM. TensorFlow + MediaPipe need ~512MB at runtime, so a paid tier (768MB+) is recommended for reliable performance.

### Railway / Fly.io

Both platforms support Dockerfile-based deployments with similar setup. Push your repo, connect it, and deploy.

> **Important:** Deployed versions require HTTPS for webcam access (`getUserMedia` is blocked on insecure origins). Render, Railway, and Fly.io all provide HTTPS by default.

## Known Limitations

- **Single user per server instance** — MediaPipe Pose is not thread-safe; concurrent WebSocket connections share the same pose detector
- **Requires webcam** — no file upload or video playback mode
- **HTTPS required for deployment** — browsers block `getUserMedia` on HTTP (except localhost)
- **Model size** — TensorFlow + MediaPipe add ~500MB to the Docker image
- **Lighting sensitivity** — pose detection accuracy degrades in low-light conditions

## Future Improvements

- Client-side inference with TensorFlow.js + MediaPipe JS (eliminates backend)
- Multi-user support with per-connection pose detector instances
- Exercise recommendations based on detected posture patterns
- Historical session tracking with persistent storage
- Mobile-responsive webcam interface

## Motivation

People spend an average of 6 hours and 40 minutes daily in front of screens, and 80% of adults experience back pain at some point. Poor posture during long work sessions contributes to chronic spine issues. SitRight was built to provide a simple, privacy-respecting tool that helps you stay aware of your posture while you work.

## License

MIT
