import { PoseLandmarker, FilesetResolver, DrawingUtils } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const startButton = document.getElementById('start-btn');
const stopButton = document.getElementById('stop-btn');
const toggleReminderButton = document.getElementById('toggle-reminder-btn');
const reminderSettings = document.getElementById('reminder-settings');
const thresholdSlider = document.getElementById('threshold-slider');
const thresholdValue = document.getElementById('threshold-value');
const saveReminderSettingsButton = document.getElementById('save-reminder-settings');
const scoreDisplay = document.getElementById('score-display');
const scoreHelp = document.getElementById('score-help');
const notification = document.getElementById('notification');
const soundNotificationCheckbox = document.getElementById('sound-notification');
const canvas = document.getElementById('webcam-canvas');
const webcamBox = document.getElementById('webcam-box');
const canvasState = document.getElementById('canvas-state');
const modelStatusIndicator = document.getElementById('model-status-indicator');
const modelStatusText = document.getElementById('model-status-text');
const graphPopup = document.getElementById('graphPopup');
const closePopupButton = document.getElementById('closePopup');
const exportButton = document.getElementById('exportButton');
const sessionSummary = document.getElementById('session-summary');
const sessionSummaryText = document.getElementById('session-summary-text');
const ctx = canvas.getContext('2d');

let poseLandmarker = null;
let isMonitoring = false;
let lastInferenceTime = 0;
let sessionData = [];
let remindersEnabled = false;
let scoreThreshold = 70;
let videoStream = null;
let scoreChart = null;
let lastPoseSeenAt = 0;
let noPoseMessageVisible = false;
let activeSessionForExport = [];
let previousFocus = null;
let audioCtx = null;
let alertBeepTimer = null;
let isBelowThreshold = false;

const INFERENCE_INTERVAL = 100;
const ALERT_BEEP_INTERVAL = 900;
const SCORE_CIRCUMFERENCE = 2 * Math.PI * 45;

function initCanvas(message = 'Camera preview is idle') {
    if (isMonitoring) return;

    canvas.width = 640;
    canvas.height = 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCanvasMessage(message, 'Start monitoring to request camera access and load the local pose model.');
}

function setCanvasMessage(title, detail = '') {
    canvasState.querySelector('strong').textContent = title;
    canvasState.querySelector('span').textContent = detail;
    canvasState.classList.remove('is-hidden');
}

function hideCanvasMessage() {
    canvasState.classList.add('is-hidden');
}

function resetScore() {
    scoreDisplay.textContent = '--';
    scoreHelp.textContent = 'Scores appear once your head and shoulders are visible.';
    const progressCircle = document.querySelector('.score-ring-progress');
    progressCircle.style.strokeDashoffset = SCORE_CIRCUMFERENCE;
    progressCircle.style.stroke = 'var(--accent)';
    webcamBox.classList.remove('good-posture', 'warning-posture', 'bad-posture');
    isBelowThreshold = false;
    stopAlertBeepLoop();
}

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
        gain.gain.value = 0.22;
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.25);
    } catch (error) {
        // Some browsers block audio until the user interacts; posture scoring still works.
    }
}

function startAlertBeepLoop() {
    if (alertBeepTimer || !remindersEnabled || !soundNotificationCheckbox.checked) return;

    playAlertBeep();
    alertBeepTimer = window.setInterval(playAlertBeep, ALERT_BEEP_INTERVAL);
}

function stopAlertBeepLoop() {
    if (!alertBeepTimer) return;

    window.clearInterval(alertBeepTimer);
    alertBeepTimer = null;
}

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
}

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

function updateModelStatus(state, customText) {
    modelStatusIndicator.classList.remove('status-idle', 'status-connected', 'status-disconnected', 'status-loading');

    const states = {
        idle: ['status-idle', 'Ready to start'],
        requesting: ['status-loading', 'Requesting camera access...'],
        loading: ['status-loading', 'Loading local pose model...'],
        ready: ['status-connected', 'Running locally in this browser'],
        noPose: ['status-loading', 'Looking for head and shoulders...'],
        stopped: ['status-idle', 'Session stopped'],
        error: ['status-disconnected', 'Setup needs attention']
    };

    const [className, fallbackText] = states[state] || states.idle;
    modelStatusIndicator.classList.add(className);
    modelStatusText.textContent = customText || fallbackText;
}

function drawSkeleton(landmarks) {
    const video = document.getElementById('webcam-video');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const drawingUtils = new DrawingUtils(ctx);
    drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: '#ffffff', lineWidth: 2 });
    drawingUtils.drawLandmarks(landmarks, { radius: 3, color: '#4f46e5', fillColor: '#4f46e5' });
}

function drawRawVideo() {
    const video = document.getElementById('webcam-video');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
}

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

                lastPoseSeenAt = Date.now();
                noPoseMessageVisible = false;
                hideCanvasMessage();
                checkPosture(score);
                sessionData.push({
                    timestamp: new Date().toLocaleTimeString(),
                    score: score
                });
                drawSkeleton(landmarks);
                updateModelStatus('ready');
            } else {
                drawRawVideo();
                handleNoPoseDetected();
            }
        }
    }

    requestAnimationFrame(inferenceLoop);
}

function handleNoPoseDetected() {
    const now = Date.now();
    if (!noPoseMessageVisible && now - lastPoseSeenAt > 1200) {
        noPoseMessageVisible = true;
        resetScore();
        setCanvasMessage('No pose detected', 'Sit facing the camera with your head and shoulders in view.');
        updateModelStatus('noPose');
    }
}

function init() {
    initCanvas();
    resetScore();

    startButton.addEventListener('click', startMonitoring);
    stopButton.addEventListener('click', stopMonitoring);
    toggleReminderButton.addEventListener('click', toggleReminderSettings);
    saveReminderSettingsButton.addEventListener('click', saveReminderSettings);
    closePopupButton.addEventListener('click', closeSessionGraph);
    exportButton.addEventListener('click', () => exportSessionData(activeSessionForExport));
    soundNotificationCheckbox.addEventListener('change', () => {
        if (!soundNotificationCheckbox.checked) {
            stopAlertBeepLoop();
        } else if (isBelowThreshold) {
            startAlertBeepLoop();
        }
    });

    thresholdSlider.addEventListener('input', () => {
        thresholdValue.textContent = thresholdSlider.value;
    });

    graphPopup.addEventListener('click', (event) => {
        if (event.target === graphPopup) {
            closeSessionGraph();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !graphPopup.hidden) {
            closeSessionGraph();
        }
    });

    window.addEventListener('sitright-theme-change', updateChartTheme);

    restoreSessionGraph();
    updateModelStatus('idle');
}

function restoreSessionGraph() {
    const savedData = localStorage.getItem('lastSessionData');
    if (!savedData || !localStorage.getItem('showGraph')) return;

    try {
        const data = JSON.parse(savedData);
        if (Array.isArray(data) && data.length > 0) {
            showSessionGraph(data);
            localStorage.removeItem('showGraph');
        }
    } catch (error) {
        console.error('Error loading saved session data:', error);
    }
}

async function startMonitoring() {
    if (isMonitoring) return;

    updateModelStatus('requesting');
    setCanvasMessage('Waiting for camera permission', 'Your browser may ask you to allow webcam access for this tab.');

    const webcamReady = await setupWebcam();
    if (!webcamReady) return;

    updateModelStatus('loading');
    setCanvasMessage('Loading local AI model', 'The first load can take a few seconds while MediaPipe downloads.');

    if (!poseLandmarker) {
        try {
            await initPoseLandmarker();
        } catch (error) {
            console.error('Failed to load pose model:', error);
            updateModelStatus('error', 'Model failed to load');
            setCanvasMessage('Model failed to load', 'Check your connection and reload the page to try again.');
            showNotification('The local pose model could not load. Please reload and try again.', 'error');
            stopVideoProcessing();
            return;
        }
    }

    const video = document.getElementById('webcam-video');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    isMonitoring = true;
    sessionData = [];
    lastInferenceTime = 0;
    lastPoseSeenAt = Date.now();
    noPoseMessageVisible = false;
    resetScore();
    hideCanvasMessage();
    updateModelStatus('ready');

    startButton.disabled = true;
    stopButton.disabled = false;
    webcamBox.classList.add('monitoring-active');

    requestAnimationFrame(inferenceLoop);
}

function stopMonitoring() {
    if (!isMonitoring) return;

    isMonitoring = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    webcamBox.classList.remove('monitoring-active');
    webcamBox.classList.remove('good-posture', 'warning-posture', 'bad-posture');
    stopAlertBeepLoop();
    updateModelStatus('stopped');
    stopVideoProcessing();

    if (sessionData.length > 0) {
        saveSessionState(sessionData, true);
        updateSessionSummary(sessionData);
        showSessionGraph(sessionData);
    } else {
        setCanvasMessage('Session stopped', 'No posture scores were captured.');
    }
}

function toggleReminderSettings() {
    const isOpening = reminderSettings.hidden;
    reminderSettings.hidden = !isOpening;
    toggleReminderButton.setAttribute('aria-expanded', String(isOpening));
}

function saveReminderSettings() {
    scoreThreshold = parseInt(thresholdSlider.value, 10);
    remindersEnabled = true;
    reminderSettings.hidden = true;
    toggleReminderButton.setAttribute('aria-expanded', 'false');
    toggleReminderButton.classList.add('active');
    if (!soundNotificationCheckbox.checked) {
        stopAlertBeepLoop();
    } else if (isBelowThreshold) {
        startAlertBeepLoop();
    }
    showNotification(`Reminder threshold saved at ${scoreThreshold}.`, 'success');
}

function showNotification(message, type = 'info') {
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';

    window.clearTimeout(showNotification.hideTimer);
    showNotification.hideTimer = window.setTimeout(() => {
        notification.style.display = 'none';
    }, type === 'error' ? 5200 : 3000);
}

function checkPosture(score) {
    scoreDisplay.textContent = score;
    const threshold = parseInt(thresholdSlider.value, 10);
    const progressCircle = document.querySelector('.score-ring-progress');
    const offset = SCORE_CIRCUMFERENCE - (score / 100) * SCORE_CIRCUMFERENCE;
    progressCircle.style.strokeDashoffset = offset;

    if (score < threshold) {
        isBelowThreshold = true;
        startAlertBeepLoop();
    } else {
        isBelowThreshold = false;
        stopAlertBeepLoop();
    }

    if (score >= threshold + 5) {
        progressCircle.style.stroke = 'var(--good)';
        scoreHelp.textContent = 'Good alignment detected.';
        webcamBox.classList.remove('bad-posture', 'warning-posture');
        webcamBox.classList.add('good-posture');
    } else if (score >= threshold - 5) {
        progressCircle.style.stroke = 'var(--warning)';
        scoreHelp.textContent = 'Close to your alert threshold.';
        webcamBox.classList.remove('bad-posture', 'good-posture');
        webcamBox.classList.add('warning-posture');
    } else {
        progressCircle.style.stroke = 'var(--bad)';
        scoreHelp.textContent = 'Below threshold. Adjust your posture when you can.';
        webcamBox.classList.remove('good-posture', 'warning-posture');
        webcamBox.classList.add('bad-posture');
    }
}

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
    } catch (error) {
        console.error('Error accessing webcam:', error);
        updateModelStatus('error', 'Camera unavailable');

        if (error.name === 'NotAllowedError') {
            setCanvasMessage('Camera access denied', 'Allow camera access in your browser settings, then start again.');
            showNotification('Camera access was denied. Allow webcam access to use SitRight.', 'error');
        } else if (error.name === 'NotFoundError') {
            setCanvasMessage('No camera found', 'Connect a webcam and try starting another session.');
            showNotification('No camera was found on this device.', 'error');
        } else if (error.name === 'NotReadableError') {
            setCanvasMessage('Camera is busy', 'Close other apps that may be using the camera, then try again.');
            showNotification('The camera is already in use by another app.', 'error');
        } else {
            setCanvasMessage('Camera setup failed', error.message || 'The browser could not open your webcam.');
            showNotification('Could not access the camera.', 'error');
        }

        return false;
    }
}

function stopVideoProcessing() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
}

function updateSessionSummary(data) {
    const averageScore = getAverageScore(data);
    const durationLabel = data.length === 1 ? '1 sample' : `${data.length} samples`;
    sessionSummaryText.textContent = `Average ${averageScore}% across ${durationLabel}.`;
    sessionSummary.hidden = false;
}

function getAverageScore(data) {
    return Math.round(data.reduce((sum, entry) => sum + entry.score, 0) / data.length);
}

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getChartTheme() {
    return {
        ink: cssVar('--ink') || '#111827',
        muted: cssVar('--muted') || '#5b6472',
        accent: cssVar('--accent-strong') || '#4f46e5',
        good: cssVar('--good') || '#0f9f6e',
        grid: cssVar('--chart-grid') || 'rgba(91, 100, 114, 0.14)'
    };
}

function updateChartTheme() {
    if (!scoreChart) return;

    const theme = getChartTheme();
    scoreChart.data.datasets[0].borderColor = theme.accent;
    scoreChart.data.datasets[0].backgroundColor = `${theme.accent}22`;
    scoreChart.data.datasets[1].borderColor = theme.good;
    scoreChart.options.plugins.legend.labels.color = theme.muted;
    scoreChart.options.plugins.title.color = theme.ink;
    scoreChart.options.scales.y.grid.color = theme.grid;
    scoreChart.options.scales.y.ticks.color = theme.muted;
    scoreChart.options.scales.x.ticks.color = theme.muted;
    scoreChart.update('none');
}

function showSessionGraph(data) {
    if (!Array.isArray(data) || data.length === 0) {
        console.error('No session data available');
        return;
    }

    activeSessionForExport = data;
    previousFocus = document.activeElement;
    updateSessionSummary(data);

    const graphCanvas = document.getElementById('popupScoreChart');
    const averageScore = getAverageScore(data);
    const chartTheme = getChartTheme();

    if (scoreChart) {
        scoreChart.destroy();
    }

    graphPopup.hidden = false;
    closePopupButton.focus();

    const chartCtx = graphCanvas.getContext('2d');
    scoreChart = new Chart(chartCtx, {
        type: 'line',
        data: {
            labels: data.map(entry => entry.timestamp),
            datasets: [
                {
                    label: 'Posture Score',
                    data: data.map(entry => entry.score),
                    borderColor: chartTheme.accent,
                    backgroundColor: `${chartTheme.accent}22`,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Average Score',
                    data: Array(data.length).fill(averageScore),
                    borderColor: chartTheme.good,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: chartTheme.muted,
                        usePointStyle: true,
                        padding: 18
                    }
                },
                title: {
                    display: true,
                    text: `Session Average: ${averageScore}%`,
                    color: chartTheme.ink,
                    padding: {
                        top: 8,
                        bottom: 24
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: chartTheme.grid },
                    ticks: { color: chartTheme.muted }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: chartTheme.muted,
                        maxRotation: 45,
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8
                    }
                }
            }
        }
    });

    setCanvasMessage('Session stopped', 'Review your chart, export the CSV, or start a new session.');
}

function closeSessionGraph() {
    graphPopup.hidden = true;
    clearSessionState();

    if (scoreChart) {
        scoreChart.destroy();
        scoreChart = null;
    }

    if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
    }
}

function exportSessionData(data) {
    if (!Array.isArray(data) || data.length === 0) {
        showNotification('No session data is available to export.', 'error');
        return;
    }

    const csvRows = [['Timestamp', 'Score']];
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
    window.URL.revokeObjectURL(link.href);
}

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('resize', () => {
    initCanvas();
});

window.addEventListener('beforeunload', stopAlertBeepLoop);
