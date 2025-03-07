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
        <div className="camera-placeholder">
          <p>Camera Feed Will Appear Here</p>
        </div>

        <div className="App">
          <CameraDisplay />
        </div>

      </main>
    </div>
  );
}

export default App;
