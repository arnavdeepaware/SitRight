
import pandas as pd
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split,KFold
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.callbacks import Callback
from tensorflow.keras.callbacks import LearningRateScheduler
from sklearn.metrics import accuracy_score
from tensorflow.keras.layers import Dense
import math
import joblib


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

def extract_features(row, video_width=100, video_height=100):  # Assuming 100x100 for normalization
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

    features = [
        dist_nose_shoulders,
        ratio_nose_shoulders,
        neck_tilt_angle,
        dist_left_ear_nose,
        dist_right_ear_nose,
        angle_left_shoulder,
        angle_right_shoulder
    ]
    return features

# def create_model(input_shape):
#     model = tf.keras.models.Sequential([
#         tf.keras.layers.Dense(16, activation='relu', input_shape=(input_shape,)),
#         tf.keras.layers.Dense(16, activation='relu'),
#         tf.keras.layers.Dense(1, activation='sigmoid')
#     ])
#     model.compile(optimizer=tf.keras.optimizers.Adam(0.001),
#                   loss='mean_squared_error')
#     return model


def create_model(input_shape):
    model = tf.keras.models.Sequential([
        Dense(32, activation='relu', input_shape=(input_shape,)),  # Reduce neurons
        Dense(16, activation='relu'),
        Dense(8, activation='relu'),
        Dense(4, activation='relu'),
        Dense(1, activation='sigmoid')
    ])

    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
                  loss='binary_crossentropy',
                  metrics=['accuracy'])
    return model

def train_model(filepath):
    df = pd.read_csv(filepath)
    X_data = []
    y_data = df['label'].values

    for index, row in df.iterrows():
        features = extract_features(row)
        X_data.append(features)

    X_data = np.array(X_data)

    # Normalize features
    scaler = MinMaxScaler()
    X_data = scaler.fit_transform(X_data)

    joblib.dump(scaler, "scaler.pkl")

    y_data_original = df['label'].values  # Keep original labels for accuracy calculation
    y_data = y_data_original / 100.0  # Normalize labels

    kfold = KFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = []
    fold_no = 1

    for train, test in kfold.split(X_data, y_data):
        print(f"Fold {fold_no}")
        model = create_model(X_data.shape[1])

        # Cyclic Learning Rate Scheduler
        def cyclic_lr(num_epochs, high_lr, low_lr):
            def scheduler(epoch, lr):
                cycle = math.floor(1 + epoch / (2 * num_epochs))
                x = abs(epoch / num_epochs - 2 * cycle + 1)
                new_lr = low_lr + (high_lr - low_lr) * max(0, (1 - x))
                return new_lr
            return scheduler

        lr_scheduler = LearningRateScheduler(
            cyclic_lr(num_epochs=12, high_lr=0.01, low_lr=0.0001)
        )

        model.fit(
            X_data[train],
            y_data[train],
            epochs=12,
            batch_size=8,
            verbose=1,
            callbacks=[lr_scheduler]
        )

        y_pred = model.predict(X_data[test]).flatten()  # Ensure predictions are 1D
        y_pred_classes = (y_pred > 0.5).astype(int)  # Convert probabilities to binary classes
        y_true_classes = (y_data_original[test] > 50).astype(int)  # Threshold original values


        #DO NOT USE GEMINI GENERATED CODE. IT WAS DOING CRAZY STUFF WITH THIS MODEL!
        accuracy = accuracy_score(y_true_classes, y_pred_classes)
        print(f"Accuracy for fold {fold_no}: {accuracy * 100:.2f}%")

        cv_scores.append(accuracy)
        fold_no += 1

    print(f"K-Fold Accuracy Scores: {cv_scores}")
    print(f"Average Accuracy: {np.mean(cv_scores) * 100:.2f}%")
    print(f"Standard Deviation: {np.std(cv_scores)}")

    final_model = create_model(X_data.shape[1])
    final_model.fit(X_data, y_data, epochs=12, batch_size=8, verbose=1)
    final_model.save("model/test-l1.h5")
    print("Final model saved as test-l1.h5")

if __name__ == "__main__":
    train_model('./data/posture_data.csv')

