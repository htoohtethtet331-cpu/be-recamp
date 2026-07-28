# Recap Studio

A web-based video and audio editing tool that automatically extracts audio, transcribes, translates, and generates Burmese Text-to-Speech (TTS) mixed back into the video.

## Local Development
1. Run `npm install` in the root folder to install dependencies for both client and server.
2. In the `server` folder, copy `.env.example` to `.env` and fill in your API keys.
3. Start the application:
   - Backend: `cd server && npm start` (or `node index.js`)
   - Frontend: `cd client && npm run dev`

## Deployment
This project is designed to be easily deployed to **Render** and **Netlify**.

### 1. Backend (Render)
- **Root Directory:** `server`
- **Build Command:** `npm install`
- **Start Command:** `node index.js`
- **Environment Variables:** Set `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` from your `.env` file.

### 2. Frontend (Netlify)
- **Base directory:** `client`
- **Build command:** `npm run build`
- **Publish directory:** `client/dist`
- **Environment Variables:** Set `VITE_API_URL` to your Render backend URL (e.g., `https://your-backend.onrender.com/api`).
