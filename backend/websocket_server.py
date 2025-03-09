import asyncio
import websockets
import json
import cv2
import numpy as np
import base64
import os
import time
from pose_detector import mp_pose, mp_drawing, prepare_row_for_prediction
from Predictor import predict_posture
from mediapipe.python.solutions import drawing_styles
import pygame
import os
import csv
from datetime import datetime
import pandas as pd

# Initialize pose detection
pose = mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5, min_tracking_confidence=0.5)

# Initialize pygame mixer after other initializations
pygame.mixer.pre_init(44100, 16, 2, 2048)
pygame.mixer.init()

# Initialize variables
last_alert_time = time.time()
alert_cooldown = 3
model_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml', 'model', 'test2.h5')
scaler_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml', 'model', 'scaler.pkl')

# Add sound variables
sound_file = os.path.join(os.path.dirname(__file__), "alert.wav")
sound = None
is_playing = False

# Add sound control functions
def play_sound():
    global sound, is_playing
    try:
        if sound is None and os.path.exists(sound_file):
            sound = pygame.mixer.Sound(sound_file)
        if sound and not is_playing:
            sound.play(-1)  # Loop the sound
            is_playing = True
    except Exception as e:
        print(f"Error playing sound: {str(e)}")

def stop_sound():
    global sound, is_playing
    if sound and is_playing:
        sound.stop()
        is_playing = False

# Add session data variable
session_data = []

async def process_frame(frame_data):
    """Process a single frame and return posture analysis"""
    try:
        # Decode base64 image
        encoded_data = frame_data.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # Process frame
        frame_height, frame_width = frame.shape[:2]
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb_frame)

        if results.pose_landmarks:
            landmarks = results.pose_landmarks.landmark
            
            try:
                row_data = prepare_row_for_prediction(landmarks, frame_width, frame_height)
                posture_score = predict_posture(row_data, model_path, scaler_path)[0][0]
                # Round the score to nearest integer percentage
                score = round(float(posture_score))
                print("Posture score:", score)
            except Exception as e:
                print("Error in prediction:", str(e))
                return None

            # Create a separate frame for visual display
            annotated_frame = frame.copy()
            
            # Draw skeleton with custom style
            mp_drawing.draw_landmarks(
                annotated_frame,
                results.pose_landmarks,
                mp_pose.POSE_CONNECTIONS,
                landmark_drawing_spec=drawing_styles.get_default_pose_landmarks_style(),
                connection_drawing_spec=mp_drawing.DrawingSpec(
                    color=(255, 255, 255),  # White lines
                    thickness=2,
                    circle_radius=1
                )
            )

            # Convert frame back to base64
            _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            annotated_frame_base64 = base64.b64encode(buffer).decode('utf-8')

            return {
                'score': score,  # Already rounded to integer
                'annotatedFrame': f'data:image/jpeg;base64,{annotated_frame_base64}'
            }
    except Exception as e:
        print(f"Error processing frame: {str(e)}")
        return None

# Update the handle_websocket function
async def handle_websocket(websocket):
    """Handle WebSocket connections"""
    print("New client connected")
    threshold = 70  # Default threshold
    sound_enabled = True  # Default sound setting
    global session_data
    session_data = []  # Reset session data for new connection
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data['type'] == 'frame':
                    result = await process_frame(data['data'])
                    if result:
                        score = result['score']
                        # Record timestamp and score
                        session_data.append({
                            'timestamp': datetime.now().strftime('%H:%M:%S'),
                            'score': score
                        })
                        
                        if score >= (threshold + 5):
                            result['status'] = 'good'
                            stop_sound()
                        elif score >= (threshold - 5):
                            result['status'] = 'warning'
                            stop_sound()
                        else:
                            result['status'] = 'bad'
                            if sound_enabled:
                                play_sound()
                        await websocket.send(json.dumps(result))
                elif data['type'] == 'settings':
                    threshold = data.get('threshold', threshold)
                    sound_enabled = data.get('sound', True)
                    if not sound_enabled:
                        stop_sound()
                elif data['type'] == 'stop':
                    # Save session data to CSV when stopping
                    if session_data:
                        df = pd.DataFrame(session_data)
                        csv_path = 'session_data.csv'
                        df.to_csv(csv_path, index=False)
                        print("Sending session data to client") # Add logging
                        # Send the data back to client
                        await websocket.send(json.dumps({
                            'type': 'session_data',
                            'data': session_data
                        }))
            except Exception as e:
                print(f"Error handling message: {str(e)}")
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")
        stop_sound()

async def main():
    """Start WebSocket server"""
    server = await websockets.serve(
        handler=handle_websocket,  # Changed from ws_handler to handler
        host="localhost",
        port=8765,
        max_size=10_000_000  # 10MB max message size
    )
    print("WebSocket server started on ws://localhost:8765")
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())