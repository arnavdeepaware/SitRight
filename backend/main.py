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

# Modify the main loop
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

        # STEP 2: Pose Detection
        # Extract key body landmarks
        left_shoulder = (int(landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].x * frame.shape[1]),
                         int(landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].y * frame.shape[0]))
        right_shoulder = (int(landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].x * frame.shape[1]),
                          int(landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].y * frame.shape[0]))
        left_ear = (int(landmarks[mp_pose.PoseLandmark.LEFT_EAR.value].x * frame.shape[1]),
                    int(landmarks[mp_pose.PoseLandmark.LEFT_EAR.value].y * frame.shape[0]))
        right_ear = (int(landmarks[mp_pose.PoseLandmark.RIGHT_EAR.value].x * frame.shape[1]),
                     int(landmarks[mp_pose.PoseLandmark.RIGHT_EAR.value].y * frame.shape[0]))

        # STEP 3: Angle Calculation
        shoulder_angle = calculate_angle(left_shoulder, right_shoulder, (right_shoulder[0], 0))
        neck_angle = calculate_angle(left_ear, left_shoulder, (left_shoulder[0], 0))

        # STEP 1: Calibration
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

        # Draw skeleton and angles
        mp_drawing.draw_landmarks(frame, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)
        midpoint = ((left_shoulder[0] + right_shoulder[0]) // 2, (left_shoulder[1] + right_shoulder[1]) // 2)
        draw_angle(frame, left_shoulder, midpoint, (midpoint[0], 0), shoulder_angle, (255, 0, 0))
        draw_angle(frame, left_ear, left_shoulder, (left_shoulder[0], 0), neck_angle, (0, 255, 0))

        # STEP 4: Feedback
        if is_calibrated:
            current_time = time.time()
            if shoulder_angle < shoulder_threshold or neck_angle < neck_threshold:
                status = "Poor Posture"
                color = (0, 0, 255)  # Red
                if current_time - last_alert_time > alert_cooldown:
                    print("Poor posture detected! Please sit up straight.")
                    if os.path.exists(sound_file):
                        play_sound(sound_file)
                    last_alert_time = current_time
            else:
                status = "Good Posture"
                color = (0, 255, 0)  # Green
                stop_sound()  # Stop the sound when posture is good

            cv2.putText(frame, status, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2, cv2.LINE_AA)
            cv2.putText(frame, f"Shoulder Angle: {shoulder_angle:.1f}/{shoulder_threshold:.1f}", (10, 60), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
            cv2.putText(frame, f"Neck Angle: {neck_angle:.1f}/{neck_threshold:.1f}", (10, 90), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)

    # Display the frame
    cv2.imshow('Posture Corrector', frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()