import Webcam from 'react-webcam';
import React from "react";
import "./App.css";

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
     
     <Nav />
      
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        
      </div>
      
    
  
    <div>
      <header className="header">SitRight</header>
      <main className="main-content">
        <p>Welcome to SitRight!</p>

        {/* Camera Placeholder */}
        <div className="camera-container">
          <Webcam className="webcam" />
          <canvas className="overlay-canvas"></canvas>
          <h1>Camera</h1>
        </div>

        <div className="App">
          
        </div>

      </main>
    </div>

    </>
    );
}

export default App;
