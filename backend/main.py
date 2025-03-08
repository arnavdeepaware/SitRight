import cv2
import mediapipe as mp
import numpy as np
import time
import pygame
import os
import csv
from datetime import datetime

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
calibration_shoulder_angles = []
calibration_neck_angles = []
calibration_frames = 0
is_calibrated = False
shoulder_threshold = 0
neck_threshold = 0
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

# Main loop
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
        
        # Prepare row data for CSV
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
        row_data = [timestamp, frame_width, frame_height] + keypoints_data
        
        # Save to CSV
        with open(csv_filename, 'a', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(row_data)

        # Extract key body landmarks
        left_shoulder = (int(landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].x * frame.shape[1]),
                        int(landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].y * frame.shape[0]))
        right_shoulder = (int(landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].x * frame.shape[1]),
                         int(landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].y * frame.shape[0]))
        left_ear = (int(landmarks[mp_pose.PoseLandmark.LEFT_EAR.value].x * frame.shape[1]),
                   int(landmarks[mp_pose.PoseLandmark.LEFT_EAR.value].y * frame.shape[0]))

        # Calculate basic angles for calibration
        shoulder_angle = calculate_angle(left_shoulder, right_shoulder, (right_shoulder[0], 0))
        neck_angle = calculate_angle(left_ear, left_shoulder, (left_shoulder[0], 0))

        # Calibration Phase
        if not is_calibrated and calibration_frames < 30:
            calibration_shoulder_angles.append(shoulder_angle)
            calibration_neck_angles.append(neck_angle)
            calibration_frames += 1
            cv2.putText(frame, f"Calibrating... {calibration_frames}/30", (10, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2, cv2.LINE_AA)
        elif not is_calibrated:
            shoulder_threshold = np.mean(calibration_shoulder_angles) - 10
            neck_threshold = np.mean(calibration_neck_angles) - 10
            is_calibrated = True
            print(f"Calibration complete. Shoulder threshold: {shoulder_threshold:.1f}, Neck threshold: {neck_threshold:.1f}")

        # Draw skeleton and analyze posture
        mp_drawing.draw_landmarks(frame, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)
        
        if is_calibrated:
            # Get ML-based posture score
            features = extract_posture_features(landmarks, frame_width, frame_height)
            if features is not None:
                posture_score = get_posture_score(features)
                
                # Adjust score based on calibration thresholds
                angle_factor = min(
                    max(0, shoulder_angle - shoulder_threshold) / shoulder_threshold,
                    max(0, neck_angle - neck_threshold) / neck_threshold
                )
                adjusted_score = posture_score * (0.7 + 0.3 * angle_factor)
                
                current_time = time.time()
                # Update the score threshold section
                if adjusted_score < 60:  # Changed from 70 to 60
                    status = "Poor Posture"
                    color = (0, 0, 255)  # Red
                    if current_time - last_alert_time > alert_cooldown:
                        print(f"Poor posture detected! Score: {adjusted_score:.1f}%")
                        if os.path.exists(sound_file):
                            play_sound(sound_file)
                        last_alert_time = current_time
                else:
                    status = "Good Posture"
                    color = (0, 255, 0)  # Green
                    stop_sound()

                # Display feedback
                cv2.putText(frame, status, (10, 30), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2, cv2.LINE_AA)
                cv2.putText(frame, f"Score: {adjusted_score:.1f}%", (10, 70), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2, cv2.LINE_AA)
                
                # Add visual score bar
                bar_length = 200
                filled_length = int((adjusted_score / 100) * bar_length)
                cv2.rectangle(frame, (10, 90), (10 + bar_length, 110), (120, 120, 120), 2)
                cv2.rectangle(frame, (10, 90), (10 + filled_length, 110), color, -1)

    # Display the frame
    cv2.imshow('Posture Corrector', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
