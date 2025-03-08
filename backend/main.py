import cv2
import mediapipe as mp
import numpy as np
import time
import pygame
import os
import sys
import csv
from datetime import datetime
# import .ml.Predictor as Predictor

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ml')))
from Predictor import predict_posture

import pandas as pd

# Add near the top of the file with other imports
import os


# Initialize pygame mixer with specific settings
pygame.mixer.pre_init(44100, 16, 2, 2048)  # Changed -16 to 16
pygame.mixer.init()

# Use absolute path for sound file
sound_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "alert.wav")

# Add these variables after pygame initialization
sound = None
is_playing = False

# Update the play_sound function
def play_sound(sound_file, loop=True):
    global sound, is_playing
    try:
        if not os.path.exists(sound_file):
            print(f"Sound file not found: {sound_file}")
            return
            
        if sound is None:
            sound = pygame.mixer.Sound(sound_file)
        
        if not is_playing:
            if loop:
                sound.play(-1)  # -1 means loop indefinitely
            else:
                sound.play()
            is_playing = True
            print(f"Started playing sound from: {sound_file}")
    except Exception as e:
        print(f"Error playing sound: {str(e)}")

def stop_sound():
    global sound, is_playing
    if sound and is_playing:
        sound.stop()
        is_playing = False
        print("Stopped playing sound")

# Initialize MediaPipe Pose and webcam
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
pose = mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5, min_tracking_confidence=0.5)
cap = cv2.VideoCapture(0)

# Initialize calibration variables
last_alert_time = time.time()
alert_cooldown = 3  # seconds

# Add new variables for data collection
csv_filename = f"posture_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
csv_headers = [
    'timestamp', 'videoWidth', 'videoHeight',
    'nose_x', 'nose_y',
    'left_eye_inner_x', 'left_eye_inner_y',
    'left_eye_x', 'left_eye_y',
    'left_eye_outer_x', 'left_eye_outer_y',
    'right_eye_inner_x', 'right_eye_inner_y',
    'right_eye_x', 'right_eye_y',
    'right_eye_outer_x', 'right_eye_outer_y',
    'left_ear_x', 'left_ear_y',
    'right_ear_x', 'right_ear_y',
    'mouth_left_x', 'mouth_left_y',
    'mouth_right_x', 'mouth_right_y',
    'left_shoulder_x', 'left_shoulder_y',
    'right_shoulder_x', 'right_shoulder_y'
]

# Initialize CSV file
with open(csv_filename, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(csv_headers)

def calculate_angle(point1, point2, point3):
    a = np.array(point1)
    b = np.array(point2)
    c = np.array(point3)
    
    ba = a - b
    bc = c - b
    
    cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc))
    angle = np.arccos(cosine_angle)
    
    return np.degrees(angle)

def draw_angle(frame, p1, p2, p3, angle, color):
    cv2.line(frame, p1, p2, color, 2)
    cv2.line(frame, p2, p3, color, 2)
    cv2.putText(frame, f"{angle:.1f}", p2, cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

def extract_keypoints(landmarks, frame_width, frame_height):
    """Extract relevant keypoints and return them as a list."""
    keypoints = {
        'nose': mp_pose.PoseLandmark.NOSE,
        'left_eye_inner': mp_pose.PoseLandmark.LEFT_EYE_INNER,
        'left_eye': mp_pose.PoseLandmark.LEFT_EYE,
        'left_eye_outer': mp_pose.PoseLandmark.LEFT_EYE_OUTER,
        'right_eye_inner': mp_pose.PoseLandmark.RIGHT_EYE_INNER,
        'right_eye': mp_pose.PoseLandmark.RIGHT_EYE,
        'right_eye_outer': mp_pose.PoseLandmark.RIGHT_EYE_OUTER,
        'left_ear': mp_pose.PoseLandmark.LEFT_EAR,
        'right_ear': mp_pose.PoseLandmark.RIGHT_EAR,
        'mouth_left': mp_pose.PoseLandmark.MOUTH_LEFT,
        'mouth_right': mp_pose.PoseLandmark.MOUTH_RIGHT,
        'left_shoulder': mp_pose.PoseLandmark.LEFT_SHOULDER,
        'right_shoulder': mp_pose.PoseLandmark.RIGHT_SHOULDER
    }
    
    data = []
    for landmark in keypoints.values():
        point = landmarks[landmark.value]
        x = point.x * frame_width
        y = point.y * frame_height
        data.extend([x, y])
    
    return data

def prepare_row_for_prediction(landmarks, frame_width, frame_height):
    """Convert landmarks to a pandas Series in the format expected by the ML model"""
    data = {
        'videoWidth': frame_width,
        'videoHeight': frame_height,
        'nose_x': landmarks[mp_pose.PoseLandmark.NOSE.value].x * frame_width,
        'nose_y': landmarks[mp_pose.PoseLandmark.NOSE.value].y * frame_height,
        'left_eye_inner_x': landmarks[mp_pose.PoseLandmark.LEFT_EYE_INNER.value].x * frame_width,
        'left_eye_inner_y': landmarks[mp_pose.PoseLandmark.LEFT_EYE_INNER.value].y * frame_height,
        'left_eye_x': landmarks[mp_pose.PoseLandmark.LEFT_EYE.value].x * frame_width,
        'left_eye_y': landmarks[mp_pose.PoseLandmark.LEFT_EYE.value].y * frame_height,
        'left_eye_outer_x': landmarks[mp_pose.PoseLandmark.LEFT_EYE_OUTER.value].x * frame_width,
        'left_eye_outer_y': landmarks[mp_pose.PoseLandmark.LEFT_EYE_OUTER.value].y * frame_height,
        'right_eye_inner_x': landmarks[mp_pose.PoseLandmark.RIGHT_EYE_INNER.value].x * frame_width,
        'right_eye_inner_y': landmarks[mp_pose.PoseLandmark.RIGHT_EYE_INNER.value].y * frame_height,
        'right_eye_x': landmarks[mp_pose.PoseLandmark.RIGHT_EYE.value].x * frame_width,
        'right_eye_y': landmarks[mp_pose.PoseLandmark.RIGHT_EYE.value].y * frame_height,
        'right_eye_outer_x': landmarks[mp_pose.PoseLandmark.RIGHT_EYE_OUTER.value].x * frame_width,
        'right_eye_outer_y': landmarks[mp_pose.PoseLandmark.RIGHT_EYE_OUTER.value].y * frame_height,
        'left_ear_x': landmarks[mp_pose.PoseLandmark.LEFT_EAR.value].x * frame_width,
        'left_ear_y': landmarks[mp_pose.PoseLandmark.LEFT_EAR.value].y * frame_height,
        'right_ear_x': landmarks[mp_pose.PoseLandmark.RIGHT_EAR.value].x * frame_width,
        'right_ear_y': landmarks[mp_pose.PoseLandmark.RIGHT_EAR.value].y * frame_height,
        'mouth_left_x': landmarks[mp_pose.PoseLandmark.MOUTH_LEFT.value].x * frame_width,
        'mouth_left_y': landmarks[mp_pose.PoseLandmark.MOUTH_LEFT.value].y * frame_height,
        'mouth_right_x': landmarks[mp_pose.PoseLandmark.MOUTH_RIGHT.value].x * frame_width,
        'mouth_right_y': landmarks[mp_pose.PoseLandmark.MOUTH_RIGHT.value].y * frame_height,
        'left_shoulder_x': landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].x * frame_width,
        'left_shoulder_y': landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].y * frame_height,
        'right_shoulder_x': landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].x * frame_width,
        'right_shoulder_y': landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].y * frame_height
    }
    return pd.Series(data)

# Modify the main loop
model_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml', 'model', 'test5.h5')
while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        continue

    frame_height, frame_width = frame.shape[:2]
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = pose.process(rgb_frame)

    if results.pose_landmarks:
        landmarks = results.pose_landmarks.landmark

        # Extract and save keypoints
        keypoints_data = extract_keypoints(landmarks, frame_width, frame_height)
        
        # Prepare row data
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
        row_data = [timestamp, frame_width, frame_height] + keypoints_data
        
        # Save to CSV
        with open(csv_filename, 'a', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(row_data)

        # Add keypoint visualization
        keypoint_names = ['nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 
                         'right_eye_inner', 'right_eye', 'right_eye_outer', 
                         'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
                         'left_shoulder', 'right_shoulder']
        
        for i, name in enumerate(keypoint_names):
            x = int(keypoints_data[i*2])
            y = int(keypoints_data[i*2 + 1])
            # Draw point
            cv2.circle(frame, (x, y), 4, (255, 0, 0), -1)
            # Add label
            cv2.putText(frame, name, (x+5, y-5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.3, (255, 0, 0), 1)

        # Get posture score from ML model
        row_data = prepare_row_for_prediction(landmarks, frame_width, frame_height)
        scaler_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml', 'model', 'scaler.pkl')
        posture_score = predict_posture(row_data, model_path, scaler_path)[0][0]

        # Provide feedback based on the model's prediction
        current_time = time.time()
        if posture_score < 50:  # Below 50% is considered poor posture
            status = f"Poor Posture ({posture_score:.1f}%)"
            color = (0, 0, 255)  # Red
            if current_time - last_alert_time > alert_cooldown:
                print("Poor posture detected! Please sit up straight.")
                if os.path.exists(sound_file):
                    play_sound(sound_file)
                last_alert_time = current_time
        else:
            status = f"Good Posture ({posture_score:.1f}%)"
            color = (0, 255, 0)  # Green
            stop_sound()

        # Draw the skeleton
        mp_drawing.draw_landmarks(frame, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)

        # Display the posture score
        cv2.putText(frame, status, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2, cv2.LINE_AA)
        cv2.putText(frame, f"Posture Score: {posture_score:.1f}%", (10, 60), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)

    # Display the frame
    cv2.imshow('Posture Corrector', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()