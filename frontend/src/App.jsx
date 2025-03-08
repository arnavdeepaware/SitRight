import Webcam from 'react-webcam';
import React from "react";
import "./App.css";

function App() {
  return (
    <div>
      <header className="header">SitRight</header>
      <main className="main-content">
        <p>Welcome to SitRight!</p>

        {/* Camera Placeholder */}
        <div className="camera-container">
          <Webcam className="webcam" />
          <canvas className="overlay-canvas"></canvas>
        </div>

        <div className="App">
          
        </div>

      </main>
    </div>
  );
}

export default App;
