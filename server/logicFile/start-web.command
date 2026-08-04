#!/bin/bash
cd "$(dirname "$0")"

pause_and_exit() {
  echo
  read -p "Press Enter to close this window..."
  exit "$1"
}

PYTHON_BIN="python3"
if [ -x "/opt/homebrew/bin/python3.12" ]; then
  PYTHON_BIN="/opt/homebrew/bin/python3.12"
elif [ -x "/opt/homebrew/bin/python3" ]; then
  PYTHON_BIN="/opt/homebrew/bin/python3"
fi

if [ ! -d ".venv" ]; then
  echo "Setting up (first run only)..."
  "$PYTHON_BIN" -m venv .venv || pause_and_exit 1
fi

source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet assemblyai google-genai edge-tts pydub fastapi "uvicorn[standard]" python-multipart yt-dlp curl_cffi requests || pause_and_exit 1

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install it with: brew install ffmpeg"
  pause_and_exit 1
fi

if [ ! -x "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg" ] && [ ! -x "/usr/local/opt/ffmpeg-full/bin/ffmpeg" ]; then
  echo "ffmpeg-full not found (needed to burn in subtitles). Install it with: brew install ffmpeg-full"
  pause_and_exit 1
fi

echo "Starting Recap Studio at http://localhost:8000"
echo "Close this window (or press Ctrl+C) to stop the server."
echo

( sleep 1.5 && open "http://localhost:8000" ) &

python server.py
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo
  echo "Server stopped with an error - see above."
  pause_and_exit 1
fi
