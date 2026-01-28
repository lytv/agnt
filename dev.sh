#!/bin/bash

# AGNT Quick Start Script for Mac
# This script opens two terminal windows: one for the Frontend and one for the Electron App.

echo "🚀 Starting AGNT development environment..."

# 🧹 Cleanup: Kill existing processes on ports 5173, 3333 and related apps
echo "🧹 Cleaning up existing AGNT processes..."
lsof -ti:5173,3333 | xargs kill -9 2>/dev/null
pkill -f "Electron" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1



# Get the current directory
PROJECT_ROOT=$(pwd)

# Function to start a process in a new Terminal window
start_in_new_window() {
    local TITLE=$1
    local CMD=$2
    local DIR=$3
    
    osascript -e "tell application \"Terminal\"
        do script \"cd '$DIR' && $CMD\"
    end tell"
}

# 1. Start Frontend Dev Server
echo "📦 Opening Frontend Dev Server (Port 5173)..."
start_in_new_window "AGNT-Frontend" "npm run dev" "$PROJECT_ROOT/frontend"

# 2. Start Electron App / Backend
echo "🖥️  Opening Electron App (Backend Port 3333)..."
start_in_new_window "AGNT-App" "npm start" "$PROJECT_ROOT"

echo "✅ All components are launching. Check the new terminal windows for logs."
