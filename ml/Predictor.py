import pandas as pd
import tensorflow as tf
import joblib
import numpy as np
from sklearn.preprocessing import MinMaxScaler


def distance_2d(x1, y1, x2, y2):
    return np.sqrt((x2 - x1)**2 + (y2 - y1)**2)


def angle_abc(ax, ay, bx, by, cx, cy):
    ab_x = ax - bx
    ab_y = ay - by
    cb_x = cx - bx
    cb_y = cy - by

    dot = ab_x * cb_x + ab_y * cb_y
    mag_ab = np.sqrt(ab_x**2 + ab_y**2)
    mag_cb = np.sqrt(cb_x**2 + cb_y**2)

    if mag_ab == 0 or mag_cb == 0:
        return 180.0

    cos_theta = dot / (mag_ab * mag_cb)
    cos_theta = np.clip(cos_theta, -1.0, 1.0)
    return np.arccos(cos_theta) * 180 / np.pi


def extract_features(row, video_width=100, video_height=100):
    nose_x = row['nose_x'] / video_width
    nose_y = row['nose_y'] / video_height
    lsho_x = row['left_shoulder_x'] / video_width
    lsho_y = row['left_shoulder_y'] / video_height
    rsho_x = row['right_shoulder_x'] / video_width
    rsho_y = row['right_shoulder_y'] / video_height
    lear_x = row['left_ear_x'] / video_width
    lear_y = row['left_ear_y'] / video_height
    rear_x = row['right_ear_x'] / video_width
    rear_y = row['right_ear_y'] / video_height

    msho_x = (lsho_x + rsho_x) / 2
    msho_y = (lsho_y + rsho_y) / 2

    dist_nose_shoulders = distance_2d(nose_x, nose_y, msho_x, msho_y)
    shoulder_width = distance_2d(lsho_x, lsho_y, rsho_x, rsho_y)
    ratio_nose_shoulders = dist_nose_shoulders / shoulder_width if shoulder_width > 0 else 0

    neck_tilt_angle = angle_abc(lear_x, lear_y, nose_x, nose_y, rear_x, rear_y)
    dist_left_ear_nose = distance_2d(lear_x, lear_y, nose_x, nose_y)
    dist_right_ear_nose = distance_2d(rear_x, rear_y, nose_x, nose_y)
    angle_left_shoulder = angle_abc(lear_x, lear_y, lsho_x, lsho_y, nose_x, nose_y)
    angle_right_shoulder = angle_abc(rear_x, rear_y, rsho_x, rsho_y, nose_x, nose_y)

    return [
        dist_nose_shoulders,
        ratio_nose_shoulders,
        neck_tilt_angle,
        dist_left_ear_nose,
        dist_right_ear_nose,
        angle_left_shoulder,
        angle_right_shoulder
    ]


_model_cache = {}
_scaler_cache = {}


def predict_posture(row, model_path, scaler_path):
    if model_path not in _model_cache:
        _model_cache[model_path] = tf.keras.models.load_model(model_path)
    if scaler_path not in _scaler_cache:
        _scaler_cache[scaler_path] = joblib.load(scaler_path)

    model = _model_cache[model_path]
    scaler = _scaler_cache[scaler_path]

    features = extract_features(row)
    features = np.array(features).reshape(1, -1)
    features = scaler.transform(features)

    predictions = model.predict(features)
    return predictions * 100
