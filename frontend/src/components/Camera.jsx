import React, { useRef } from 'react';
import Webcam from 'react-webcam';

const CameraDisplay = () => {
  const webcamRef = useRef(null);

  return (
    <div>
      <Webcam
        audio={false}
        ref={webcamRef}
        style={{
          width: '640px',
          height: '480px',
        }}
      />
    </div>
  );
};

export default CameraDisplay;