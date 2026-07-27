#!/bin/bash
# Install Node.js dependencies
npm install youtubei.js express

# Try to install Python dependencies if possible, but don't fail if pip is missing
python3 -m pip install -r requirements.txt --user || true
