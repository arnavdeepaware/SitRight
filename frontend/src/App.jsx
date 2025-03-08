import React, { useState } from "react";
import Nav from "./Nav";
import Nav from "./Nav";
import Webcam from "react-webcam";
import Percentage from "./components/Percentage";
import Mascot from "./components/Mascot";
import Percentage from "./Percentage";
import Mascot from "./Mascot";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);

return (
  <div className={light ? 'light' : 'dark'}>
    <Nav />
    <button onClick={toggleTheme}>
    {light ? "🌞" : "🌙"} 
    </button>

      <header className="header">SitRight</header>
      <main className="main-content">
        <p>Welcome to SitRight!</p>

        {/* Camera Feed */}
        <div className="camera-container">
          <Webcam className="webcam" />
          <canvas className="overlay-canvas"></canvas>
        </div>
      {/* Emoji Mascot*/}
        <Mascot postureScore={postureScore} />

      </main>
          {/* Posture Score Display */}
        <Percentage postureScore={postureScore} />
    </div>
  );
}

export default App;