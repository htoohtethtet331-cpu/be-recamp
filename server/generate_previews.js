const { Communicate } = require('edge-tts-universal');
const fs = require('fs');
const path = require('path');

async function generatePreviews() {
  const text = "မင်္ဂလာပါ ဒါက ဒီ prompt အတွက် အသံနမူနာပါ";
  const voices = [
    { name: 'nilar', voice: 'my-MM-NilarNeural' },
    { name: 'thiha', voice: 'my-MM-ThihaNeural' }
  ];

  for (const v of voices) {
    const outputPath = path.join(__dirname, '../client/public/assets', `${v.name}_preview.mp3`);
    try {
      const c = new Communicate(text, { voice: v.voice });
      const audio = [];
      for await (const ch of c.stream()) {
        if (ch.type === 'audio' && ch.data) {
          audio.push(Buffer.from(ch.data));
        }
      }
      const finalBuffer = Buffer.concat(audio);
      fs.mkdirSync(path.join(__dirname, '../client/public/assets'), { recursive: true });
      fs.writeFileSync(outputPath, finalBuffer);
      console.log(`Generated ${outputPath}`);
    } catch (err) {
      console.error(`Failed to generate ${v.name}:`, err);
    }
  }
}

generatePreviews();
