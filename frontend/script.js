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
const visualNotificationCheckbox = document.getElementById('visual-notification');
const canvas = document.getElementById('webcam-canvas');
const webcamBox = document.getElementById('webcam-box');
const ctx = canvas.getContext('2d');

// App state
let isMonitoring = false;
let isConnected = false;
let currentScore = 0;
let mockWebcam = null;
let remindersEnabled = false;
let scoreThreshold = 70;
let lastReminderTime = 0;
const REMINDER_COOLDOWN = 30000; // 30 seconds cooldown
let notificationSound = null;
let ws = null;
let videoStream = null;
const FPS = 10;
let videoInterval = null;
let lastScoreUpdate = 0;
let lastFrameUpdate = 0;
const SCORE_UPDATE_INTERVAL = 1150; // 1.15 seconds
const FRAME_UPDATE_INTERVAL = 100; // 100ms for smoother video

// Initialize canvas size
function initCanvas() {
    const video = document.getElementById('webcam-video');
    canvas.width = 640;  // Match video dimensions
    canvas.height = 480; // Match video dimensions
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText('Camera feed will appear here', canvas.width/2, canvas.height/2);
}

// Initialize app
function init() {
    initCanvas();
    
    // Event listeners
    startButton.addEventListener('click', startMonitoring);
    stopButton.addEventListener('click', stopMonitoring);
    toggleReminderButton.addEventListener('click', toggleReminderSettings);
    saveReminderSettingsButton.addEventListener('click', saveReminderSettings);
    
    thresholdSlider.addEventListener('input', () => {
        thresholdValue.textContent = thresholdSlider.value;
    });
    
    // Create audio notification
    notificationSound = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAzMzMzMzMzMw==");
    
    // Update app visuals
    updateConnectionStatus(false);
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
    
    connectToBackend();
}

// Stop posture monitoring
function stopMonitoring() {
    if (!isMonitoring) return;
    
    isMonitoring = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    webcamBox.classList.remove('monitoring-active');
    
    stopVideoProcessing();
    if (ws) {
        ws.close();
        ws = null;
    }
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
    
    // Send new settings to server
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Send threshold update
        ws.send(JSON.stringify({
            type: 'threshold',
            value: scoreThreshold
        }));
        
        // Send sound preference
        ws.send(JSON.stringify({
            type: 'sound',
            enabled: soundNotificationCheckbox.checked
        }));
    }
    
    showNotification("Posture reminders enabled!");
}

// Mock connection to backend
function connectToBackend() {
    ws = new WebSocket('ws://localhost:8765');
    
    ws.onopen = () => {
        isConnected = true;
        updateConnectionStatus(true);
        showNotification("Connected to posture detection service");
        startVideoProcessing();
    };
    
    ws.onclose = () => {
        isConnected = false;
        updateConnectionStatus(false);
        showNotification("Disconnected from posture detection service");
        stopVideoProcessing();
    };
    
    ws.onmessage = (event) => {
        const currentTime = Date.now();
        const data = JSON.parse(event.data);
        
        // Always update the annotated frame for smooth visualization
        if (data.annotatedFrame) {
            updateAnnotatedFrame(data.annotatedFrame);
        }
        
        // Update score and check against threshold
        if (data.score !== undefined && currentTime - lastScoreUpdate >= SCORE_UPDATE_INTERVAL) {
            const score = data.score;
            document.getElementById('score-display').textContent = `${score}%`;
            checkPosture(score);
            
            // Add visual feedback for posture status
            const webcamBox = document.getElementById('webcam-box');
            if (data.status === 'bad') {
                webcamBox.style.border = '2px solid #ef4444';
            } else {
                webcamBox.style.border = '2px solid #10b981';
            }
            
            lastScoreUpdate = currentTime;
        }
    };
}

// Mock disconnection from backend
function disconnectFromBackend() {
    isConnected = false;
    updateConnectionStatus(false);
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
function showNotification(message) {
    notification.textContent = message;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Check posture and trigger reminders if needed
function checkPosture(score) {
    currentScore = score;
    scoreDisplay.textContent = score;
    const threshold = parseInt(thresholdSlider.value);
    
    // Update score color based on thresholds
    if (score >= (threshold + 5)) {
        scoreDisplay.style.color = '#10b981';  // Green
        webcamBox.classList.remove('bad-posture', 'warning-posture');
        webcamBox.classList.add('good-posture');
    } else if (score >= (threshold - 5)) {
        scoreDisplay.style.color = '#fbbf24';  // Yellow
        webcamBox.classList.remove('bad-posture', 'good-posture');
        webcamBox.classList.add('warning-posture');
    } else {
        scoreDisplay.style.color = '#ef4444';  // Red
        webcamBox.classList.remove('good-posture', 'warning-posture');
        webcamBox.classList.add('bad-posture');
        
        if (remindersEnabled) {
            const now = Date.now();
            if (now - lastReminderTime > REMINDER_COOLDOWN) {
                if (visualNotificationCheckbox.checked) {
                    showNotification("Fix your posture!");
                }
                lastReminderTime = now;
            }
        }
    }
}

// Trigger posture reminder
function triggerReminder() {
    if (visualNotificationCheckbox.checked) {
        showNotification("Fix your posture!");
    }
    
    if (soundNotificationCheckbox.checked) {
        notificationSound.play();
    }
}

// Start mock webcam feed
function startMockWebcam() {
    // In a real app, this would be getUserMedia and a video stream
    // For this demo, we'll just draw a simple animation
    
    const width = canvas.width;
    const height = canvas.height;
    
    mockWebcam = setInterval(() => {
        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        
        // Draw a simple silhouette
        ctx.fillStyle = '#6b7280';
        
        // Head
        ctx.beginPath();
        ctx.arc(width/2, height/3, 40, 0, Math.PI * 2);
        ctx.fill();
        
        // Body
        ctx.fillRect(width/2 - 25, height/3 + 40, 50, 100);
        
        // Generate random posture score (in real app, this would come from your ML model)
        if (isConnected) {
            const randomScore = Math.floor(Math.random() * 40) + 40; // Random score between 40-80
            checkPosture(randomScore);
        }
    }, 1000);
}

// Stop mock webcam feed
function stopMockWebcam() {
    if (mockWebcam) {
        clearInterval(mockWebcam);
        mockWebcam = null;
        
        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.font = '16px Inter, sans-serif';
        ctx.fillText('Camera feed will appear here', canvas.width/2, canvas.height/2);
        
        // Reset score display
        scoreDisplay.textContent = '--';
        scoreDisplay.style.color = 'white';
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
        await video.play(); // Ensure video starts playing
        videoStream = stream;
        return true;
    } catch (err) {
        console.error("Error accessing webcam:", err);
        showNotification("Error accessing webcam. Please make sure it's connected and permissions are granted.");
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
            // Always draw the video frame for smooth display
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Only send frame for processing at specified intervals
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
