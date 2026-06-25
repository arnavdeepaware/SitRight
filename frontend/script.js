import { PoseLandmarker, FilesetResolver, DrawingUtils } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

// DOM Elements
const startButton = document.getElementById('start-btn');
const stopButton = document.getElementById('stop-btn');
const toggleReminderButton = document.getElementById('toggle-reminder-btn');
const reminderSettings = document.getElementById('reminder-settings');
const thresholdSlider = document.getElementById('threshold-slider');
const thresholdValue = document.getElementById('threshold-value');
const saveReminderSettingsButton = document.getElementById('save-reminder-settings');
const scoreDisplay = document.getElementById('score-display');
const notification = document.getElementById('notification');
const soundNotificationCheckbox = document.getElementById('sound-notification');
const canvas = document.getElementById('webcam-canvas');
const webcamBox = document.getElementById('webcam-box');
const ctx = canvas.getContext('2d');

// App state
let poseLandmarker = null;
let isMonitoring = false;
let lastInferenceTime = 0;
const INFERENCE_INTERVAL = 100; // ~10 FPS
let sessionData = [];
let currentScore = 0;
let remindersEnabled = false;
let scoreThreshold = 70;
let lastReminderTime = 0;
const REMINDER_COOLDOWN = 30000;
let videoStream = null;
let videoInterval = null;
let scoreChart = null;

// Audio context for alert beep
let audioCtx = null;

function playAlertBeep() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.frequency.value = 440;
        gain.gain.value = 0.3;
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
        // Audio not supported or blocked
    }
}

// Session state management
function saveSessionState(data, shouldShow = false) {
    localStorage.setItem('lastSessionData', JSON.stringify(data));
    localStorage.setItem('sessionTimestamp', Date.now().toString());
    if (shouldShow) {
        localStorage.setItem('showGraph', 'true');
    }
}

function clearSessionState() {
    localStorage.removeItem('lastSessionData');
    localStorage.removeItem('sessionTimestamp');
    localStorage.removeItem('showGraph');

    const popup = document.getElementById('graphPopup');
    if (popup) {
        popup.style.display = 'none';
    }

    if (scoreChart) {
        scoreChart.destroy();
        scoreChart = null;
    }
}

// Initialize canvas size
function initCanvas() {
    canvas.width = 640;
    canvas.height = 480;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText('Camera feed will appear here', canvas.width / 2, canvas.height / 2);
}

// Initialize PoseLandmarker
async function initPoseLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
            delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1
    });
}

// Update model status indicator
function updateModelStatus(state) {
    const indicator = document.getElementById('model-status-indicator');
    const text = document.getElementById('model-status-text');

    // Remove all status classes
    indicator.classList.remove('status-connected', 'status-disconnected', 'status-loading');

    switch (state) {
        case 'idle':
            indicator.classList.add('status-disconnected');
            indicator.style.backgroundColor = '#6b7280';
            indicator.style.boxShadow = 'none';
            text.textContent = 'Click Start to begin';
            break;
        case 'loading':
            indicator.classList.add('status-loading');
            indicator.style.backgroundColor = '';
            indicator.style.boxShadow = '';
            text.textContent = 'Loading AI model...';
            break;
        case 'ready':
            indicator.classList.add('status-connected');
            indicator.style.backgroundColor = '';
            indicator.style.boxShadow = '';
            text.textContent = 'Running locally';
            break;
        case 'error':
            indicator.classList.add('status-disconnected');
            indicator.style.backgroundColor = '';
            indicator.style.boxShadow = '';
            text.textContent = 'Model failed to load';
            break;
    }
}

// Draw skeleton overlay on canvas
function drawSkeleton(landmarks) {
    const cvs = document.getElementById('webcam-canvas');
    const context = cvs.getContext('2d');
    const video = document.getElementById('webcam-video');
    context.drawImage(video, 0, 0, cvs.width, cvs.height);
    const drawingUtils = new DrawingUtils(context);
    drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: '#FFFFFF', lineWidth: 2 });
    drawingUtils.drawLandmarks(landmarks, { radius: 3, color: '#8b5cf6', fillColor: '#8b5cf6' });
}

// Inference loop using requestAnimationFrame
function inferenceLoop(timestamp) {
    if (!isMonitoring) return;

    const video = document.getElementById('webcam-video');

    if (timestamp - lastInferenceTime >= INFERENCE_INTERVAL) {
        lastInferenceTime = timestamp;

        if (video.readyState >= 2) {
            const result = poseLandmarker.detectForVideo(video, timestamp);

            if (result.landmarks && result.landmarks.length > 0) {
                const landmarks = result.landmarks[0];
                const features = extractFeatures(landmarks, video.videoWidth, video.videoHeight);
                const score = predictPosture(features);
                checkPosture(score);
                sessionData.push({
                    timestamp: new Date().toLocaleTimeString(),
                    score: score
                });
                drawSkeleton(landmarks);
            } else {
                // No landmarks detected, just draw raw video
                const cvs = document.getElementById('webcam-canvas');
                const context = cvs.getContext('2d');
                context.drawImage(video, 0, 0, cvs.width, cvs.height);
            }
        }
    }

    requestAnimationFrame(inferenceLoop);
}

// Initialize app
function init() {
    initCanvas();

    startButton.addEventListener('click', startMonitoring);
    stopButton.addEventListener('click', stopMonitoring);
    toggleReminderButton.addEventListener('click', toggleReminderSettings);
    saveReminderSettingsButton.addEventListener('click', saveReminderSettings);

    thresholdSlider.addEventListener('input', () => {
        thresholdValue.textContent = thresholdSlider.value;
    });

    updateModelStatus('idle');

    const popup = document.getElementById('graphPopup');
    popup.addEventListener('click', function (e) {
        if (e.target === popup) {
            popup.style.display = 'none';
            if (scoreChart) {
                scoreChart.destroy();
            }
        }
    });

    // Restore session graph if page was reloaded right after stopping
    const savedData = localStorage.getItem('lastSessionData');
    if (savedData && localStorage.getItem('showGraph')) {
        try {
            const data = JSON.parse(savedData);
            if (data) {
                showSessionGraph(data);
                localStorage.removeItem('showGraph');
            }
        } catch (error) {
            console.error("Error loading saved session data:", error);
        }
    }
}

// Start posture monitoring
async function startMonitoring() {
    if (isMonitoring) return;

    const webcamReady = await setupWebcam();
    if (!webcamReady) return;

    updateModelStatus('loading');
    if (!poseLandmarker) {
        try {
            await initPoseLandmarker();
        } catch (e) {
            console.error('Failed to load pose model:', e);
            updateModelStatus('error');
            return;
        }
    }
    updateModelStatus('ready');

    isMonitoring = true;
    sessionData = [];
    document.getElementById('start-btn').disabled = true;
    document.getElementById('stop-btn').disabled = false;
    document.getElementById('webcam-box').classList.add('monitoring-active');

    lastInferenceTime = 0;
    requestAnimationFrame(inferenceLoop);
}

// Stop posture monitoring
function stopMonitoring() {
    if (!isMonitoring) return;
    isMonitoring = false; // this stops the rAF loop

    document.getElementById('start-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
    document.getElementById('webcam-box').classList.remove('monitoring-active');
    updateModelStatus('idle');

    if (sessionData.length > 0) {
        saveSessionState(sessionData, true);
        showSessionGraph(sessionData);
    }
    stopVideoProcessing();
}

// Toggle reminder settings panel
function toggleReminderSettings() {
    if (reminderSettings.style.display === 'none') {
        reminderSettings.style.display = 'block';
    } else {
        reminderSettings.style.display = 'none';
    }
}

// Save reminder settings
function saveReminderSettings() {
    scoreThreshold = parseInt(thresholdSlider.value);
    remindersEnabled = true;
    reminderSettings.style.display = 'none';
    toggleReminderButton.classList.add('active');

    showNotification("Settings saved");
}

// Show notification
function showNotification(message, isError = false) {
    notification.textContent = message;
    notification.style.display = 'block';
    notification.style.background = isError
        ? 'rgba(239, 68, 68, 0.9)'
        : 'rgba(139, 92, 246, 0.9)';

    setTimeout(() => {
        notification.style.display = 'none';
    }, isError ? 5000 : 3000);
}

// Update checkPosture function
function checkPosture(score) {
    currentScore = score;
    scoreDisplay.textContent = score;
    const threshold = parseInt(thresholdSlider.value);
    const progressCircle = document.querySelector('.score-ring-progress');
    const circumference = 2 * Math.PI * 45;

    const offset = circumference - (score / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;

    if (score >= (threshold + 5)) {
        progressCircle.style.stroke = '#10b981';
        webcamBox.classList.remove('bad-posture', 'warning-posture');
        webcamBox.classList.add('good-posture');
    } else if (score >= (threshold - 5)) {
        progressCircle.style.stroke = '#fbbf24';
        webcamBox.classList.remove('bad-posture', 'good-posture');
        webcamBox.classList.add('warning-posture');
    } else {
        progressCircle.style.stroke = '#ef4444';
        webcamBox.classList.remove('good-posture', 'warning-posture');
        webcamBox.classList.add('bad-posture');

        if (remindersEnabled && soundNotificationCheckbox.checked) {
            const now = Date.now();
            if (now - lastReminderTime > REMINDER_COOLDOWN) {
                lastReminderTime = now;
                playAlertBeep();
            }
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Handle window resize
window.addEventListener('resize', initCanvas);

async function setupWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        });
        const video = document.getElementById('webcam-video');
        video.srcObject = stream;
        await video.play();
        videoStream = stream;
        return true;
    } catch (err) {
        console.error("Error accessing webcam:", err);
        if (err.name === 'NotAllowedError') {
            showNotification("Camera access denied. Please allow camera access in your browser settings.", true);
        } else if (err.name === 'NotFoundError') {
            showNotification("No camera found. Please connect a webcam.", true);
        } else if (err.name === 'NotReadableError') {
            showNotification("Camera is in use by another application.", true);
        } else {
            showNotification("Could not access webcam: " + err.message, true);
        }
        return false;
    }
}

function stopVideoProcessing() {
    if (videoInterval) {
        clearInterval(videoInterval);
        videoInterval = null;
    }
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
}

function showSessionGraph(data) {
    const popup = document.getElementById('graphPopup');
    const graphCanvas = document.getElementById('popupScoreChart');
    const closeBtn = document.getElementById('closePopup');

    if (!data || data.length === 0) {
        console.error('No session data available');
        return;
    }

    const averageScore = Math.round(
        data.reduce((sum, d) => sum + d.score, 0) / data.length
    );

    try {
        if (scoreChart) {
            scoreChart.destroy();
        }

        popup.style.display = 'flex';

        closeBtn.onclick = function () {
            popup.style.display = 'none';
            if (scoreChart) {
                scoreChart.destroy();
            }
            clearSessionState();
        };

        popup.onclick = function (e) {
            if (e.target === popup) {
                popup.style.display = 'none';
                if (scoreChart) {
                    scoreChart.destroy();
                }
                clearSessionState();
            }
        };

        const chartCtx = graphCanvas.getContext('2d');
        scoreChart = new Chart(chartCtx, {
            type: 'line',
            data: {
                labels: data.map(d => d.timestamp),
                datasets: [{
                    label: 'Posture Score',
                    data: data.map(d => d.score),
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Average Score',
                    data: Array(data.length).fill(averageScore),
                    borderColor: '#10b981',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#f8fafc',
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    title: {
                        display: true,
                        text: `Session Average: ${averageScore}%`,
                        color: '#f8fafc',
                        padding: {
                            top: 10,
                            bottom: 30
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: { display: false },
                        ticks: { color: '#cbd5e1' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#cbd5e1',
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });

        const exportButton = document.getElementById('exportButton');
        exportButton.onclick = function () {
            exportSessionData(data);
        };

    } catch (error) {
        console.error('Error creating chart:', error);
    }
}

function exportSessionData(data) {
    const csvRows = [];
    csvRows.push(['Timestamp', 'Score']);

    data.forEach(row => {
        csvRows.push([row.timestamp, row.score]);
    });

    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const fileName = `posture_session_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.csv`;

    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
