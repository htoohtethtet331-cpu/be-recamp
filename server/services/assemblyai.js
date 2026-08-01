const Groq = require('groq-sdk');
const fs = require('fs');

/**
 * Transcribe an audio/video file and extract utterances with timestamps
 * Uses Groq Whisper for blazing fast transcription (bypasses AssemblyAI)
 * @param {string} filePath - Path to the local audio/video file
 * @param {string} clientApiKey - Not used anymore, kept for backwards compatibility
 * @returns {Promise<Array>} - Array of utterances [{ start, end, text }]
 */
const getTranscriptAndTimestamps = async (filePath, clientApiKey) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('Groq API Key is missing from .env');
    }

    const groq = new Groq({ apiKey, timeout: 5 * 60 * 1000 }); // 5 minutes timeout


    // Create transcript using Whisper-large-v3 with the provided audio file
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
      language: 'en' // Assuming source is English
    });

    if (!transcription.segments || transcription.segments.length === 0) {
      throw new Error('No speech detected in the video.');
    }

    let segments = transcription.segments;

    // Fix Whisper's tendency to snap the first segment to 0.0s when there is initial silence
    if (segments[0].start === 0 && transcription.words && transcription.words.length > 0) {
      const firstWordStart = transcription.words[0].start;
      if (firstWordStart > 0.3) {
        segments[0].start = firstWordStart;
      }
    }

    // Return the utterances (segments) with start and end times in milliseconds
    return segments.map(u => ({
      start: Math.round(u.start * 1000), // convert seconds to milliseconds
      end: Math.round(u.end * 1000),     // convert seconds to milliseconds
      text: u.text
    }));

  } catch (error) {
    console.error('Error in Groq Whisper transcription:', error);
    throw error;
  }
};

module.exports = { getTranscriptAndTimestamps };
