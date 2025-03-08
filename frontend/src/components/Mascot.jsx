import React from "react";
import "./Mascot.css";

const Mascot = ({ postureScore }) => {
  let emoji;
  let message;

  if (postureScore >= 80) {
    emoji = "😊"; // Happy
    message = "Great posture! Keep it up!";
  } else if (postureScore >= 50) {
    emoji = "😐"; // Neutral
    message = "Not bad, but try to sit straighter!";
  } else {
    emoji = "😠"; // Angry
    message = "Your posture needs fixing!";
  }

  return (
    <div className="mascot-container">
      <div className="emoji">{emoji}</div>
      <div className="mascot-message">{message}</div>
    </div>
  );
};

export default Mascot;