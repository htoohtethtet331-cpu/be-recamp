const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Translate an array of utterances to Burmese using Google Gemini API
 * @param {Array} utterances - Array of objects {start, end, text}
 * @param {string} apiKey - User provided Gemini API Key
 * @returns {Promise<Array>} - Array with translatedText added
 */
const translateUtterances = async (utterances, apiKey) => {
  if (!utterances || utterances.length === 0) return [];
  if (!apiKey) throw new Error("Google Gemini API Key is required.");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    }
  });

  const textArray = utterances.map((u, i) => {
    let maxDuration = (u.end - u.start) / 1000;
    
    // Calculate the maximum possible time before the NEXT utterance starts
    if (i < utterances.length - 1) {
      const nextStart = utterances[i + 1].start / 1000;
      const currentStart = u.start / 1000;
      const gapToNext = nextStart - currentStart;
      
      // If the gap to the next subtitle is larger than the subtitle's own duration,
      // we can give Gemini more breathing room to speak the text.
      if (gapToNext > maxDuration) {
        maxDuration = gapToNext - 0.1; // leave 0.1s buffer to prevent overlap
      }
    }
    
    return `ID: ${i} | Time Frame: ${(u.start / 1000).toFixed(1)}s to ${((u.start / 1000) + maxDuration).toFixed(1)}s (Max Limit: ${maxDuration.toFixed(1)}s) | Text: "${u.text}"`;
  }).join('\n');

  const prompt = `You are a professional video dubbing translator. You MUST translate the following English subtitles into natural spoken Burmese (Myanmar script ONLY, NO English, NO phonetic guides).
  
CRITICAL TIME LIMIT CONSTRAINT: For each subtitle, I have provided the exact Time Frame (e.g. from Second A to Second B) and the Max Limit in seconds. 
If your Burmese translation takes longer to speak than this time, the TTS audio will OVERLAP and ruin the video. 
You MUST provide a translation that fits perfectly within this time frame. If the time limit is very short (e.g., under 2 seconds), you MUST aggressively compress and summarize the Burmese translation (ချုံ့ပေးပါ) so it can be spoken very fast. Discard polite particles and unnecessary words. Do not translate word-for-word.

Return the result STRICTLY as a JSON object with a single key "translations" which contains an array of strings, where each string is the translated Burmese text corresponding to the input ID in order.
Example:
{
  "translations": [
    "မြန်မာစာသား ၁",
    "မြန်မာစာသား ၂"
  ]
}

Inputs:
${textArray}`;

  try {
    const result = await model.generateContent(prompt);
    let content = result.response.text().trim();
    const parsed = JSON.parse(content);
    
    return utterances.map((u, i) => ({
      ...u,
      translatedText: parsed.translations[i] || u.text
    }));
  } catch (error) {
    console.error("Batch translation failed:", error.message);
    throw error;
  }
};

module.exports = { translateUtterances };
