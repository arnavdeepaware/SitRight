import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Nav from './nav.jsx'

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
    
    </div>
  )
}

export default App
