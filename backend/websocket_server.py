import asyncio
import json
import cv2
import numpy as np
import base64
import os
import time
from aiohttp import web
from pose_detector import mp_pose, mp_drawing, prepare_row_for_prediction
from Predictor import predict_posture
from mediapipe.python.solutions import drawing_styles
from datetime import datetime
import pandas as pd

pose = mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5, min_tracking_confidence=0.5)

model_path = os.environ.get('MODEL_PATH',
    os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml', 'model', 'posture_model.h5'))
scaler_path = os.environ.get('SCALER_PATH',
    os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml', 'model', 'scaler.pkl'))

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend')


async def process_frame(frame_data):
    try:
        encoded_data = frame_data.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        frame_height, frame_width = frame.shape[:2]
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb_frame)

        if results.pose_landmarks:
            landmarks = results.pose_landmarks.landmark

            try:
                row_data = prepare_row_for_prediction(landmarks, frame_width, frame_height)
                posture_score = predict_posture(row_data, model_path, scaler_path)[0][0]
                score = round(float(posture_score))
            except Exception as e:
                print("Error in prediction:", str(e))
                return None

            annotated_frame = frame.copy()
            mp_drawing.draw_landmarks(
                annotated_frame,
                results.pose_landmarks,
                mp_pose.POSE_CONNECTIONS,
                landmark_drawing_spec=drawing_styles.get_default_pose_landmarks_style(),
                connection_drawing_spec=mp_drawing.DrawingSpec(
                    color=(255, 255, 255),
                    thickness=2,
                    circle_radius=1
                )
            )

            _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            annotated_frame_base64 = base64.b64encode(buffer).decode('utf-8')

            return {
                'score': score,
                'annotatedFrame': f'data:image/jpeg;base64,{annotated_frame_base64}'
            }
    except Exception as e:
        print(f"Error processing frame: {str(e)}")
        return None


async def websocket_handler(request):
    ws = web.WebSocketResponse(max_msg_size=10_000_000)
    await ws.prepare(request)
    print("New client connected")

    threshold = 70
    session_data = []

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    if data['type'] == 'frame':
                        result = await process_frame(data['data'])
                        if result:
                            score = result['score']
                            session_data.append({
                                'timestamp': datetime.now().strftime('%H:%M:%S'),
                                'score': score
                            })

                            if score >= (threshold + 5):
                                result['status'] = 'good'
                            elif score >= (threshold - 5):
                                result['status'] = 'warning'
                            else:
                                result['status'] = 'bad'
                            await ws.send_json(result)
                    elif data['type'] == 'settings':
                        threshold = data.get('threshold', threshold)
                    elif data['type'] == 'stop':
                        if session_data:
                            await ws.send_json({
                                'type': 'session_data',
                                'data': session_data
                            })
                except Exception as e:
                    print(f"Error handling message: {str(e)}")
            elif msg.type == web.WSMsgType.ERROR:
                print(f"WebSocket error: {ws.exception()}")
    except Exception as e:
        print(f"Connection error: {str(e)}")
    finally:
        print("Client disconnected")

    return ws


async def index_handler(request):
    return web.FileResponse(os.path.join(FRONTEND_DIR, 'landing.html'))


async def app_handler(request):
    return web.FileResponse(os.path.join(FRONTEND_DIR, 'index.html'))


async def health_handler(request):
    return web.json_response({"status": "ok"})


def create_app():
    app = web.Application()
    app.router.add_get('/ws', websocket_handler)
    app.router.add_get('/health', health_handler)
    app.router.add_get('/', index_handler)
    app.router.add_get('/app', app_handler)
    app.router.add_static('/assets', os.path.join(FRONTEND_DIR, 'assets'))
    app.router.add_static('/', FRONTEND_DIR, show_index=False)
    return app


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8765))
    host = os.environ.get('HOST', '0.0.0.0')
    app = create_app()
    print(f"SitRight server starting on http://{host}:{port}")
    web.run_app(app, host=host, port=port)
