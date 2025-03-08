import React, { useState } from "react";
import Nav from "./Nav";
import Webcam from "react-webcam";
import "./App.css";

function App() {
 
const [light, setlight] = useState(true)

const toggleTheme = () => {
  setlight(!light);
};

return (
  <div className={light ? 'light' : 'dark'}>

    <Nav />
    <button onClick={toggleTheme}>
    {light ? "Light" : "Dark"} Mode
    </button>

      <header className="header">SitRight</header>
      <main className="main-content">
        <p>Welcome to SitRight!</p>

        {/* Camera Feed */}
        <div className="camera-container">
          <Webcam className="webcam" />
          <canvas className="overlay-canvas"></canvas>
        </div>


      </main>
    </div>
  );
}

export default App;