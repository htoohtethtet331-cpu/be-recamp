const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ⚠️ Groq is FORBIDDEN for translation. Translation ONLY uses Gemini API key.
// Groq is only used for transcription (Step 1) for premium users with <25MB files.

// Retry on 429/503 with backoff. 403 = fatal, stop immediately.
// CLAUDE.md: "back off 3s, 10s, 25s ... translation that fails is fatal, not skippable"
async function callGeminiWithRetry(apiKey, prompt, retries = 3) {
  const backoffs = [3000, 10000, 25000];
  const cleanKey = apiKey.trim();

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Abort after 45s to prevent server hang / OOM on slow API responses
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    let response;
    try {
      if (cleanKey.startsWith('AIza')) {
        // Native Google Gemini API
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cleanKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
                maxOutputTokens: 4096,
              },
            }),
          }
        );
      } else {
        // OpenRouter
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cleanKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            temperature: 0.1,
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        if (attempt < retries) {
          console.warn(`[Gemini] Fetch timed out (45s). Retrying attempt ${attempt + 1}/${retries}...`);
          await sleep(3000);
          continue;
        }
        throw new Error('Gemini API timed out after 45s on all retries. Please try again.');
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    // CLAUDE.md: "403 PERMISSION_DENIED — stop immediately, never retry"
    if (response.status === 403) {
      const errText = await response.text();
      throw new Error(`Gemini key rejected: check billing on this project. Details: ${errText}`);
    }

    // CLAUDE.md: "on 429/503, back off 3s, 10s, 25s before giving up"
    if (response.status === 429 || response.status === 503) {
      if (attempt < retries) {
        const wait = backoffs[attempt] || 25000;
        console.warn(`[Gemini] ${response.status} rate limit. Waiting ${wait/1000}s before retry ${attempt + 1}/${retries}...`);
        await sleep(wait);
        continue;
      }
      throw new Error(`Gemini API ${response.status} after ${retries} retries — fatal.`);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errText}`);
    }

    // Parse response content
    let content = '';
    const data = await response.json();

    if (cleanKey.startsWith('AIza')) {
      const parts = data.candidates[0].content.parts;
      // CLAUDE.md: "Gemini 3.x returns THINKING part first — join only parts where thought is not true"
      const textPart = parts.find(p => !p.thought) || parts[0];
      content = textPart.text.trim();
    } else {
      // OpenRouter: strip <think>...</think> reasoning blocks
      content = data.choices[0].message.content
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();
    }

    // Strip markdown code fences if present
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Robust JSON extraction
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }

    // Validate JSON before returning. If invalid, retry automatically.
    try {
      JSON.parse(content);
      return content;
    } catch (e) {
      if (attempt < retries) {
        console.warn(`[Gemini] Invalid JSON string on attempt ${attempt + 1}. Retrying...`);
        await sleep(2000);
        continue;
      }
      throw new Error(`Invalid JSON format after ${retries} retries: ${e.message}`);
    }
  }
}

// translateUtterances — Gemini ONLY (AIza* = native Google, other = OpenRouter)
// ⚠️ groqKeys param is IGNORED — Groq is forbidden for translation.
const translateUtterances = async (utterances, geminiKey) => {
  if (!utterances || utterances.length === 0) return [];
  if (!geminiKey || geminiKey.trim() === '') {
    throw new Error('Gemini API Key မပေးမိသေးပါ။ Admin Panel မှ Gemini API Key ထည့်သွင်းပေးပါ။');
  }

  // Batch size: 10 utterances per request
  // Burmese translations use ~3-4x more tokens than English source,
  // so 10 is safer than 15 to avoid truncation at 4000 max_tokens.
  const BATCH_SIZE = 10;
  const results = [];
  let previousTranslation = '';

  for (let i = 0; i < utterances.length; i += BATCH_SIZE) {
    const batch = utterances.slice(i, i + BATCH_SIZE);

    const textArray = batch.map((u, idx) => {
      const durSec = Math.max((u.end - u.start) / 1000, 0.5);
      const charBudget = Math.round(durSec * 16);
      return `ID: ${i + idx} | Speaker: ${u.speaker || 'A'} | Type: ${u.tag || 'narration'} | Scene: ${durSec.toFixed(1)}s | Budget: ~${charBudget} chars | Text: "${u.text}"`;
    }).join('\n');

    const prompt = `You are a professional video dubbing translator for a TikTok recap video.

TASK: Translate each block into natural spoken Burmese (Myanmar script ONLY — no English, no romanization).

CRITICAL RULES:
1. Translate WHAT IS ACTUALLY SAID. Keep first-person ("I did X") as first-person. Do NOT rewrite into third-person ("the male lead did X").
2. Where characters are talking to each other, translate each person's actual spoken lines — do not flatten into narration.
3. Each block has a "Budget" (target character count for the Burmese output). A faithful translation that runs a little long is acceptable; a choppy one that loses meaning is not.
4. Output must be pure Myanmar script only. No English words, no parenthetical notes.
5. CRITICAL: DO NOT use double quotes (") inside your translations. If you need to quote something, use single quotes ('). Unescaped double quotes will break the JSON parser.
6. SUBTITLE SPLITTING: After each natural sentence or phrase boundary, place a Burmese period (။). This allows the subtitle system to split long translations into short, readable lines. For example, if the text has two ideas: "ပထမအကြောင်းအချက်။ ဒုတိယအကြောင်းအချက်။" — one ။ per phrase. SHORT phrases (1–3 seconds) may have just one phrase with one ။ at the end.

__PREVIOUS_CONTEXT__
OUTPUT FORMAT: Return ONLY a valid JSON object:
{"translations": ["မြန်မာ ၁", "မြန်မာ ၂", ...]}
One string per input ID, in order.

INPUTS:
__TRANSCRIPT__`;

    const finalPrompt = prompt
      .replace('__PREVIOUS_CONTEXT__', previousTranslation
        ? `CONTEXT (last translated line for flow): "${previousTranslation}"\n`
        : '')
      .replace('__TRANSCRIPT__', textArray);

    // Translation: Gemini ONLY
    let content;
    try {
      console.log(`[Gemini] Translating batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(utterances.length / BATCH_SIZE)}...`);
      content = await callGeminiWithRetry(geminiKey.trim(), finalPrompt);
    } catch (err) {
      // Propagate error with clear message for user
      console.error(`[Gemini] FATAL — translation batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err.message);
      throw new Error(`Translation failed: ${err.message}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('[Gemini] JSON parse failed. Raw content:', content.substring(0, 200));
      throw new Error(`Gemini returned invalid JSON: ${e.message}`);
    }

    batch.forEach((u, idx) => {
      const translation = (parsed.translations && parsed.translations[idx]) || u.text;
      results.push({ ...u, translatedText: translation });
    });

    if (parsed.translations && parsed.translations.length > 0) {
      previousTranslation = parsed.translations[parsed.translations.length - 1];
    }

    // CLAUDE.md: "Pace 1s between requests"
    if (i + BATCH_SIZE < utterances.length) {
      await sleep(1000);
    }
  }

  return results;
};

module.exports = { translateUtterances };
