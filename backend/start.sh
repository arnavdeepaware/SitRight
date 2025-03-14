#!/bin/bash
# Start Flask and WebSocket servers

# Flask (port 5000)
python api/main.py &

# WebSocket (port 8765)
python websocket_server.py
