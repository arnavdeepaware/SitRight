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
<<<<<<< HEAD
    
     
      <button onClick={toggleTheme}>
      {light ? "Light" : "Dark"} Mode
      </button>

      <div>
=======
      
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        
      </div>
      
    
  
    <div>
>>>>>>> 324ed7e97b46553a8cea0d5ee6842c6721ca3552
      <header className="header">SitRight</header>
      <main className="main-content">
        <p>Welcome to SitRight!</p>

        {/* Camera Placeholder */}
        <div className="camera-container">
          <Webcam className="webcam" />
          <canvas className="overlay-canvas"></canvas>
<<<<<<< HEAD
=======
          <h1>Camera</h1>
>>>>>>> 324ed7e97b46553a8cea0d5ee6842c6721ca3552
        </div>

        <div className="App">
          
        </div>

      </main>
    </div>
<<<<<<< HEAD
    
    </div>
  )

=======

    </>
    );
>>>>>>> 324ed7e97b46553a8cea0d5ee6842c6721ca3552
}

export default App;
