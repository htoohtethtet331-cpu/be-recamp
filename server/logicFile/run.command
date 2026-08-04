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
pip install --quiet assemblyai google-genai edge-tts pydub || pause_and_exit 1

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found. Install it with: brew install ffmpeg"
  pause_and_exit 1
fi

if [ ! -x "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg" ] && [ ! -x "/usr/local/opt/ffmpeg-full/bin/ffmpeg" ]; then
  echo "ffmpeg-full not found (needed to burn in subtitles). Install it with: brew install ffmpeg-full"
  pause_and_exit 1
fi

VIDEO_PATH=$(osascript -e 'POSIX path of (choose file with prompt "Select a video to dub into Burmese" of type {"public.movie"})' 2>/dev/null)

if [ -z "$VIDEO_PATH" ]; then
  echo "No file selected."
  pause_and_exit 0
fi

echo "Processing: $VIDEO_PATH"
echo

python app.py "$VIDEO_PATH"
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo
  echo "Something went wrong - see the error above."
  pause_and_exit 1
fi

DIR=$(dirname "$VIDEO_PATH")
BASE=$(basename "$VIDEO_PATH")
STEM="${BASE%.*}"
OUTPUT="$DIR/$STEM-mm.mp4"

if [ -f "$OUTPUT" ]; then
  open -R "$OUTPUT"
else
  echo "Expected output not found at: $OUTPUT"
  pause_and_exit 1
fi

exit 0
