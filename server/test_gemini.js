require('dotenv').config();
const { translateUtterances } = require('./services/gemini');

(async () => {
  try {
    const res = await translateUtterances([
      { start: 0, end: 2000, text: "Hello, this is a test." },
      { start: 2000, end: 5000, text: "I am checking if the Gemini model works correctly." }
    ]);
    console.log("SUCCESS:", res);
  } catch (err) {
    console.error("ERROR:", err);
  }
})();
