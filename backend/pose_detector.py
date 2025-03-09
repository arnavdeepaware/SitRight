import cv2
import mediapipe as mp
import numpy as np
import pandas as pd
import sys
import os

# Add the ml directory to Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ml')))
from Predictor import predict_posture

# Initialize MediaPipe Pose
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils

__all__ = ['mp_pose', 'mp_drawing', 'prepare_row_for_prediction']

def prepare_row_for_prediction(landmarks, frame_width, frame_height):
    """Convert landmarks to a pandas Series in the format expected by the ML model"""
    data = {
        'videoWidth': frame_width,
        'videoHeight': frame_height,
        'nose_x': landmarks[mp_pose.PoseLandmark.NOSE.value].x * frame_width,
        'nose_y': landmarks[mp_pose.PoseLandmark.NOSE.value].y * frame_height,
        'left_eye_inner_x': landmarks[mp_pose.PoseLandmark.LEFT_EYE_INNER.value].x * frame_width,
        'left_eye_inner_y': landmarks[mp_pose.PoseLandmark.LEFT_EYE_INNER.value].y * frame_height,
        # ... (copy all other landmarks from main.py)
        'right_shoulder_x': landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].x * frame_width,
        'right_shoulder_y': landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER.value].y * frame_height
    }
    return pd.Series(data)