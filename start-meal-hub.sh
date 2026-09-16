#!/bin/bash

# Shared Meal Planning Hub Startup Script

echo "🍽️  Starting Meal Planning Hub..."
echo ""

# Get local IP
LOCAL_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo "localhost")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 Access from your phones/tablets:"
echo "   http://$LOCAL_IP:3000"
echo ""
echo "💡 Both users can access from WiFi"
echo "🎤 Use voice commands to add items"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start the server
node meal-hub-server.js
