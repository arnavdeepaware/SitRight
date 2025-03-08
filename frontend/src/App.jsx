import React, { useState } from "react";
import Nav from "./nav";
import "./App.css";

function App() {
 HEAD
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
    
    </div>
  )

}

export default App;
