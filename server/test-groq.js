require('dotenv').config();
const fs = require('fs');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
async function main() {
    try {
        const transcript = await groq.audio.transcriptions.create({
            file: fs.createReadStream('/Users/user/Project Recamp/server/uploads/1785678304324-extracted_audio.mp3'),
            model: 'whisper-large-v3',
            response_format: 'verbose_json',
            timestamp_granularities: ['word']
        });
        console.log("Has words?", !!transcript.words);
        if (transcript.words) {
            console.log("Sample word:", transcript.words[0]);
        } else {
            console.log("Has segments?", !!transcript.segments);
            if (transcript.segments) {
                console.log("Sample segment:", transcript.segments[0]);
            }
        }
    } catch (e) { console.error(e.message); }
}
main();
