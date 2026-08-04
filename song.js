import express from 'express';
import cors from 'cors';
import { Communicate } from 'edge-tts-universal';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const VOICES = {
  BB: { voice: 'my-MM-ThihaNeural', pitch: '+0Hz',  rate: '+0%' },
  NL: { voice: 'my-MM-ThihaNeural', pitch: '-12Hz', rate: '+0%' },
  PW: { voice: 'my-MM-ThihaNeural', pitch: '+12Hz', rate: '+3%' },
  KM: { voice: 'my-MM-ThihaNeural', pitch: '-22Hz', rate: '-5%' },
  ZK: { voice: 'my-MM-ThihaNeural', pitch: '+20Hz', rate: '+6%' },
  HS: { voice: 'my-MM-NilarNeural', pitch: '+0Hz',  rate: '+0%' },
  SL: { voice: 'my-MM-NilarNeural', pitch: '-10Hz', rate: '+0%' },
  YS: { voice: 'my-MM-NilarNeural', pitch: '+12Hz', rate: '+3%' },
  EC: { voice: 'my-MM-NilarNeural', pitch: '-18Hz', rate: '-5%' },
  TS: { voice: 'my-MM-NilarNeural', pitch: '+20Hz', rate: '+6%' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TICK = 10000;

// ===== ချိန်ညှိရန် =====
const MAX_CHARS = 28;   // တစ်ကြောင်း အများဆုံး စာလုံးရေ
const MIN_CHARS = 10;   // ဖြတ်ခွင့်ရဖို့ အနည်းဆုံး
const MIN_BLOCK_MS = 700;
const MAX_BLOCK_MS = 5000;

function chunkText(text, size = 800) {
  const parts = [];
  const sentences = text.split(/(?<=။|၊|\.|\?|!)\s*/);
  let buf = '';
  for (const s of sentences) {
    if (!s) continue;
    if ((buf + s).length > size && buf) { parts.push(buf); buf = s; }
    else buf += s;
  }
  if (buf.trim()) parts.push(buf);
  return parts.length ? parts : [text];
}

async function synth(text, opts, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const c = new Communicate(text, opts);
      const audio = [];
      const words = [];
      for await (const ch of c.stream()) {
        if (ch.type === 'audio' && ch.data) {
          audio.push(Buffer.from(ch.data));
        } else if (ch.type === 'WordBoundary' || ch.type === 'SentenceBoundary') {
          words.push({
            text: ch.text || '',
            start: Math.round(ch.offset / TICK),
            end: Math.round((ch.offset + ch.duration) / TICK),
          });
        }
      }
      return { audio: Buffer.concat(audio), words };
    } catch (e) {
      console.error(`try ${i}:`, e.message);
      if (i === tries) throw e;
      await sleep(1000 * i);
    }
  }
}

// ---- စာလုံးတစ်လုံးချင်း အချိန် တွက် ----
function buildCharTimeline(words) {
  const chars = [];
  for (const w of words) {
    const t = w.text || '';
    if (!t.length) continue;
    const span = Math.max(w.end - w.start, 1);
    for (let i = 0; i < t.length; i++) {
      chars.push({
        c: t[i],
        start: w.start + Math.round((i / t.length) * span),
        end: w.start + Math.round(((i + 1) / t.length) * span),
      });
    }
  }
  return chars;
}

// မြန်မာ သရ/ဗျည်းတွဲ အလယ်မှာ မဖြတ်အောင်
const COMBINING =
  /[\u102B-\u103F\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F\u109A-\u109D]/;

function canBreak(chars, i) {
  if (i <= 0 || i >= chars.length) return false;
  if (COMBINING.test(chars[i].c)) return false;
  if (chars[i - 1].c === '\u1039') return false;
  return true;
}

function buildBlocks(chars, maxChars, minChars) {
  const blocks = [];
  let start = 0;
  for (let i = 1; i <= chars.length; i++) {
    const len = i - start;
    const prev = chars[i - 1].c;
    const dur = chars[i - 1].end - chars[start].start;
    const atEnd = i === chars.length;

    const hardPunct = /[။!?\u104B]/.test(prev);
    const softPunct = /[၊,\u104A]/.test(prev);
    const isSpace = /\s/.test(prev);

    let cut = false;
    if (atEnd) cut = true;
    else if (hardPunct && len >= minChars) cut = true;
    else if (softPunct && len >= maxChars * 0.65) cut = true;
    else if (isSpace && len >= maxChars * 0.7) cut = true;
    else if (dur >= MAX_BLOCK_MS && canBreak(chars, i)) cut = true;
    else if (len >= maxChars && canBreak(chars, i)) cut = true;

    if (cut) { blocks.push(chars.slice(start, i)); start = i; }
  }
  return blocks.filter((b) => b.length && b.map((x) => x.c).join('').trim());
}

function ms2srt(ms) {
  if (ms < 0) ms = 0;
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  const x = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${x}`;
}

function toSRT(words, maxChars, minChars) {
  const chars = buildCharTimeline(words);
  const blocks = buildBlocks(chars, maxChars, minChars);
  const out = [];
  let prevEnd = 0;
  blocks.forEach((b, i) => {
    let start = Math.max(b[0].start, prevEnd + 1);
    let end = b[b.length - 1].end;
    if (end - start < MIN_BLOCK_MS) end = start + MIN_BLOCK_MS;
    prevEnd = end;
    const text = b.map((x) => x.c).join('').replace(/\s+/g, ' ').trim();
    out.push(`${i + 1}\n${ms2srt(start)} --> ${ms2srt(end)}\n${text}\n`);
  });
  return out.join('\n');
}

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/voices', (req, res) => res.json(VOICES));

async function run(req) {
  const {
    text, preset,
    voice = 'my-MM-ThihaNeural',
    rate = '+0%', pitch = '+0Hz', volume = '+0%',
  } = req.body || {};
  if (!text || !text.trim()) throw new Error('text is required');

  const base = preset && VOICES[preset] ? VOICES[preset] : { voice, rate, pitch };
  const opts = {
    voice: base.voice,
    rate: rate !== '+0%' ? rate : base.rate,
    pitch: pitch !== '+0Hz' ? pitch : base.pitch,
    volume,
  };

  const parts = chunkText(text);
  const audioBufs = [];
  const allWords = [];
  let offset = 0;

  for (let i = 0; i < parts.length; i++) {
    const r = await synth(parts[i], opts);
    if (r.audio.length) audioBufs.push(r.audio);
    for (const w of r.words) {
      allWords.push({ text: w.text, start: w.start + offset, end: w.end + offset });
    }
    if (r.words.length) offset = allWords[allWords.length - 1].end + 120;
    if (i < parts.length - 1) await sleep(300);
  }

  if (!audioBufs.length) throw new Error('empty audio from TTS service');
  return { audio: Buffer.concat(audioBufs), words: allWords };
}

app.post('/tts', async (req, res) => {
  try {
    const { audio } = await run(req);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/tts-srt', async (req, res) => {
  try {
    const maxChars = Number(req.body?.max_chars) || MAX_CHARS;
    const minChars = Number(req.body?.min_chars) || MIN_CHARS;
    const { audio, words } = await run(req);
    res.json({
      audio: audio.toString('base64'),
      srt: toSRT(words, maxChars, minChars),
      duration_ms: words.length ? words[words.length - 1].end : 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.listen(process.env.PORT || 8080, () =>
  console.log('Myanmar TTS + SRT v2 running')
);
