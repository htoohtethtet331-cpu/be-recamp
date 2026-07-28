const OpenAI = require('openai');

/**
 * Translate an array of utterances to Burmese using OpenRouter (Gemini Model)
 * @param {Array} utterances - Array of objects {start, end, text}
 * @returns {Promise<Array>} - Array with translatedText added
 */
const translateUtterances = async (utterances) => {
  if (!utterances || utterances.length === 0) return [];

  const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
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
    
    return `ID: ${i} | Max Speaking Time: ${maxDuration.toFixed(1)}s | Text: "${u.text}"`;
  }).join('\n');

  const prompt = `You are a professional video dubbing translator. You MUST translate the following English subtitles into natural spoken Burmese (Myanmar script ONLY, NO English, NO phonetic guides).
  
CRITICAL AVOID-OVERLAP CONSTRAINT: For each subtitle, I have calculated the 'Max Speaking Time' in seconds (this is the absolute maximum time before the next person starts speaking). 
If your Burmese translation takes longer to speak than this time, the voices will OVERLAP and ruin the video. 
You MUST provide a translation that can be comfortably spoken aloud within this exact time limit. If the 'Max Speaking Time' is very short (e.g., 1.5s), you MUST use extreme abbreviation, discard polite ending particles, and use the absolute minimum number of syllables to convey the core meaning. Do not translate word-for-word if it makes the sentence long.

Return the result STRICTLY as a valid JSON array of strings, where each string is the translated Burmese text corresponding to the input ID in order. Do NOT wrap the JSON in markdown code blocks. Just return the raw JSON array like this:
[
  "မြန်မာစာသား ၁",
  "မြန်မာစာသား ၂"
]

Inputs:
${textArray}`;

  try {
    const chatCompletion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'google/gemini-2.5-flash',
      temperature: 0.1,
      max_tokens: 8000,
    });

    let content = chatCompletion.choices[0].message.content.trim();
    if (content.startsWith('```json')) content = content.replace(/```json/g, '');
    if (content.endsWith('```')) content = content.replace(/```/g, '');
    
    const parsed = JSON.parse(content);
    
    return utterances.map((u, i) => ({
      ...u,
      translatedText: parsed[i] || u.text
    }));
  } catch (error) {
    console.error("Batch translation failed:", error.message);
    return utterances;
  }
};

module.exports = { translateUtterances };
