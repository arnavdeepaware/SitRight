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

# Initialize pose detection
pose = mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5, min_tracking_confidence=0.5)

# Initialize variables
last_alert_time = time.time()
alert_cooldown = 3
model_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml', 'model', 'test2.h5')
scaler_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml', 'model', 'scaler.pkl')

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
            
            # Get posture score
            row_data = prepare_row_for_prediction(landmarks, frame_width, frame_height)
            posture_score = predict_posture(row_data, model_path, scaler_path)[0][0]

            # Draw skeleton on frame
            annotated_frame = frame.copy()
            mp_drawing.draw_landmarks(annotated_frame, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)

            # Convert frame back to base64
            _, buffer = cv2.imencode('.jpg', annotated_frame)
            annotated_frame_base64 = base64.b64encode(buffer).decode('utf-8')

            return {
                'score': float(posture_score),
                'annotatedFrame': f'data:image/jpeg;base64,{annotated_frame_base64}'
            }
    except Exception as e:
        print(f"Error processing frame: {str(e)}")
        return None

async def handle_websocket(websocket):
    """Handle WebSocket connections"""
    print("New client connected")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data['type'] == 'frame':
                    result = await process_frame(data['data'])
                    if result:
                        await websocket.send(json.dumps(result))
            except Exception as e:
                print(f"Error handling message: {str(e)}")
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")

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