# SitRight - AI-Powered Posture Detection

## Inspiration
Did you know?
On average, people spend 6 hours and 40 minutes in front of a screen daily, and 42% of our waking hours are spent staring at one. Worse yet, 80% of adults will experience back pain at some point in their lives.

As Computer Science majors and Software Engineers, we understand these stats all too well. Our biggest guilt isn't just missing that semicolon or debugging until late at night—it's the posture we adopt while doing it.

We sit for hours, whether we're coding a startup, writing papers, or even gaming—and no matter what we're doing, poor posture is always the result. Slouching has become a silent culprit, damaging our spines and jeopardizing our health, all while we focus on our screens.

So, what's the solution?

Introducing SitRight—an AI-powered posture corrector designed to save your back, boost your focus, and improve your overall health. SitRight helps you maintain healthy posture throughout your work or play, so you can code longer, feel better, and protect your future.

## What it does
- Real-time posture detection using your webcam
- AI-powered analysis of neck and shoulder positioning
- Visual feedback with color-coded indicators
- Customizable posture score threshold
- Audio and visual notifications for poor posture
- Session tracking with detailed analytics
- Interactive charts showing posture trends
- Responsive design that works on any device
- Privacy-focused processing (all data stays local)

## How we built it
- **Frontend**: 
  - Modern HTML5/CSS3 with CSS Grid and Flexbox
  - Vanilla JavaScript for real-time interactions
  - Chart.js for data visualization
  - WebSocket API for real-time communication

- **Backend**:
  - Python with asyncio for asynchronous processing
  - WebSocket server for real-time data streaming
  - MediaPipe for pose detection and landmark tracking
  - TensorFlow/Keras for posture classification
  - scikit-learn for data preprocessing and validation

- **Machine Learning**:
  - Custom neural network architecture
  - Feature engineering for pose landmarks
  - K-Fold cross-validation
  - Real-time inference optimization
  - Data normalization and preprocessing pipeline

## Challenges we ran into
1. **Real-time Performance**: Balancing accurate pose detection with smooth performance
2. **Camera Integration**: Handling different webcam resolutions and aspect ratios
3. **Model Accuracy**: Fine-tuning the ML model to reduce false positives
4. **Cross-browser Compatibility**: Ensuring consistent WebSocket connections
5. **UI Responsiveness**: Creating a fluid experience across different screen sizes

## Accomplishments that we're proud of
- Achieved real-time pose detection at 10 FPS
- Created an intuitive and modern UI/UX design
- Implemented privacy-focused local processing
- Developed accurate posture classification (>90% accuracy)
- Built a fully responsive web application
- Created smooth animations and transitions

## What we learned
- Deep learning model deployment in web applications
- Real-time video processing techniques
- WebSocket implementation for streaming data
- UI/UX design principles for health applications
- Cross-browser compatibility solutions
- Performance optimization strategies

## What's next for SitRight
1. **Mobile App Development**
   - Native iOS and Android applications
   - Background monitoring capabilities

2. **Enhanced Features**
   - Custom posture profiles
   - Exercise recommendations
   - Integration with fitness trackers
   - Team dashboard for office environments

3. **Machine Learning Improvements**
   - More sophisticated pose detection
   - Personalized ML models
   - Additional posture classifications

4. **Enterprise Solutions**
   - Team management features
   - Analytics dashboard
   - Integration with workplace wellness programs

## Try it out
Visit [SitRight Demo](http://localhost:8000) to experience better posture today!

*Note: Requires a webcam and modern web browser*

## Team
- [Team Member 1] - Frontend Development
- [Team Member 2] - Machine Learning
- [Team Member 3] - Backend Development
- [Team Member 4] - UI/UX Design

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
