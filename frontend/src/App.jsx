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
      
    </>
  )
}

export default App;
