import React, { useState } from "react";
import Nav from "./Nav";
import Webcam from "react-webcam";
import Percentage from "./components/Percentage";
import Mascot from "./components/Mascot";
import "./App.css";

function App() {
  const [postureScore, setPostureScore] = useState(0);
  const [light, setLight] = useState(true);

  const toggleTheme = () => setLight((light) => !light);

  return (
    <div className={light ? 'light' : 'dark'}>
      <Nav />
      <button onClick={toggleTheme}>
        {light ? "🌞" : "🌙"} 
      </button>

      <header className="header">SitRight</header>
      <main className="main-content">
        {/* Wrapper for Webcam & Percentage */}
        <div className="camera-wrapper">
          <Percentage postureScore={postureScore} />
          <div className="camera-container">
            <Webcam className="webcam" />
            <canvas className="overlay-canvas"></canvas>
          </div>
        </div>

        {/* Mascot Positioned to the Right */}
        <Mascot postureScore={postureScore} />
      </main>
    </div>
  );
}

export default App;
