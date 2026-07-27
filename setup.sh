#!/bin/bash
python3 -m pip install --user -r requirements.txt || pip3 install --user -r requirements.txt || pip install --user -r requirements.txt || true
npm install youtubei.js express
