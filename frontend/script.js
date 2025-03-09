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
let scoreChart = null;

// Add these state management functions at the top
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
    
    // Hide popup if it's visible
    const popup = document.getElementById('graphPopup');
    if (popup) {
        popup.style.display = 'none';
    }
    
    // Destroy chart if it exists
    if (scoreChart) {
        scoreChart.destroy();
        scoreChart = null;
    }
}

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

    // Add popup click handler
    const popup = document.getElementById('graphPopup');
    popup.addEventListener('click', function(e) {
        if (e.target === popup) {
            popup.style.display = 'none';
            if (scoreChart) {
                scoreChart.destroy();
            }
        }
    });
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
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("Sending stop request to server");
        ws.send(JSON.stringify({ type: 'stop' }));
        
        setTimeout(() => {
            stopVideoProcessing();
            ws.close();
        }, 2000);
        return;
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
    
    // Send settings to server
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'settings',
            sound: soundNotificationCheckbox.checked,
            threshold: scoreThreshold
        }));
    }
    
    // Only show connection status changes
    showNotification("Settings saved");
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
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'session_data') {
                console.log("Received session data:", data.data);
                saveSessionState(data.data, true);  // Save with show flag
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

// Update showNotification function to only show connection status
function showNotification(message) {
    if (message.includes("Connected") || message.includes("Disconnected") || message.includes("Settings")) {
        notification.textContent = message;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

// Update checkPosture function
function checkPosture(score) {
    currentScore = score;
    scoreDisplay.textContent = score;
    const threshold = parseInt(thresholdSlider.value);
    const progressCircle = document.querySelector('.score-ring-progress');
    const circumference = 2 * Math.PI * 45; // radius = 45
    
    // Update progress ring
    const offset = circumference - (score / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;
    
    if (score >= (threshold + 5)) {
        progressCircle.style.stroke = '#10b981';  // Green
        webcamBox.classList.remove('bad-posture', 'warning-posture');
        webcamBox.classList.add('good-posture');
    } else if (score >= (threshold - 5)) {
        progressCircle.style.stroke = '#fbbf24';  // Yellow
        webcamBox.classList.remove('bad-posture', 'good-posture');
        webcamBox.classList.add('warning-posture');
    } else {
        progressCircle.style.stroke = '#ef4444';  // Red
        webcamBox.classList.remove('good-posture', 'warning-posture');
        webcamBox.classList.add('bad-posture');
        
        // Sound notification logic remains the same
        if (remindersEnabled && soundNotificationCheckbox.checked) {
            const now = Date.now();
            if (now - lastReminderTime > REMINDER_COOLDOWN) {
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

function createSessionChart(sessionData) {
    const popup = document.getElementById('graphPopup');
    const canvas = document.getElementById('popupScoreChart');
    const closeBtn = document.getElementById('closePopup');
    
    if (!Chart || !canvas) {
        console.error("Chart.js not loaded or canvas not found");
        return;
    }
    
    // Show popup
    popup.style.display = 'flex';
    
    // Setup close button handler
    closeBtn.onclick = function() {
        popup.style.display = 'none';
        if (scoreChart) {
            scoreChart.destroy();
        }
    };
    
    try {
        if (scoreChart) {
            scoreChart.destroy();
        }

        scoreChart = new Chart(canvas.getContext('2d'), {
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
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#f8fafc'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#cbd5e1'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#cbd5e1',
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error creating chart:", error);
    }
}

// Update the showSessionGraph function
function showSessionGraph(sessionData) {
    console.log('Session data:', sessionData);
    
    const popup = document.getElementById('graphPopup');
    const canvas = document.getElementById('popupScoreChart');
    const closeBtn = document.getElementById('closePopup');
    
    if (!sessionData || sessionData.length === 0) {
        console.error('No session data available');
        return;
    }

    // Calculate average score
    const averageScore = Math.round(
        sessionData.reduce((sum, d) => sum + d.score, 0) / sessionData.length
    );

    try {
        if (scoreChart) {
            scoreChart.destroy();
        }

        // Show popup
        popup.style.display = 'flex';

        // Setup close handlers
        closeBtn.onclick = function() {
            popup.style.display = 'none';
            if (scoreChart) {
                scoreChart.destroy();
            }
            clearSessionState(); // Clear all session data
        };

        // Close on clicking outside
        popup.onclick = function(e) {
            if (e.target === popup) {
                popup.style.display = 'none';
                if (scoreChart) {
                    scoreChart.destroy();
                }
                clearSessionState(); // Clear all session data
            }
        };

        // Create new chart
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
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#cbd5e1'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#cbd5e1',
                            maxRotation: 45,
                            minRotation: 45
                        }
                    }
                }
            }
        });

        // Add export button handler
        const exportButton = document.getElementById('exportButton');
        exportButton.onclick = function() {
            exportSessionData(sessionData);
        };

    } catch (error) {
        console.error('Error creating chart:', error);
    }
}

// Add page load handler to clear any existing session
document.addEventListener('DOMContentLoaded', () => {
    // Clear any existing session data on page load
    clearSessionState();
});

// Add these at the top of script.js
document.addEventListener('DOMContentLoaded', () => {
    // Check for saved session data on page load
    const savedData = localStorage.getItem('lastSessionData');
    if (savedData) {
        try {
            const sessionData = JSON.parse(savedData);
            // Show graph if stop button was just clicked
            if (sessionData && localStorage.getItem('showGraph')) {
                showSessionGraph(sessionData);
                localStorage.removeItem('showGraph'); // Clear the flag
            }
        } catch (error) {
            console.error("Error loading saved session data:", error);
        }
    }
});

// Add before stopping video processing
window.addEventListener('beforeunload', () => {
    // Set flag if stopping monitoring
    if (!isMonitoring && localStorage.getItem('lastSessionData')) {
        localStorage.setItem('showGraph', 'true');
    }
});

// Add this new function
function exportSessionData(sessionData) {
    // Convert data to CSV format
    const csvRows = [];
    
    // Add headers
    csvRows.push(['Timestamp', 'Score']);
    
    // Add data rows
    sessionData.forEach(row => {
        csvRows.push([row.timestamp, row.score]);
    });
    
    // Convert to CSV string
    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    
    // Create blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    // Create file name with current date and time
    const fileName = `posture_session_${new Date().toISOString().slice(0,19).replace(/[:-]/g, '')}.csv`;
    
    // Set up download
    if (window.navigator.msSaveOrOpenBlob) {
        // For IE
        window.navigator.msSaveBlob(blob, fileName);
    } else {
        // For other browsers
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
