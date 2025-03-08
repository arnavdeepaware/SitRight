import React from "react";
import "./Percentage.css";

function Percentage({ postureScore }) {
  return (
    <div className="percentage-container">
      Posture Score: <span className="score">{postureScore}%</span>
    </div>
  );
}

export default Percentage;