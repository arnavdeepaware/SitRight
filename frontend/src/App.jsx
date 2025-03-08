import React, { useState } from "react";
import Webcam from "react-webcam";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <header className="header">SitRight</header>
      <main className="main-content">
        <p>Welcome to SitRight!</p>

        {/* Camera Feed */}
        <div className="camera-container">
          <Webcam className="webcam" />
          <canvas className="overlay-canvas"></canvas>
        </div>

        {/* Counter (Example) */}
        <button onClick={() => setCount(count + 1)}>Count: {count}</button>
      </main>
    </div>
  );
}

export default App;