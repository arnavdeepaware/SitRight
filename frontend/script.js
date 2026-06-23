// DOM Elements
const startButton = document.getElementById('start-btn');
const stopButton = document.getElementById('stop-btn');
const toggleReminderButton = document.getElementById('toggle-reminder-btn');
const reminderSettings = document.getElementById('reminder-settings');
const thresholdSlider = document.getElementById('threshold-slider');
const thresholdValue = document.getElementById('threshold-value');
const saveReminderSettingsButton = document.getElementById('save-reminder-settings');
const scoreDisplay = document.getElementById('score-display');
const connectionIndicator = document.getElementById('connection-indicator');
const connectionStatusText = document.getElementById('connection-status-text');
const notification = document.getElementById('notification');
const soundNotificationCheckbox = document.getElementById('sound-notification');
const canvas = document.getElementById('webcam-canvas');
const webcamBox = document.getElementById('webcam-box');
const ctx = canvas.getContext('2d');

// App state
let isMonitoring = false;
let isConnected = false;
let currentScore = 0;
let remindersEnabled = false;
let scoreThreshold = 70;
let lastReminderTime = 0;
const REMINDER_COOLDOWN = 30000;
let ws = null;
let videoStream = null;
const FPS = 10;
let videoInterval = null;
let lastScoreUpdate = 0;
let lastFrameUpdate = 0;
const SCORE_UPDATE_INTERVAL = 1150;
const FRAME_UPDATE_INTERVAL = 100;
let scoreChart = null;

// Reconnection state
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;
let reconnectTimeout = null;

// Audio context for alert beep
let audioCtx = null;

function getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
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

    updateConnectionStatus(false);

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
            const sessionData = JSON.parse(savedData);
            if (sessionData) {
                showSessionGraph(sessionData);
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

    isMonitoring = true;
    startButton.disabled = true;
    stopButton.disabled = false;
    webcamBox.classList.add('monitoring-active');
    reconnectAttempts = 0;

    connectToBackend();
}

// Stop posture monitoring
function stopMonitoring() {
    if (!isMonitoring) return;

    isMonitoring = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    webcamBox.classList.remove('monitoring-active');

    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
        setTimeout(() => {
            stopVideoProcessing();
            ws.close();
        }, 2000);
        return;
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

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'settings',
            sound: soundNotificationCheckbox.checked,
            threshold: scoreThreshold
        }));
    }

    showNotification("Settings saved");
}

// Connect to backend via WebSocket
function connectToBackend() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    try {
        ws = new WebSocket(getWebSocketUrl());
    } catch (e) {
        showNotification("Failed to connect to server. Is the backend running?", true);
        resetMonitoringState();
        return;
    }

    ws.onopen = () => {
        isConnected = true;
        reconnectAttempts = 0;
        updateConnectionStatus(true);
        showNotification("Connected to posture detection service");
        startVideoProcessing();
    };

    ws.onclose = () => {
        isConnected = false;
        updateConnectionStatus(false);
        stopVideoProcessing();

        if (isMonitoring && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
            reconnectAttempts++;
            showNotification(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            reconnectTimeout = setTimeout(connectToBackend, delay);
        } else if (isMonitoring && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            showNotification("Could not reconnect to server. Please restart monitoring.", true);
            resetMonitoringState();
        }
    };

    ws.onerror = () => {
        if (!isConnected && reconnectAttempts === 0) {
            showNotification("Cannot reach the server. Make sure the backend is running.", true);
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'session_data') {
                saveSessionState(data.data, true);
                showSessionGraph(data.data);
            } else {
                if (data.annotatedFrame) {
                    updateAnnotatedFrame(data.annotatedFrame);
                }
                if (data.score !== undefined) {
                    const score = data.score;
                    document.getElementById('score-display').textContent = `${score}%`;
                    checkPosture(score);
                }
            }
        } catch (error) {
            console.error("Error processing message:", error);
        }
    };
}

function resetMonitoringState() {
    isMonitoring = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    webcamBox.classList.remove('monitoring-active');
}

// Update connection status indicator
function updateConnectionStatus(connected) {
    if (connected) {
        connectionIndicator.classList.remove('status-disconnected');
        connectionIndicator.classList.add('status-connected');
        connectionStatusText.textContent = 'Connected to posture detection service';
    } else {
        connectionIndicator.classList.remove('status-connected');
        connectionIndicator.classList.add('status-disconnected');
        connectionStatusText.textContent = 'Not connected to posture detection service';
    }
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

function startVideoProcessing() {
    const video = document.getElementById('webcam-video');
    const canvas = document.getElementById('webcam-canvas');
    const ctx = canvas.getContext('2d');

    video.addEventListener('play', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    });

    videoInterval = setInterval(() => {
        const currentTime = Date.now();

        if (ws && ws.readyState === WebSocket.OPEN && video.readyState === 4) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            if (currentTime - lastFrameUpdate >= FRAME_UPDATE_INTERVAL) {
                const frame = canvas.toDataURL('image/jpeg', 0.8);
                ws.send(JSON.stringify({
                    type: 'frame',
                    data: frame
                }));
                lastFrameUpdate = currentTime;
            }
        }
    }, 1000 / FPS);
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

function updateAnnotatedFrame(frameData) {
    const canvas = document.getElementById('webcam-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = frameData;
}

function showSessionGraph(sessionData) {
    const popup = document.getElementById('graphPopup');
    const canvas = document.getElementById('popupScoreChart');
    const closeBtn = document.getElementById('closePopup');

    if (!sessionData || sessionData.length === 0) {
        console.error('No session data available');
        return;
    }

    const averageScore = Math.round(
        sessionData.reduce((sum, d) => sum + d.score, 0) / sessionData.length
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

        const ctx = canvas.getContext('2d');
        scoreChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sessionData.map(d => d.timestamp),
                datasets: [{
                    label: 'Posture Score',
                    data: sessionData.map(d => d.score),
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Average Score',
                    data: Array(sessionData.length).fill(averageScore),
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
            exportSessionData(sessionData);
        };

    } catch (error) {
        console.error('Error creating chart:', error);
    }
}

function exportSessionData(sessionData) {
    const csvRows = [];
    csvRows.push(['Timestamp', 'Score']);

    sessionData.forEach(row => {
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
