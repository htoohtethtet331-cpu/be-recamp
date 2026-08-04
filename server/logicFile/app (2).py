#!/usr/bin/env python3
"""Recap Pro: TikTok recap video -> Burmese-dubbed mp4. See CLAUDE.md.

Usage: python app.py <video_path> [options_json_path]
options_json_path is optional - without it, defaults apply (dubbing mode,
Thiha voice, +30% rate, standard/neutral style). See DEFAULT_OPTIONS.
"""

import asyncio
import json
import math
import re
import subprocess
import sys
import tempfile
import time
import traceback
import unicodedata
from pathlib import Path

import assemblyai as aai
import edge_tts
from google import genai
from google.genai import types as genai_types
from pydub import AudioSegment

SCRIPT_DIR = Path(__file__).resolve().parent
FONTS_DIR = SCRIPT_DIR / "fonts"


def _find_ffmpeg_binary(name):
    """The plain Homebrew ffmpeg formula is built without libass/fontconfig,
    so it has no subtitles filter at all. ffmpeg-full (installed alongside,
    kept keg-only so it doesn't touch the system-wide ffmpeg symlink) has
    both - use it explicitly if present, otherwise fall back to PATH."""
    for prefix in ("/opt/homebrew/opt/ffmpeg-full", "/usr/local/opt/ffmpeg-full"):
        candidate = Path(prefix) / "bin" / name
        if candidate.exists():
            return str(candidate)
    return name


FFMPEG_BIN = _find_ffmpeg_binary("ffmpeg")
FFPROBE_BIN = _find_ffmpeg_binary("ffprobe")

# ---- options a caller (the web UI, or a hand-written JSON file) can set;
# CLI usage with no options file gets these defaults untouched. ----
DEFAULT_OPTIONS = {
    "mode": "dubbing",              # "dubbing" | "ai_recap" | "subtitle_only"
    "voice": "my-MM-ThihaNeural",
    "voice_speed": 1.30,            # -> edge-tts rate, e.g. 1.30 => "+30%"
    "recap_length": "standard",     # "short" | "standard" | "detailed"
    "recap_tone": "neutral",        # "conversational" | "dramatic" | "neutral"
    "watermark": "",                # stored only - not rendered yet
    "aspect": "original",           # "original" | "9:16" | "3:4" | "1:1" | "custom"
    "aspect_mode": "fill",          # "fill" (cover+crop, no bars) | "fit" (contain+pad, black bars)
    "aspect_custom_w": 4,           # only used when aspect == "custom"
    "aspect_custom_h": 5,
    "subtitles_enabled": True,
    "subtitle_mode": "burn",              # "burn" | "file"
    "subtitle_font": "Noto Sans Myanmar", # family name - built-in default, or one scanned from fonts/
    "subtitle_font_size": "medium",       # "small" | "medium" | "large"
    "subtitle_color": "white",            # "white" | "yellow" | "black"
    "subtitle_position": "bottom",        # "bottom" | "middle" | "custom"
    "subtitle_custom_box": {"x": 0.10, "y": 0.78, "width": 0.80},  # fractions of frame
    "subtitle_background": "none",        # "none" | "transparent" | "solid"
    "blur_enabled": False,
    # up to 3: [{"x","y","width","height","strength","style"}], style is
    # "smooth" (default) | "mosaic" | "remove" - each box picks its own.
    "blur_boxes": [],
    "intro_outro_enabled": False,
    "intro_path": None,   # set by the server from its own upload tracking, not the client's JSON body
    "outro_path": None,
    "auto_color": False,
    "flip_video": False,  # horizontal mirror
}


def load_options(path):
    opts = dict(DEFAULT_OPTIONS)
    if path:
        p = Path(path)
        if p.exists():
            try:
                user_opts = json.loads(p.read_text())
                for k in DEFAULT_OPTIONS:
                    if k in user_opts and user_opts[k] is not None:
                        opts[k] = user_opts[k]
            except Exception as e:
                print(f"warning: could not read options file ({e}); using defaults")
    return opts


def speed_to_rate(voice_speed):
    pct = round((float(voice_speed) - 1.0) * 100)
    sign = "+" if pct >= 0 else ""
    return f"{sign}{pct}%"


# ---- fixed pipeline constants (no user-facing options beyond the above) ----
VOICE = DEFAULT_OPTIONS["voice"]
TTS_RATE = speed_to_rate(DEFAULT_OPTIONS["voice_speed"])
GEMINI_MODEL = "gemini-3.6-flash"
BATCH_SIZE = 35
MAX_OUTPUT_TOKENS = 16384
GEMINI_PACE_SECONDS = 1
GEMINI_BACKOFFS = [3, 10, 25]
ABORT_UNTRANSLATED_FRACTION = 0.15

# Scene-level block grouping (dubbing / subtitle_only): a new block starts at
# every speaker-turn change (from AssemblyAI diarization) - that's what makes
# a dialogue exchange come out as adjacent short blocks instead of one merged
# blob. Within a single uninterrupted speaker run, still cap block length so
# one monologue doesn't become one giant block.
SCENE_MIN_SEC = 3.0
SCENE_MAX_SEC = 10.0
SCENE_PAUSE_MS = 900
SENTENCE_END_CHARS = set(".!?。!?")
CLAUSE_BREAK_CHARS = set(",，、;；:：")
BAD_LINE_CPS = 45

# Burmese at +30% edge-tts speed reads at roughly this many characters per
# second - used as a length target, not a hard limit (fit logic absorbs some
# overshoot rather than forcing Gemini to chop dialogue short to hit it).
SCENE_CPS = 16

LENGTH_MULTIPLIERS = {"short": 0.7, "standard": 1.0, "detailed": 1.3}
LENGTH_INSTRUCTIONS = {
    "short": "Keep it tight - hit only the essential story beats, trim anything minor.",
    "standard": "",
    "detailed": "Include more descriptive detail and texture - don't skip nuance for brevity.",
}
TONE_INSTRUCTIONS = {
    "conversational": "Tone: casual, natural spoken Burmese, like telling a friend what happened.",
    "dramatic": "Tone: dramatic and heightened - lean into tension, urgency and emotion where the scene calls for it.",
    "neutral": "Tone: plain and matter-of-fact - minimal embellishment, just the events.",
}


def style_instruction(recap_length, tone):
    parts = [LENGTH_INSTRUCTIONS.get(recap_length, ""), TONE_INSTRUCTIONS.get(tone, "")]
    return "\n".join(p for p in parts if p)


# Dubbing's own adaptive fit bounds (see fit_global_timing). Voice speed is
# synthesized once at the fixed +30% baseline (rate=TTS_RATE) and only ever
# pushed faster from there via post-hoc tempo, up to this ceiling - it never
# goes slower than +30%. (ai_recap has no such bounds - see process_ai_recap:
# the video's speed is simply set to make its duration match the voice
# exactly, and the voice's own speed is never adjusted after synthesis.)
DUB_VOICE_SPEED_MAX_PCT = 45.0
DUB_VIDEO_SPEED_MIN = 0.90
DUB_VIDEO_SPEED_MAX = 1.10

# Dubbing: a join fade in this range removes the click at a clip boundary
# without sounding like a hard chop (see build_voice_track).
JOIN_FADE_MS = 70

# Dubbing captions/TTS phrasing: Gemini gives us reliable WORD-level
# segmentation (see PROMPT_TEMPLATE); clustering those words into short
# breath-group phrases is done here in Python instead, since asking Gemini
# to directly emit correctly-counted 3-6-word phrase spacing proved
# unreliable in practice (it collapsed toward spacing almost every word).
# The resulting chunks serve TWO purposes: (1) each chunk's words are
# joined with NO space for TTS (see synthesize_blocks) so edge-tts speaks
# it as one continuous phrase - a space is placed only BETWEEN chunks, so
# the voice only pauses at real phrase boundaries, not every word; (2) each
# chunk becomes one caption entry, timed from that phrase's own real
# WordBoundary event (see build_word_timed_entries).
MIN_CHUNK_WORDS = 3
MAX_CHUNK_WORDS = 6
BURMESE_PARTICLES = {
    "ကို", "မှာ", "မှ", "က", "ရဲ့", "၏", "နဲ့", "နှင့်", "ပါ", "လို့", "တဲ့",
    "သည်", "ကြ", "တယ်", "ခဲ့", "လျှင်", "ရင်", "လား", "အတွက်", "ဆိုတာ",
    "ဘူး", "ချင်", "မယ်", "မလဲ", "လေ", "ရော", "တော့", "ပဲ", "လိုက်", "သူ",
}
# Burmese and ASCII sentence/clause punctuation - always forces a chunk
# break (never straddled), even short of MIN_CHUNK_WORDS.
BREAK_PUNCT_CHARS = set("၊။,.!?;:")

SRT_WORDS_MIN = 5
SRT_WORDS_MAX = 7

# Dubbing captions: each block's translation is now one continuous phrase
# (occasionally two, split by a single space between clauses - see
# PROMPT_TEMPLATE), so each space-separated token IS already a caption-sized
# chunk and lines up 1:1 with its own edge-tts WordBoundary event (see
# build_word_timed_entries). SRT_WORDS_MIN/MAX above is unrelated - that's
# proportional-estimate chunking still used by ai_recap/subtitle_only.

# Original-language sentence-end punctuation, used only to find a clean
# place to split a very long transcript into 2-3 translation chunks
# (ai_recap mode).
LONG_TRANSCRIPT_2_CHUNKS_WORDS = 1000
LONG_TRANSCRIPT_3_CHUNKS_WORDS = 2000

# Burmese sentence-end punctuation, used to split the finished ai_recap
# narration into TTS-sized pieces (a technical limit, not a timing decision).
BURMESE_SENTENCE_END = "။"
MAX_SENTENCE_CHARS = 250

# Hardsub styling - sized as a fraction of video height so it holds up across
# resolutions, not just this one test clip. Small/Medium/Large map to real
# px at render time (computed from the actual video height), rather than a
# fixed number that would look wildly different across resolutions.
SUBTITLE_FONT_NAME = "Noto Sans Myanmar"
SUBTITLE_FONTSIZE_RATIOS = {"small": 0.032, "medium": 0.045, "large": 0.058}
SUBTITLE_OUTLINE_RATIO = 0.05
SUBTITLE_MARGIN_V_RATIO = 0.12
SUBTITLE_COLOR_ASS = {
    "white": "&H00FFFFFF",
    "yellow": "&H0000DDFF",  # ASS is &HAABBGGRR - blue=00,green=DD,red=FF -> vivid gold-yellow, not flat FFFF00
    "black": "&H00000000",
}
# Yellow's thin default outline reads as washed-out against bright footage -
# a bit thicker keeps the vivid fill crisp without looking like a heavy box.
SUBTITLE_YELLOW_OUTLINE_RATIO = 0.08

# gblur sigma range the 0-100 "Blur Strength" slider maps onto, for the
# default "smooth" blur style. Uses ffmpeg's true multi-pass Gaussian
# filter (gblur), not boxblur - a single/double box blur pass leaves
# faint directional streaks (box blur's flat-top kernel approximates a
# gaussian only coarsely); gblur's own multi-step IIR approximation reads
# as an even, creamy falloff instead. steps=3 is a light "second pass"
# for that smoothness without the cost of the max (6). Range calibrated
# to roughly match the old boxblur radius range's effective strength
# (radius 20-24 fully obscured text/detail without a flat frosted slab).
GBLUR_MIN_SIGMA = 3
GBLUR_MAX_SIGMA = 20
GBLUR_STEPS = 3

# Mosaic block-size (px) range the same strength slider maps onto for the
# "mosaic" blur style - bigger blocks read as a stronger/chunkier censor.
MOSAIC_MIN_BLOCK = 6
MOSAIC_MAX_BLOCK = 36
# Feather inset/blur radius as a fraction of the box's shorter side - how
# far the smooth/mosaic content fades into the surrounding video at each
# edge, so there's no visible rectangle boundary. Does not apply to
# "remove" (delogo blends its own edges). Kept comfortably under
# _safe_boxblur_radius's ~25%-of-min-dimension ffmpeg ceiling.
BLUR_FEATHER_RATIO = 0.20
DEFAULT_BLUR_STYLE = "smooth"

# A light, fixed contrast/saturation lift - not a real adaptive "auto levels",
# just a mild, safe-looking enhancement pass, applied only when requested.
AUTO_COLOR_FILTER = "eq=contrast=1.08:saturation=1.15:brightness=0.01"


def load_env(path):
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def run(cmd, **kwargs):
    kwargs.setdefault("check", True)
    return subprocess.run(cmd, **kwargs)


def ffprobe_duration(path):
    out = run(
        [FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    return float(out.stdout.strip())


def probe_dimensions(path):
    out = run(
        [FFPROBE_BIN, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", str(path)],
        capture_output=True, text=True,
    )
    w, h = out.stdout.strip().split("x")
    return int(w), int(h)


ASPECT_RATIOS = {"9:16": (9, 16), "3:4": (3, 4), "1:1": (1, 1)}


def compute_aspect_reframe(width, height, target_ratio, fill_mode):
    """Reframes (width, height) to target_ratio (a plain float, tw/th) and
    returns (new_width, new_height, ffmpeg_filter_fragment). Concrete pixel
    values are computed here (not left to ffmpeg runtime expressions) so
    that every downstream sizing calculation (subtitle font size, blur box
    fractions, ASS PlayResX/Y - all fractions of width/height) can just use
    the returned new_width/new_height and stay correct with zero further
    changes, exactly like they already do for the un-reframed source size.

    fill_mode "fill": cover + center-crop the overflow - no black bars, the
    LARGER source dimension (relative to the target shape) is cropped down.
    fill_mode "fit": contain + pad with black bars, keeping the whole frame
    visible - the SMALLER source dimension is padded up. Fit is fill's
    mirror image: whichever dimension fill would crop, fit pads instead."""
    source_ratio = width / height
    if fill_mode == "fit":
        if source_ratio > target_ratio:
            new_w, new_h = width, max(2, round(width / target_ratio / 2) * 2)
        else:
            new_w, new_h = max(2, round(height * target_ratio / 2) * 2), height
        pad_x = max(0, (new_w - width) // 2)
        pad_y = max(0, (new_h - height) // 2)
        return new_w, new_h, f"pad={new_w}:{new_h}:{pad_x}:{pad_y}:color=black"
    else:  # "fill" (default)
        if source_ratio > target_ratio:
            new_w, new_h = max(2, round(height * target_ratio / 2) * 2), height
        else:
            new_w, new_h = width, max(2, round(width / target_ratio / 2) * 2)
        crop_x = max(0, (width - new_w) // 2)
        crop_y = max(0, (height - new_h) // 2)
        return new_w, new_h, f"crop={new_w}:{new_h}:{crop_x}:{crop_y}"


def extract_wav(video_path, out_wav):
    run([
        FFMPEG_BIN, "-y", "-i", str(video_path),
        "-vn", "-ac", "1", "-ar", "16000",
        str(out_wav),
    ], capture_output=True)


def transcribe(wav_path, api_key):
    aai.settings.api_key = api_key
    config = aai.TranscriptionConfig(language_detection=True, speaker_labels=True)
    transcript = aai.Transcriber(config=config).transcribe(str(wav_path))
    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(f"AssemblyAI error: {transcript.error}")
    words = transcript.words or []
    lang = getattr(transcript, "language_code", None)
    if lang is not None and not isinstance(lang, str):
        lang = getattr(lang, "value", str(lang))
    return words, lang


def words_to_text(words, language_code):
    join_sep = "" if language_code and language_code.startswith("zh") else " "
    return join_sep.join(w.text for w in words)


# ============================================================
# Dubbing / subtitle_only: scene-anchored block grouping
# ============================================================

def group_scene_blocks(words, language_code):
    """A block ends whenever the speaker changes (a real turn boundary from
    diarization - this is what makes a back-and-forth come out as adjacent
    short blocks instead of one merged narration blob), or - within one
    speaker's uninterrupted run - at a sentence end/pause once it's grown
    past SCENE_MAX_SEC, so a long monologue still gets cut into scenes."""
    join_sep = "" if language_code and language_code.startswith("zh") else " "
    blocks = []
    cur = []
    cur_speaker = object()  # sentinel, never equals a real speaker label

    def flush():
        if not cur:
            return
        start_ms = cur[0].start
        end_ms = cur[-1].end
        text = join_sep.join(w.text for w in cur)
        speakers = [getattr(w, "speaker", None) for w in cur]
        speaker = max(set(speakers), key=speakers.count)
        blocks.append({
            "start": start_ms / 1000.0, "end": end_ms / 1000.0,
            "text": text, "speaker": speaker,
        })

    n = len(words)
    for i, w in enumerate(words):
        speaker = getattr(w, "speaker", None)
        if cur and speaker != cur_speaker:
            flush()
            cur = []
        cur.append(w)
        cur_speaker = speaker

        is_last = (i + 1 == n)
        if is_last:
            flush()
            cur = []
            continue

        next_speaker = getattr(words[i + 1], "speaker", None)
        if next_speaker != speaker:
            continue  # let the top-of-loop check close this block next iter

        dur_so_far = (w.end - cur[0].start) / 1000.0
        last_char = w.text[-1] if w.text else ""
        is_natural_break = (
            last_char in SENTENCE_END_CHARS
            or last_char in CLAUSE_BREAK_CHARS
            or (words[i + 1].start - w.end) >= SCENE_PAUSE_MS
        )
        if dur_so_far >= SCENE_MAX_SEC:
            flush()  # hard cap: cut even mid-clause rather than run away
            cur = []
        elif is_natural_break and dur_so_far >= SCENE_MIN_SEC:
            flush()
            cur = []
    flush()

    good = []
    for b in blocks:
        dur = max(b["end"] - b["start"], 0.01)
        cps = len(b["text"]) / dur
        if cps <= BAD_LINE_CPS:
            good.append(b)
        else:
            print(f"  dropping bad block (cps={cps:.1f}): {b['text'][:50]!r}")
    return good


def classify_dialogue(blocks):
    """A block sits inside a back-and-forth exchange if its speaker differs
    from the block immediately before or after it (a turn boundary on at
    least one side). A block surrounded by the same speaker on both sides -
    or the only speaker in the whole video - is narration."""
    n = len(blocks)
    for i, b in enumerate(blocks):
        prev_speaker = blocks[i - 1]["speaker"] if i > 0 else None
        next_speaker = blocks[i + 1]["speaker"] if i + 1 < n else None
        differs_prev = i > 0 and b["speaker"] != prev_speaker
        differs_next = i + 1 < n and b["speaker"] != next_speaker
        b["is_dialogue"] = bool(differs_prev or differs_next)


def compute_scene_spans(blocks, video_duration):
    n = len(blocks)
    for i, b in enumerate(blocks):
        b["scene_start"] = b["start"]
        b["scene_end"] = blocks[i + 1]["start"] if i + 1 < n else video_duration
        b["scene_end"] = max(b["scene_end"], b["scene_start"] + 0.05)
        b["scene_duration"] = b["scene_end"] - b["scene_start"]


def compute_budgets(blocks, length_mult=1.0):
    for b in blocks:
        b["max_chars"] = max(10, round(b["scene_duration"] * SCENE_CPS * length_mult))


PROMPT_TEMPLATE = """You are translating a TikTok movie/drama recap video into Burmese, block by block, in order.

Translate FAITHFULLY what is actually said - keep whatever person/perspective the original uses. A lot of these
videos are told in first person by one character narrating their own story ("I did X, then Y happened to me") -
if that's what the original says, the Burmese must also be first person ("I"/"my"), NOT rewritten into third
person like "the male lead" or "he". Never convert direct speech into a third-person description of someone
speaking.

Each row below is tagged narration or dialogue based on real speaker-turn data from the audio:
- NARRATION: one continuous speaker (could be first-person storytelling, could be commentary - translate exactly
  the person/tense/perspective used, do not flatten it into generic third-person recap-narrator style).
- DIALOGUE: this row sits at a turn boundary next to a DIFFERENT speaker (tagged with a speaker id) - a real
  back-and-forth. Translate it as the actual line that speaker says - direct speech, kept as part of the exchange,
  not summarized. Consecutive dialogue rows with different speaker ids are a real conversation - keep that
  exchange feel, each turn as its own line. Do NOT write speaker names/labels into your translation - only the
  actual words said.

__STYLE__

__PREV_CONTEXT__

Rules:
- Faithful to what's actually said/meant and to who is speaking. Never merge multiple rows into one, never invent
  content, never add a narrator's framing that isn't in the original.
- Write each translation as ONE smooth, complete, natural spoken Burmese sentence (two only if the row genuinely
  contains two separate clauses/sentences worth of speech) - never rewritten into third-person or otherwise altered
  from what's actually said.
- Insert a space between each Burmese word (word-segmented). This is the one formatting job this step needs from
  you - grouping the words into short phrases for speech/captions happens afterward from this word segmentation, so
  segment every word, don't guess at phrase groupings yourself.
- Each translation has a max_chars target (roughly how long that block's scene lasts on screen). Get close to it,
  but a faithful, natural line that runs a bit long is better than one chopped short to fit - there is some
  playback flexibility to absorb a slightly long line. Do not pad with filler.
- Return ONLY a JSON array of strings. It must have exactly the same number of elements as the input rows, in the
  same order, with no extra commentary and no markdown fences.

Input rows (format: index | type | max_chars | original text):
__ROWS__
"""


def build_prompt(batch, prev_text, style_text):
    rows = []
    for i, b in enumerate(batch):
        if b["is_dialogue"]:
            tag = f"dialogue speaker={b['speaker']}"
        else:
            tag = "narration"
        rows.append(f"{i} | {tag} | {b['max_chars']} | {b['text']}")
    if prev_text:
        prev_context = (
            f'The previous block was translated (in Burmese) as: "{prev_text}"\n'
            "Continue naturally from there - do not repeat it."
        )
    else:
        prev_context = "This is the first block."
    prompt = PROMPT_TEMPLATE.replace("__STYLE__", style_text)
    prompt = prompt.replace("__PREV_CONTEXT__", prev_context)
    return prompt.replace("__ROWS__", "\n".join(rows))


def extract_json_array(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


class GeminiFatalError(Exception):
    pass


class GeminiTranslator:
    def __init__(self, keys, model):
        if not keys:
            raise RuntimeError("no Gemini API keys provided")
        self.clients = [genai.Client(api_key=k) for k in keys]
        self.model = model
        self.key_idx = 0

    def _call(self, prompt, json_mode):
        last_err = None
        for attempt in range(len(GEMINI_BACKOFFS) + 1):
            client = self.clients[self.key_idx % len(self.clients)]
            self.key_idx += 1
            try:
                config_kwargs = {"max_output_tokens": MAX_OUTPUT_TOKENS}
                if json_mode:
                    config_kwargs["response_mime_type"] = "application/json"
                resp = client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=genai_types.GenerateContentConfig(**config_kwargs),
                )
                parts = resp.candidates[0].content.parts or []
                text = "".join(
                    p.text for p in parts
                    if p.text and not getattr(p, "thought", False)
                )
                if not text.strip():
                    raise ValueError("empty response after filtering thought parts")
                return text
            except GeminiFatalError:
                raise
            except Exception as e:
                code = getattr(e, "code", None)
                status = getattr(e, "status", None)
                if code == 403 or status == "PERMISSION_DENIED":
                    raise GeminiFatalError(
                        "Gemini key rejected: check billing on this project"
                    ) from e
                last_err = e
                if attempt < len(GEMINI_BACKOFFS):
                    wait = GEMINI_BACKOFFS[attempt]
                    print(f"    attempt {attempt + 1} failed ({e}); "
                          f"backing off {wait}s and rotating key")
                    time.sleep(wait)
        raise RuntimeError(f"request failed after all retries: {last_err}")

    def translate_batch(self, batch, prev_text, style_text):
        text = self._call(build_prompt(batch, prev_text, style_text), json_mode=True)
        data = extract_json_array(text)
        if len(data) != len(batch):
            raise ValueError(f"expected {len(batch)} translations, got {len(data)}")
        return data

    def translate_narration(self, transcript_text, prev_text):
        text = self._call(
            build_narration_prompt(transcript_text, prev_text),
            json_mode=False,
        )
        return extract_narration_text(text)


def translate_blocks(blocks, keys, style_text):
    translator = GeminiTranslator(keys, GEMINI_MODEL)
    batches = [blocks[i:i + BATCH_SIZE] for i in range(0, len(blocks), BATCH_SIZE)]
    prev_text = ""
    failed_batches = []
    for bi, batch in enumerate(batches):
        n_dialogue = sum(1 for b in batch if b["is_dialogue"])
        print(f"  translating batch {bi + 1}/{len(batches)} "
              f"({len(batch)} blocks, {n_dialogue} dialogue)")
        try:
            translations = translator.translate_batch(batch, prev_text, style_text)
            for b, t in zip(batch, translations):
                b["translation"] = t
            if translations:
                prev_text = translations[-1]
        except GeminiFatalError:
            raise
        except Exception as e:
            print(f"  batch {bi + 1} failed, will retry at end: {e}")
            failed_batches.append(batch)
        time.sleep(GEMINI_PACE_SECONDS)

    for bi, batch in enumerate(failed_batches):
        print(f"  retrying failed batch {bi + 1}/{len(failed_batches)}")
        try:
            translations = translator.translate_batch(batch, prev_text, style_text)
            for b, t in zip(batch, translations):
                b["translation"] = t
            if translations:
                prev_text = translations[-1]
        except GeminiFatalError:
            raise
        except Exception as e:
            print(f"  retry failed, dropping these blocks: {e}")
        time.sleep(GEMINI_PACE_SECONDS)

    untranslated = [b for b in blocks if "translation" not in b]
    if blocks and len(untranslated) / len(blocks) > ABORT_UNTRANSLATED_FRACTION:
        raise RuntimeError(
            f"{len(untranslated)}/{len(blocks)} blocks untranslated "
            f"(> {ABORT_UNTRANSLATED_FRACTION * 100:.0f}%) - aborting"
        )
    if untranslated:
        print(f"  {len(untranslated)}/{len(blocks)} blocks untranslated, dropping them")
    return [b for b in blocks if "translation" in b]


async def _synth(text, out_path, voice, rate, metadata_path=None):
    """metadata_path, when given, requests WordBoundary events (instead of
    the default SentenceBoundary) and saves them as JSONL alongside the
    audio - edge-tts's own supported mechanism for real per-word timing,
    not something estimated after the fact."""
    boundary = "WordBoundary" if metadata_path else "SentenceBoundary"
    communicate = edge_tts.Communicate(text, voice=voice, rate=rate, boundary=boundary)
    await communicate.save(str(out_path), str(metadata_path) if metadata_path else None)


def parse_word_boundaries(metadata_path):
    """Reads the WordBoundary JSONL edge-tts wrote next to a clip. offset/
    duration are in 100ns units (edge-tts's own unit, matching what
    SubMaker uses internally) - divide by 10_000_000 for seconds."""
    boundaries = []
    path = Path(metadata_path)
    if not path.exists():
        return boundaries
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            msg = json.loads(line)
            if msg.get("type") != "WordBoundary":
                continue
            start = msg["offset"] / 10_000_000
            end = (msg["offset"] + msg["duration"]) / 10_000_000
            boundaries.append((msg["text"], start, end))
    return boundaries


def trim_silence(in_path, out_path):
    """edge-tts pads clips with leading/trailing silence; strip it so
    blocks can be concatenated back to back without a stutter.
    silenceremove's stop_periods triggers on the FIRST internal pause it
    finds (it can't see ahead to know which one is "the end"), so trailing
    silence is trimmed via the standard reverse/trim-start/reverse trick
    instead - that only ever touches genuine leading/trailing silence.

    Returns how many seconds were cut from the START - WordBoundary offsets
    are measured against the ORIGINAL untrimmed clip, so that amount has to
    be subtracted from them to land back on this trimmed clip's own t=0."""
    trim_start = (
        "silenceremove=start_periods=1:start_duration=0.05:"
        "start_threshold=-45dB:detection=peak"
    )
    leading_only = Path(f"{in_path}.lead.mp3")
    run([FFMPEG_BIN, "-y", "-i", str(in_path), "-af", trim_start, str(leading_only)],
        capture_output=True)
    leading_trim = max(0.0, ffprobe_duration(in_path) - ffprobe_duration(leading_only))

    run([
        FFMPEG_BIN, "-y", "-i", str(leading_only),
        "-af", f"{trim_start},areverse,{trim_start},areverse",
        str(out_path),
    ], capture_output=True)
    leading_only.unlink(missing_ok=True)
    return leading_trim


def is_break_punct(token):
    return len(token) > 0 and all(ch in BREAK_PUNCT_CHARS for ch in token)


def _close_chunk(chunks, current):
    """Appends `current` as a new chunk - unless it's under MIN_CHUNK_WORDS,
    in which case it's folded onto the end of the previous chunk instead
    (as long as that doesn't blow past MAX_CHUNK_WORDS). ၊/။ mark a real
    clause boundary and always end a chunk, but Burmese clauses are often
    genuinely short ("...တယ်။", "...ဘူး၊") - emitting those 1-2 leftover
    words as their own flash-frame fragment is exactly the "half-broken
    fragment" look this exists to avoid; tacking them onto what came right
    before reads as one continuous phrase instead."""
    if not current:
        return
    if len(current) < MIN_CHUNK_WORDS and chunks and len(chunks[-1]) + len(current) <= MAX_CHUNK_WORDS:
        chunks[-1] = chunks[-1] + current
    else:
        chunks.append(current)


def chunk_translation_words(tokens):
    """Groups a block's Gemini-word-segmented tokens into small
    (MIN_CHUNK_WORDS to MAX_CHUNK_WORDS) phrase chunks - one breath group
    at a time, the way a real recap channel's captions read. ၊/။ (or ASCII
    equivalents) always force a break - a real clause boundary is never
    straddled - and the punctuation is fused onto the word it follows
    rather than kept as its own entry, since it carries no timing of its
    own. Within the 3-6 word window, prefers to break right after a
    particle/postposition (a natural phrase edge) instead of an arbitrary
    word count."""
    chunks = []
    current = []
    for tok in tokens:
        if is_break_punct(tok):
            if current:
                current[-1] = current[-1] + tok
                _close_chunk(chunks, current)
                current = []
            continue
        current.append(tok)
        if len(current) >= MAX_CHUNK_WORDS:
            _close_chunk(chunks, current)
            current = []
        elif len(current) >= MIN_CHUNK_WORDS and tok in BURMESE_PARTICLES:
            _close_chunk(chunks, current)
            current = []
    _close_chunk(chunks, current)
    return chunks


def _has_latin_letter(s):
    return any(ch.isascii() and ch.isalpha() for ch in s)


def join_phrase_tokens(tokens):
    """Joins one chunk's word tokens into a single phrase string. Burmese
    has no spaces between words, so tokens join directly with none -
    EXCEPT around a token that contains Latin letters (an English brand/
    name/loanword mixed into the translation, e.g. "Follow", "TikTok"),
    which needs a space on each side to stay readable and to not get
    mispronounced fused onto the Burmese around it."""
    out = ""
    for i, tok in enumerate(tokens):
        if i > 0 and (_has_latin_letter(tok) or _has_latin_letter(tokens[i - 1])):
            out += " "
        out += tok
    return out


def synthesize_blocks(blocks, workdir, voice, rate):
    for i, b in enumerate(blocks):
        # Gemini gives word-segmented text; cluster it into breath-group
        # phrases here, then re-join with NO space inside a phrase and a
        # single space BETWEEN phrases - that's what gets synthesized, so
        # edge-tts speaks each phrase smoothly and only pauses at real
        # phrase boundaries (see MIN_CHUNK_WORDS/MAX_CHUNK_WORDS above).
        chunks = chunk_translation_words(b["translation"].split())
        b["caption_chunks"] = [join_phrase_tokens(chunk) for chunk in chunks]
        tts_text = " ".join(b["caption_chunks"])

        raw_mp3 = workdir / f"blk_{i:03d}_raw.mp3"
        meta_path = workdir / f"blk_{i:03d}_words.jsonl"
        asyncio.run(_synth(tts_text, raw_mp3, voice, rate, metadata_path=meta_path))
        trimmed_mp3 = workdir / f"blk_{i:03d}.mp3"
        leading_trim = trim_silence(raw_mp3, trimmed_mp3)
        b["tts_path"] = trimmed_mp3
        b["raw_dur"] = ffprobe_duration(trimmed_mp3)
        # Re-base each phrase's timestamp onto the TRIMMED clip's own t=0 -
        # they were measured against the original, untrimmed synthesis.
        b["word_boundaries"] = [
            (text, max(0.0, s - leading_trim), max(0.0, e - leading_trim))
            for text, s, e in parse_word_boundaries(meta_path)
        ]
        kind = "dialogue" if b["is_dialogue"] else "narration"
        print(f"    block {i} [{kind}] scene={b['scene_duration']:.2f}s "
              f"voice={b['raw_dur']:.2f}s  phrases={len(b['caption_chunks'])}  {tts_text[:40]!r}")


def apply_tempo(in_path, out_path, tempo):
    run([
        FFMPEG_BIN, "-y", "-i", str(in_path),
        "-filter:a", f"atempo={tempo}",
        "-vn", str(out_path),
    ], capture_output=True)


def append_smooth(track, seg, crossfade_ms=20):
    """ai_recap's continuous track: a hard cut between trimmed TTS clips can
    leave an audible click at the seam if the waveform isn't exactly
    zero-crossing there. A short crossfade smooths that out. (Dubbing's
    per-block track uses build_voice_track's fade-in/out instead, since its
    blocks are placed at absolute times rather than appended sequentially.)

    Returns (new_track, cf_ms_used) - pydub's crossfade OVERLAPS the last
    cf_ms of `track` with the first cf_ms of `seg`, so `seg`'s own t=0
    actually lands at (len(track) - cf_ms) on the combined timeline, not at
    len(track) - callers building real caption timing need cf_ms_used to
    place each clip at its true position (see build_continuous_track)."""
    if len(track) == 0:
        return seg, 0
    cf = min(crossfade_ms, len(track), len(seg))
    if cf <= 0:
        return track + seg, 0
    return track.append(seg, crossfade=cf), cf


def layout_track(blocks, durations, voice_tempo, video_speed):
    """Lays each block's (tempo-scaled) voice down on the OUTPUT timeline,
    anchored to where its scene actually starts once video_speed is
    applied. A block never starts before its own scene does - only later,
    if the previous block hasn't finished yet (never overlap). If a block
    finishes before the next one's scene arrives, that gap is held as
    silence rather than pulling the next block forward - pulling blocks
    forward is exactly what let the whole track creep ahead of the
    picture and finish early, since every early finish would drag every
    later block with it. Returns a list of (start, end) times, strictly
    non-overlapping and never ahead of the picture by construction."""
    placements = []
    cursor = 0.0
    for b, dur in zip(blocks, durations):
        target = b["scene_start"] / video_speed
        start = max(cursor, target)
        end = start + dur / voice_tempo
        placements.append((start, end))
        cursor = end
    return placements


def fit_global_timing(blocks, raw_durations, video_duration, tempo_max,
                       video_speed_min, video_speed_max):
    """Fits the whole narration against the video, bidirectionally - unlike
    ai_recap (which simply sets video_speed = video_duration / voice_duration
    for an exact match, see process_ai_recap), dubbing must stay within
    bounded voice/video speed ranges, so it may speed the video UP or DOWN
    to close dead-silence gaps within those bounds.

    Voice OVERRUNS the video (common - Burmese runs long): first a gentle
    GLOBAL voice speed-up (up to tempo_max); only if that's still not
    enough, a GLOBAL video slowdown (down to video_speed_min) on top of it.
    Both searches find the SMALLEST correction that fits, not the max, so
    it's no more aggressive than it needs to be. Whatever's still left over
    after both are maxed out is reported back as a freeze-frame extension -
    the caller pads the video with it rather than letting voice run past
    the end.

    Voice UNDERRUNS the video (leaves dead silence, at the end and/or
    between blocks): voice tempo is already at its slowest allowed pace
    (1.0 = the fixed +30% synthesis baseline), so the only lever is a
    GLOBAL video speed-up (up to video_speed_max) to shrink the video down
    toward the voice - here more speed continuously closes more of the gap
    (unlike the overrun case, where any amount past the threshold is just
    unnecessary), so this search finds the LARGEST speed-up that doesn't
    itself flip the block into overrunning."""
    def total_at(tempo, speed):
        return layout_track(blocks, raw_durations, tempo, speed)[-1][1]

    voice_tempo, video_speed = 1.0, 1.0
    total = total_at(voice_tempo, video_speed)

    if total > video_duration:
        lo, hi = 1.0, tempo_max
        if total_at(hi, 1.0) > video_duration:
            voice_tempo = hi
        else:
            for _ in range(24):
                mid = (lo + hi) / 2
                if total_at(mid, 1.0) <= video_duration:
                    hi = mid
                else:
                    lo = mid
            voice_tempo = hi
        total = total_at(voice_tempo, 1.0)

        if total > video_duration:
            lo, hi = video_speed_min, 1.0
            if total_at(voice_tempo, lo) > video_duration / lo:
                video_speed = lo
            else:
                for _ in range(24):
                    mid = (lo + hi) / 2
                    if total_at(voice_tempo, mid) <= video_duration / mid:
                        lo = mid
                    else:
                        hi = mid
                video_speed = lo
            total = total_at(voice_tempo, video_speed)

    elif total < video_duration:
        def fits(speed):
            return total_at(voice_tempo, speed) <= video_duration / speed

        lo, hi = 1.0, video_speed_max
        if fits(hi):
            video_speed = hi
        else:
            for _ in range(24):
                mid = (lo + hi) / 2
                if fits(mid):
                    lo = mid
                else:
                    hi = mid
            video_speed = lo
        total = total_at(voice_tempo, video_speed)

    placements = layout_track(blocks, raw_durations, voice_tempo, video_speed)
    total = placements[-1][1]
    freeze_extend = max(0.0, total - video_duration / video_speed)
    return voice_tempo, video_speed, freeze_extend, placements, total


def verify_no_overlap(placements):
    for i in range(1, len(placements)):
        if placements[i][0] < placements[i - 1][1] - 1e-6:
            return False, i
    return True, None


def build_voice_track(blocks, voice_tempo, placements, total_duration, workdir, out_wav):
    """Places each block's already-trimmed voice clip at its own absolute
    start time on a silent canvas sized to the whole narration - not a
    sequential crossfade-and-shrink join, so the final length matches
    `placements` exactly with no cumulative drift. A short fade in/out at
    each clip's own edges (rule 3) removes the click at a boundary without
    eating into either clip's audible speech, and leaves natural short
    gaps between sentences alone instead of forcing them together."""
    canvas_ms = int(round(total_duration * 1000)) + 20
    track = AudioSegment.silent(duration=canvas_ms)
    for b, (start, _end) in zip(blocks, placements):
        src_path = b["tts_path"]
        if abs(voice_tempo - 1.0) > 1e-4:
            adj_path = workdir / f"{Path(src_path).stem}_gtempo.mp3"
            apply_tempo(src_path, adj_path, voice_tempo)
            src_path = adj_path
        clip = AudioSegment.from_file(src_path)
        fade = min(JOIN_FADE_MS, len(clip) // 2)
        if fade > 0:
            clip = clip.fade_in(fade).fade_out(fade)
        track = track.overlay(clip, position=int(round(start * 1000)))

    track = track[:int(round(total_duration * 1000))]
    track.export(out_wav, format="wav")


# ============================================================
# ai_recap: continuous whole-transcript narration
# ============================================================

def choose_num_chunks(word_count):
    if word_count > LONG_TRANSCRIPT_3_CHUNKS_WORDS:
        return 3
    if word_count > LONG_TRANSCRIPT_2_CHUNKS_WORDS:
        return 2
    return 1


def split_word_chunks(words, num_chunks):
    if num_chunks <= 1 or len(words) < 2:
        return [words]
    n = len(words)
    target = n / num_chunks
    raw_boundaries = [round(target * k) for k in range(1, num_chunks)]

    boundaries = []
    used = 0
    for b in raw_boundaries:
        b = max(b, used + 1)
        search_limit = min(n - 1, b + 50)
        found = None
        for j in range(b, search_limit + 1):
            last_char = words[j].text[-1] if words[j].text else ""
            if last_char in SENTENCE_END_CHARS:
                found = j + 1
                break
        idx = found if found is not None else b
        idx = max(used + 1, min(idx, n - 1))
        boundaries.append(idx)
        used = idx

    chunks = []
    start = 0
    for b in boundaries:
        chunks.append(words[start:b])
        start = b
    chunks.append(words[start:])
    return [c for c in chunks if c]


# AI Recap's fixed outro line - appended in code (not asked of Gemini) so it
# always appears exactly once, verbatim, regardless of transcript length/
# chunking (see process_ai_recap). It already reads as 3 space-separated
# words, so it flows through the same phrase-chunking/TTS/caption pipeline
# as every other sentence with no special-casing needed.
AI_RECAP_FOLLOW_LINE = "အဆက်ကြည့်ချင်ရင် Follow လုပ်ထားပါ။"

NARRATION_PROMPT_TEMPLATE = """Translate the entire transcript into natural, simple, easy-to-understand Burmese for voice-over.

Rules:
- Do NOT display, repeat, or extract the original transcript.
- Do NOT summarize the story.
- Do NOT shorten or remove important information.
- Do NOT add new scenes, dialogue, characters, or events.
- Keep the original story order and meaning.
- Use simple, natural spoken Burmese; not unnecessarily long.
- Avoid complicated, formal, or unnatural words.
- Translate character and place names into readable Burmese pronunciation when possible.
- Remove timestamps unless important to the story.
- NUMBERS: write ALL numbers as Burmese WORDS - never English digits (0-9), never Myanmar digit symbols (၀-၉).
  e.g. 1000=တစ်ထောင်, 100000=တစ်သိန်း, "18 years old"=အသက်ဆယ့်ရှစ်နှစ်, "100 dollars"=ဒေါ်လာတစ်ရာ.
- Output ONE continuous paragraph: no line breaks, no bullets, no section titles, no timestamps.

One more formatting rule, needed downstream to split this into TTS-sized sentences and short timed subtitle
chunks - it does not change any wording, only spacing:
- Insert a space between each Burmese word (word-segmented) throughout the paragraph.

__PREV_CONTEXT__

Transcript:
__TRANSCRIPT__
"""


def build_narration_prompt(transcript_text, prev_text):
    if prev_text:
        tail = prev_text[-300:]
        prev_context = (
            f'The translation so far already said (in Burmese): "...{tail}"\n'
            "Continue translating from there in the same style - do not repeat it, do not restart."
        )
    else:
        prev_context = "This is the start of the transcript."
    prompt = NARRATION_PROMPT_TEMPLATE.replace("__PREV_CONTEXT__", prev_context)
    return prompt.replace("__TRANSCRIPT__", transcript_text)


def extract_narration_text(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        lines = text.split("\n", 1)
        if len(lines) == 2 and len(lines[0].strip()) < 20:
            text = lines[1]
    return text.strip()


def translate_transcript(words, language_code, keys):
    translator = GeminiTranslator(keys, GEMINI_MODEL)
    word_chunks = split_word_chunks(words, choose_num_chunks(len(words)))

    prev_text = ""
    parts = []
    for i, chunk in enumerate(word_chunks):
        chunk_text = words_to_text(chunk, language_code)
        print(f"  translating chunk {i + 1}/{len(word_chunks)} ({len(chunk)} words)")
        translation = translator.translate_narration(chunk_text, prev_text)
        parts.append(translation)
        prev_text = translation
        time.sleep(GEMINI_PACE_SECONDS)

    return " ".join(p.strip() for p in parts if p.strip())


def split_into_sentences(text):
    """Split the finished Burmese narration into TTS-sized sentences. This is
    a purely technical split (to keep each edge-tts call and each trimmed
    clip a reasonable size) - it has nothing to do with timing or budgets."""
    text = text.strip()
    if not text:
        return []

    raw = re.split(f"(?<={re.escape(BURMESE_SENTENCE_END)})\\s*", text)
    sentences = [s.strip() for s in raw if s.strip()]
    if not sentences:
        sentences = [text]

    result = []
    for s in sentences:
        if len(s) <= MAX_SENTENCE_CHARS:
            result.append(s)
            continue
        parts = re.split(r"(?<=[,၊])\s*", s)
        parts = [p.strip() for p in parts if p.strip()]
        result.extend(parts if len(parts) > 1 else [s])

    final = []
    for s in result:
        if len(s) <= MAX_SENTENCE_CHARS:
            final.append(s)
            continue
        words = s.split(" ")
        cur = ""
        for w in words:
            if cur and len(cur) + 1 + len(w) > MAX_SENTENCE_CHARS:
                final.append(cur)
                cur = w
            else:
                cur = f"{cur} {w}" if cur else w
        if cur:
            final.append(cur)
    return final


def synthesize_sentences(sentences, workdir, voice, rate):
    """One edge-tts call per sentence (unchanged architecture), but each
    sentence's word-segmented text is first clustered into short 3-6-word
    breath-group phrases (chunk_translation_words, the same helper dubbing
    uses) and re-joined with a space only BETWEEN phrases - so within one
    sentence's single synthesis call, edge-tts speaks smoothly and only
    pauses at real phrase boundaries, while still emitting one real
    WordBoundary event per phrase for caption timing (see
    build_recap_caption_entries). voice speed is never adjusted after this -
    whatever `rate` is (the user's own slider) is exactly what's spoken."""
    results = []
    for i, text in enumerate(sentences):
        chunks = chunk_translation_words(text.split())
        caption_chunks = [join_phrase_tokens(chunk) for chunk in chunks]
        tts_text = " ".join(caption_chunks)

        raw_mp3 = workdir / f"sent_{i:03d}_raw.mp3"
        meta_path = workdir / f"sent_{i:03d}_words.jsonl"
        asyncio.run(_synth(tts_text, raw_mp3, voice, rate, metadata_path=meta_path))
        trimmed_mp3 = workdir / f"sent_{i:03d}.mp3"
        leading_trim = trim_silence(raw_mp3, trimmed_mp3)
        dur = ffprobe_duration(trimmed_mp3)
        word_boundaries = [
            (t, max(0.0, s - leading_trim), max(0.0, e - leading_trim))
            for t, s, e in parse_word_boundaries(meta_path)
        ]
        results.append({
            "path": trimmed_mp3,
            "duration": dur,
            "caption_chunks": caption_chunks,
            "word_boundaries": word_boundaries,
        })
        print(f"    sentence {i}: {dur:.2f}s  phrases={len(caption_chunks)}  {tts_text[:50]!r}")
    return results


def build_continuous_track(sentence_results, out_wav):
    """Builds the real continuous track and returns each sentence's REAL
    start position on it (not a naive sum of durations) - append_smooth's
    crossfade overlaps each join, so the naive sum runs increasingly ahead
    of where clips actually land the more sentences there are. A sentence's
    own t=0 lands at (track length BEFORE this append) minus the crossfade
    actually used for this join (0 for the very first clip - see
    append_smooth) - that's what start_s below computes, so placements
    always match this exported file exactly, not an estimate of it."""
    track = AudioSegment.empty()
    placements = []
    for r in sentence_results:
        dur = r["duration"]
        clip = AudioSegment.from_file(r["path"])
        len_before_ms = len(track)
        track, cf_ms = append_smooth(track, clip)
        start_s = (len_before_ms - cf_ms) / 1000.0
        placements.append((start_s, dur))
    total = len(track) / 1000.0
    track.export(out_wav, format="wav")
    return total, placements


def build_recap_caption_entries(sentence_results, placements):
    """Rebuilds caption entries (start, end, text) from REAL per-phrase
    edge-tts timestamps - the ai_recap counterpart of dubbing's
    build_word_timed_entries, but simpler: ai_recap's voice speed is never
    adjusted after synthesis (see process_ai_recap), so there's no tempo
    factor to divide out, just each sentence's own absolute start time on
    the continuous track."""
    entries = []
    for r, (sent_start, sent_dur) in zip(sentence_results, placements):
        phrases = r.get("caption_chunks") or []
        real_words = r.get("word_boundaries", [])
        sent_end = sent_start + sent_dur
        if not phrases or not real_words:
            continue

        if len(phrases) != len(real_words):
            print(f"      phrase-count mismatch in sentence (expected {len(phrases)}, "
                  f"got {len(real_words)} WordBoundary events) - falling back to "
                  f"proportional timing for this sentence only")
            entries.extend(_proportional_chunk_times(phrases, sent_start, sent_end))
            continue

        for phrase, (_, rel_start, rel_end) in zip(phrases, real_words):
            abs_start = sent_start + rel_start
            abs_end = min(sent_start + rel_end, sent_end)
            entries.append([abs_start, abs_end, phrase])

    for i in range(len(entries) - 1):
        entries[i][1] = min(entries[i][1], entries[i + 1][0])
    return [(s, e, t) for s, e, t in entries]


# ============================================================
# Muxing (one shared subtitle-filter builder, three mux strategies)
# ============================================================

def escape_ffmpeg_filter_arg(s):
    s = s.replace("\\", "\\\\")
    s = s.replace(":", "\\:")
    s = s.replace("'", "\\'")
    return s


def build_subtitle_filter(ass_path):
    """Burn the Burmese subtitles in with libass, from a hand-built .ass
    that already carries the caption's font, colors and position - without
    an explicit FontName, Myanmar text renders as tofu boxes even when the
    font is installed, because libass falls back to its default
    (non-Myanmar-capable) font unless told otherwise. fontsdir points at
    fonts/ so a custom font picked from there resolves to that local file
    instead of needing to be installed system-wide."""
    path_arg = escape_ffmpeg_filter_arg(str(ass_path))
    fonts_arg = escape_ffmpeg_filter_arg(str(FONTS_DIR))
    return f"ass=filename='{path_arg}':fontsdir='{fonts_arg}'"


def _safe_boxblur_radius(radius, w, h):
    """ffmpeg's boxblur rejects a chroma radius >= ~(min crop dimension)/4
    outright ("Invalid chroma_param radius... must be >= 0 and < 16") - a
    wide-but-short (or narrow-but-tall) box at high strength would
    otherwise crash the whole render instead of just blurring less."""
    return max(1, min(radius, min(w, h) // 4 - 1))


def build_blur_stage(input_label, box, index, width, height):
    """One blur box = process the region, lay it back over the original at
    the same spot. `input_label` is read twice here (once as the crop
    source, once as the overlay base) - reusing a label as both a filter's
    input AND overlay's background can make ffmpeg's overlay resolve the
    background to the WRONG size when that label comes from a dimension-
    changing filter upstream (verified directly: a preceding aspect-ratio
    crop got silently ignored in the final output without this). An
    explicit `split` up front avoids the ambiguity entirely regardless of
    what input_label actually is.

    Three styles, picked per-box via box["style"]:
    - "smooth" (default): the crop is gaussian/box-blurred at a gentle
      strength, then blended back against the original crop through a
      soft-edged mask (a filled rect inset by a feather margin, blurred to
      a gradient) via maskedmerge - a clean, soft censor look, not a hard
      rectangle.
    - "mosaic": same feathered-mask blend, but the crop is pixelated
      (scaled way down and back up with nearest-neighbor sampling - chunky
      blocks) instead of blurred.
    - "remove": ffmpeg's delogo filter - interpolates the region from
      surrounding pixels to erase it (e.g. a burned-in caption) rather
      than obscuring it. No crop/mask machinery needed; delogo works
      directly on the frame. It refuses a box touching the frame edge (no
      surrounding pixels to sample there), so the box is inset by a
      minimum margin first.
    """
    x = max(0, min(width - 2, round(box.get("x", 0) * width)))
    y = max(0, min(height - 2, round(box.get("y", 0) * height)))
    w = max(2, min(width - x, round(box.get("width", 0.2) * width)))
    h = max(2, min(height - y, round(box.get("height", 0.2) * height)))
    # yuv420p's chroma planes are half-resolution, so an odd crop width/
    # height gets silently rounded to even by some filters (geq/format)
    # but not others (scale) - mixing both in one graph makes a mismatch
    # crash maskedmerge outright. Even dimensions avoid the inconsistency.
    w -= w % 2
    h -= h % 2
    strength = max(0, min(100, box.get("strength", 50)))
    style = box.get("style") or "smooth"
    ov_label = f"ov{index}"

    if style == "remove":
        margin = 2  # delogo needs surrounding pixels on every side
        x = max(margin, min(width - margin - 2, x))
        y = max(margin, min(height - margin - 2, y))
        w = max(2, min(width - margin - x, w))
        h = max(2, min(height - margin - y, h))
        stage = f"{input_label}delogo=x={x}:y={y}:w={w}:h={h}[{ov_label}]"
        return stage, f"[{ov_label}]"

    crop_label = f"crop{index}"
    feather = _safe_boxblur_radius(max(1, round(min(w, h) * BLUR_FEATHER_RATIO)), w, h)
    inset_w = max(2, w - 2 * feather)
    inset_h = max(2, h - 2 * feather)

    base_a, base_b = f"baseA{index}", f"baseB{index}"
    crop_a, crop_b, crop_c = f"cropA{index}", f"cropB{index}", f"cropC{index}"
    content_label = f"content{index}"
    mask_bg, mask_label, merged_label = f"maskbg{index}", f"mask{index}", f"merged{index}"

    if style == "mosaic":
        block = max(2, round(MOSAIC_MIN_BLOCK + (strength / 100) * (MOSAIC_MAX_BLOCK - MOSAIC_MIN_BLOCK)))
        small_w = max(1, w // block)
        small_h = max(1, h // block)
        content_filter = f"scale={small_w}:{small_h}:flags=neighbor,scale={w}:{h}:flags=neighbor"
    else:  # smooth
        sigma = round(GBLUR_MIN_SIGMA + (strength / 100) * (GBLUR_MAX_SIGMA - GBLUR_MIN_SIGMA))
        content_filter = f"gblur=sigma={sigma}:steps={GBLUR_STEPS}"

    stage = (
        f"{input_label}split=2[{base_a}][{base_b}];"
        f"[{base_a}]crop={w}:{h}:{x}:{y}[{crop_label}];"
        f"[{crop_label}]split=3[{crop_a}][{crop_b}][{crop_c}];"
        f"[{crop_a}]{content_filter}[{content_label}];"
        # Mask background is derived from the crop itself (forced to solid
        # black via geq) rather than an independent `color=` source - a
        # standalone lavfi source has no natural end, and mixing it into
        # the same graph as the real (finite) video made the whole render
        # run unbounded instead of stopping when the video did.
        f"[{crop_c}]geq=lum=0:cb=128:cr=128[{mask_bg}];"
        f"[{mask_bg}]drawbox=x={feather}:y={feather}:w={inset_w}:h={inset_h}:"
        # power=1: a higher power compounds the spread far past the nominal
        # radius (verified directly - at power=3 the mask never reached
        # pure white anywhere, so NOTHING in the box was ever fully
        # blurred). Single-pass keeps the spread predictable: a solid
        # opaque core sized by inset_w/inset_h, fading over ~feather px.
        f"color=white:t=fill,boxblur={feather}:1,format=gray[{mask_label}];"
        f"[{crop_b}][{content_label}][{mask_label}]maskedmerge[{merged_label}];"
        f"[{base_b}][{merged_label}]overlay={x}:{y}[{ov_label}]"
    )
    return stage, f"[{ov_label}]"


def build_pre_filters(flip_video, auto_color, aspect_filter=None):
    """Aspect reframe, then flip, then auto-color - applied ONCE to the raw
    source, before any trim/blur/subtitle stage. Aspect goes first so blur
    boxes/subtitles/flip all operate on the already-reframed frame (their
    fractional coordinates are computed against the reframed width/height
    by the caller - see compute_aspect_reframe/process()); flip's own x-
    mirroring of blur box positions is still correct since it happens
    after the crop, against that same reframed frame."""
    parts = []
    if aspect_filter:
        parts.append(aspect_filter)
    if flip_video:
        parts.append("hflip")
    if auto_color:
        parts.append(AUTO_COLOR_FILTER)
    if not parts:
        return [], "[0:v]"
    return [f"[0:v]{','.join(parts)}[vsrc]"], "[vsrc]"


def mirror_box_x(box):
    """When flip_video is on, the box's x (defined against the ORIGINAL,
    unflipped preview the user dragged it on) needs mirroring so it still
    covers the same visual content once the frame itself is mirrored."""
    mirrored = dict(box)
    mirrored["x"] = max(0.0, 1.0 - box.get("x", 0.0) - box.get("width", 0.2))
    return mirrored


def build_post_filters(input_label, blur_boxes, ass_path, width, height):
    """Blur boxes (hiding an original burned-in caption) THEN the subtitle
    burn (our new caption goes on top, unblurred). Shared by all three
    mux strategies so blur/subtitle behavior is identical no matter how
    each mode built its video up to this point. Returns (stage_list,
    final_output_label); final_output_label may just be `input_label`
    unchanged if there's nothing to add."""
    stages = []
    cur = input_label
    for i, box in enumerate(blur_boxes[:3]):
        stage, cur = build_blur_stage(cur, box, i, width, height)
        stages.append(stage)
    if ass_path is not None:
        stages.append(f"{cur}{build_subtitle_filter(ass_path)}[vout]")
        cur = "[vout]"
    return stages, cur


def mux_video_single(input_video, audio_wav, ass_path, video_speed, final_duration, video_duration,
                      blur_boxes, width, height, flip_video, auto_color, out_path, aspect_filter=None):
    """Shared by ai_recap (continuous track, video_speed set in
    process_ai_recap for an exact match to the voice) and dubbing (per-block
    track laid out by fit_global_timing) - both now
    reduce to the same shape: one global video_speed setpts over the whole
    source, then pad the end if the voice still runs a little past it."""
    adjusted_video_duration = video_duration / video_speed
    pad = max(0.0, final_duration - adjusted_video_duration)

    stages, cur = build_pre_filters(flip_video, auto_color, aspect_filter)
    if abs(video_speed - 1.0) > 1e-4:
        stages.append(f"{cur}setpts=PTS/{video_speed}[vsp]")
        cur = "[vsp]"

    post_stages, cur = build_post_filters(cur, blur_boxes, ass_path, width, height)
    stages.extend(post_stages)

    if pad > 0.0:
        stages.append(f"{cur}tpad=stop_mode=clone:stop_duration={pad:.3f}[vpad]")
        cur = "[vpad]"

    cmd = [FFMPEG_BIN, "-y", "-i", str(input_video), "-i", str(audio_wav)]
    if stages:
        cmd += ["-filter_complex", ";".join(stages), "-map", cur, "-map", "1:a:0"]
    else:
        cmd += ["-map", "0:v:0", "-map", "1:a:0"]
    cmd += [
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        str(out_path),
    ]
    run(cmd, capture_output=True)


def mux_subtitle_only(input_video, ass_path, blur_boxes, width, height, flip_video, auto_color, out_path,
                       aspect_filter=None):
    """subtitle_only: no generated voice, so original audio stays untouched
    and there's nothing to retime - just blur/subtitle the video."""
    pre_stages, src_label = build_pre_filters(flip_video, auto_color, aspect_filter)
    post_stages, final_label = build_post_filters(src_label, blur_boxes, ass_path, width, height)
    stages = pre_stages + post_stages
    cmd = [FFMPEG_BIN, "-y", "-i", str(input_video)]
    if stages:
        cmd += ["-filter_complex", ";".join(stages), "-map", final_label, "-map", "0:a:0"]
    else:
        cmd += ["-map", "0:v:0", "-map", "0:a:0"]
    cmd += [
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        str(out_path),
    ]
    run(cmd, capture_output=True)


# ============================================================
# Subtitles (.srt soft subs + hand-built .ass for hardsub)
# ============================================================

def seconds_to_srt_time(t):
    if t < 0:
        t = 0.0
    h = int(t // 3600)
    t -= h * 3600
    m = int(t // 60)
    t -= m * 60
    s = int(t)
    ms = int(round((t - s) * 1000))
    if ms >= 1000:
        ms -= 1000
        s += 1
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def seconds_to_ass_time(t):
    if t < 0:
        t = 0.0
    h = int(t // 3600)
    t -= h * 3600
    m = int(t // 60)
    t -= m * 60
    s = int(t)
    cs = int(round((t - s) * 100))
    if cs >= 100:
        cs -= 100
        s += 1
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def chunk_words(words, lo=SRT_WORDS_MIN, hi=SRT_WORDS_MAX):
    n = len(words)
    if n == 0:
        return []
    if n <= hi:
        return [words]
    num_chunks = max(1, round(n / ((lo + hi) / 2)))
    base = n // num_chunks
    rem = n % num_chunks
    chunks = []
    idx = 0
    for c in range(num_chunks):
        size = base + (1 if c < rem else 0)
        if size == 0:
            continue
        chunks.append(words[idx:idx + size])
        idx += size
    return chunks


def build_subtitle_entries(texts, placements):
    """(start, end, text) triples, 5-7 words per cue. `texts`/`placements`
    are just parallel lists - callers decide whether placements come from
    actual synthesized voice (dubbing/ai_recap) or straight from source
    timing (subtitle_only), but the chunking logic is the same either way."""
    entries = []
    for text, (start_s, dur_s) in zip(texts, placements):
        words = text.split()
        chunks = chunk_words(words)
        if not chunks:
            continue
        total_chars = sum(len(" ".join(c)) for c in chunks) or 1
        t = start_s
        for c in chunks:
            chars = len(" ".join(c))
            portion = dur_s * (chars / total_chars)
            c_start, c_end = t, t + portion
            entries.append((c_start, c_end, " ".join(c)))
            t = c_end
    return entries


def _proportional_chunk_times(phrases, block_start, block_end):
    """Fallback for the rare block where a block's phrase-token count doesn't
    line up with its captured WordBoundary count (e.g. edge-tts tokenizing
    an unexpected character differently) - degrades to an estimate instead
    of crashing or misaligning every later phrase in the block."""
    total_chars = sum(len(p) for p in phrases) or 1
    out = []
    t = block_start
    for p in phrases:
        portion = (block_end - block_start) * (len(p) / total_chars)
        out.append([t, t + portion, p])
        t += portion
    return out


def build_word_timed_entries(blocks, voice_tempo, placements):
    """Rebuilds caption entries (start, end, text) from REAL per-phrase
    edge-tts timestamps instead of estimating by proportion. Each block's
    caption_chunks (built in synthesize_blocks - short 3-6-word breath-group
    phrases) line up 1:1 with their own WordBoundary event, since that's
    exactly how the TTS text was built (one space between chunks, none
    inside). Scaled by the same global voice_tempo used to build the audio,
    and placed at the block's own absolute position on the final timeline -
    so a caption appears exactly when that phrase is spoken and disappears
    when the next one begins."""
    entries = []
    for b, (block_start, block_end) in zip(blocks, placements):
        phrases = b.get("caption_chunks") or []
        real_words = b.get("word_boundaries", [])
        if not phrases or not real_words:
            continue

        if len(phrases) != len(real_words):
            print(f"      phrase-count mismatch in block (expected {len(phrases)}, "
                  f"got {len(real_words)} WordBoundary events) - falling back to "
                  f"proportional timing for this block only")
            entries.extend(_proportional_chunk_times(phrases, block_start, block_end))
            continue

        for phrase, (_, rel_start, rel_end) in zip(phrases, real_words):
            abs_start = block_start + rel_start / voice_tempo
            abs_end = min(block_start + rel_end / voice_tempo, block_end)
            entries.append([abs_start, abs_end, phrase])

    # A phrase's caption should disappear exactly when the next one begins -
    # no gap, no overlap - tightly following the voice.
    for i in range(len(entries) - 1):
        entries[i][1] = min(entries[i][1], entries[i + 1][0])
    return [(s, e, t) for s, e, t in entries]


def write_srt(entries, out_path):
    with open(out_path, "w", encoding="utf-8") as f:
        for i, (s, e, text) in enumerate(entries, 1):
            f.write(f"{i}\n{seconds_to_srt_time(s)} --> {seconds_to_srt_time(e)}\n{text}\n\n")


ASS_TEMPLATE = """[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font},{fontsize},{primary},&H000000FF,{outlinecolour},{backcolour},0,0,0,0,100,100,0,0,{borderstyle},{outline},{shadow},{alignment},{marginl},{marginr},{marginv},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
{events}
"""


def rounded_rect_drawing(w, h, r):
    """ASS vector-drawing path (m/l/b commands) for a rounded rectangle from
    (0,0) to (w,h), corner radius r. Positioned via \\pos() by the caller -
    coordinates here are local to that anchor."""
    r = max(0.0, min(r, w / 2, h / 2))
    return (
        f"m {r:.1f} 0 "
        f"l {w - r:.1f} 0 "
        f"b {w - r / 2:.1f} 0 {w:.1f} {r / 2:.1f} {w:.1f} {r:.1f} "
        f"l {w:.1f} {h - r:.1f} "
        f"b {w:.1f} {h - r / 2:.1f} {w - r / 2:.1f} {h:.1f} {w - r:.1f} {h:.1f} "
        f"l {r:.1f} {h:.1f} "
        f"b {r / 2:.1f} {h:.1f} 0 {h - r / 2:.1f} 0 {h - r:.1f} "
        f"l 0 {r:.1f} "
        f"b 0 {r / 2:.1f} {r / 2:.1f} 0 {r:.1f} 0"
    )


# Rough average glyph width for mixed Myanmar/Latin text, as a fraction of
# font size - libass gives no font-metrics API, so the background box (which
# has to be sized before we know how libass will actually wrap the text) is
# estimated from character count rather than measured exactly. Calibrated
# against visual_char_count (not raw len()) - re-check both together if this
# ever needs retuning, since they combine to predict line count.
CAPTION_CHAR_WIDTH_RATIO = 0.34
CAPTION_LINE_HEIGHT_RATIO = 1.35
# A custom caption box narrower than this many characters at the height-
# driven font size forces even short blocks into 3+ cramped lines - the font
# size gets capped (see write_ass) so at least this many fit on one line.
# Tuned together with CAPTION_CHAR_WIDTH_RATIO - both feed the same
# characters-per-line math, just for different purposes (box sizing vs.
# font cap), so re-check both if either needs retuning.
MIN_CHARS_PER_LINE = 18


def visual_char_count(text):
    """Myanmar syllables stack multiple combining marks (medials, vowel
    signs, tone marks) onto one base letter as separate Unicode codepoints -
    counting every codepoint with len() overestimates rendered width 2-3x.
    Count only non-combining codepoints as a proxy for visual glyph-cluster
    count."""
    count = sum(1 for ch in text if not ch.isspace() and unicodedata.category(ch) != "Mn")
    return max(count, 1)


def build_background_events(entries, sub_style, width, height, fontsize):
    """One rounded-rect background PER CAPTION ENTRY, hand-drawn and
    positioned to match the text's own alignment/margins, on a layer behind
    the text. This replaces ASS's native BorderStyle=3 box, which draws a
    SEPARATE box per rendered line once text wraps to 2+ lines - producing
    the "two overlapping boxes" look for anything but a single short line."""
    background = sub_style.get("background", "none")
    if background == "none":
        return []
    alpha = "00" if background == "solid" else "80"  # solid vs ~50% transparent

    position = sub_style.get("position", "bottom")
    if position == "custom":
        box = sub_style.get("custom_box") or DEFAULT_OPTIONS["subtitle_custom_box"]
        x_frac = max(0.0, min(0.95, box.get("x", 0.10)))
        y_frac = max(0.0, min(0.95, box.get("y", 0.78)))
        w_frac = max(0.05, min(1.0 - x_frac, box.get("width", 0.80)))
        avail_w = w_frac * width
        anchor_x = x_frac * width
        anchor_y = y_frac * height
    else:
        avail_w = width - 40  # matches the bottom/middle MarginL=MarginR=20 text box
        anchor_x = anchor_y = None

    # A tight label around the text, not a big block - a few px on each side.
    pad_x = fontsize * 0.16
    pad_y = fontsize * 0.12
    radius = fontsize * 0.18
    line_height = fontsize * CAPTION_LINE_HEIGHT_RATIO
    char_w = fontsize * CAPTION_CHAR_WIDTH_RATIO

    events = []
    for s, e, text in entries:
        natural_w = max(char_w, visual_char_count(text) * char_w)
        line_w = min(natural_w, avail_w) if avail_w > 0 else natural_w
        num_lines = max(1, math.ceil(natural_w / avail_w)) if avail_w > 0 else 1
        block_w = line_w + 2 * pad_x
        block_h = num_lines * line_height + 2 * pad_y

        if position == "custom":
            # Text is centered within the drawn box (see write_ass) - center
            # the background box the same way instead of anchoring it to the
            # box's left edge, or the two would drift apart for short text.
            left = max(0.0, anchor_x + (avail_w - block_w) / 2)
            top = max(0.0, anchor_y - pad_y)
        elif position == "middle":
            left = max(0.0, width / 2 - block_w / 2)
            top = max(0.0, height / 2 - block_h / 2)
        else:  # bottom
            bottom_margin = max(10, round(height * SUBTITLE_MARGIN_V_RATIO))
            left = max(0.0, width / 2 - block_w / 2)
            top = max(0.0, height - bottom_margin - block_h + pad_y * 0.3)

        path = rounded_rect_drawing(block_w, block_h, radius)
        drawing = (
            f"{{\\an7\\pos({left:.1f},{top:.1f})\\1c&H000000&\\1a&H{alpha}&"
            f"\\bord0\\shad0\\p1}}{path}{{\\p0}}"
        )
        events.append(f"Dialogue: 0,{seconds_to_ass_time(s)},{seconds_to_ass_time(e)},Default,,0,0,0,,{drawing}")
    return events


def list_custom_fonts():
    """Scans fonts/ for .ttf files fresh on every call - so dropping a new
    font into the folder just shows up on the next page load, no restart
    or registration step. Each file's real font name is resolved via
    fontconfig's fc-scan, using `fullname` rather than `family`: a font
    whose family record carries conflicting style metadata (seen in the
    wild - e.g. a single "Bold" family entry) can otherwise fail to
    resolve through the `ass` filter's fontsdir at render time, silently
    falling back to a system font instead of the one actually picked."""
    fonts = []
    if not FONTS_DIR.is_dir():
        return fonts
    for path in sorted(FONTS_DIR.glob("*.ttf")):
        try:
            out = run(["fc-scan", "--format", "%{fullname}\n", str(path)],
                      capture_output=True, text=True, check=False)
            name = out.stdout.strip().splitlines()[0].strip() if out.stdout.strip() else ""
        except Exception:
            name = ""
        if name:
            fonts.append({"file": path.name, "family": name})
    return fonts


def write_ass(entries, width, height, out_path, style):
    """A hand-built .ass with an explicit PlayResX/PlayResY, rather than
    handing a plain .srt to the subtitles filter and hoping libass's
    auto-generated script resolution lines up with our pixel math. It
    doesn't: FontSize/MarginV came out looking scaled by roughly 4-5x
    versus what was requested. An explicit PlayRes removes the ambiguity.

    Position is expressed purely through Alignment + MarginL/R/V rather than
    a per-line \\pos override - that's what lets "Custom" constrain BOTH
    placement and wrap width using libass's own native line-wrapping
    (PlayResX - MarginL - MarginR), instead of us hand-wrapping text."""
    font_name = style.get("font") or SUBTITLE_FONT_NAME
    font_size_key = style.get("font_size", "medium")
    fontsize = max(20, round(height * SUBTITLE_FONTSIZE_RATIOS.get(font_size_key, SUBTITLE_FONTSIZE_RATIOS["medium"])))

    position = style.get("position", "bottom")
    custom_box = None
    if position == "custom":
        box = style.get("custom_box") or DEFAULT_OPTIONS["subtitle_custom_box"]
        x_frac = max(0.0, min(0.95, box.get("x", 0.10)))
        y_frac = max(0.0, min(0.95, box.get("y", 0.78)))
        w_frac = max(0.05, min(1.0 - x_frac, box.get("width", 0.80)))
        custom_box = (x_frac, y_frac, w_frac)
        # A narrow drawn box can't hold the height-driven font size on one
        # line - cap it so at least MIN_CHARS_PER_LINE characters fit, or
        # short captions still wrap into 3+ cramped lines.
        max_font_for_box = (w_frac * width) / (MIN_CHARS_PER_LINE * CAPTION_CHAR_WIDTH_RATIO)
        fontsize = max(20, min(fontsize, round(max_font_for_box)))

    color = style.get("color", "white")
    outline_ratio = SUBTITLE_YELLOW_OUTLINE_RATIO if color == "yellow" else SUBTITLE_OUTLINE_RATIO
    outline = max(1, round(fontsize * outline_ratio))

    primary = SUBTITLE_COLOR_ASS.get(color, SUBTITLE_COLOR_ASS["white"])
    # black text needs a light outline to stay legible instead of the usual black one
    outline_colour = "&H00FFFFFF" if color == "black" else "&H00000000"

    # Text is ALWAYS outline-only (BorderStyle=1) now - a background, if any,
    # is drawn separately as its own single shape (see build_background_events)
    # rather than relying on libass's per-line BorderStyle=3 box.
    border_style, back_colour, shadow = 1, "&H00000000", 0

    if position == "middle":
        alignment, margin_l, margin_r, margin_v = 5, 20, 20, 0
    elif position == "custom":
        x_frac, y_frac, w_frac = custom_box
        alignment = 8  # top-center anchor: MarginL/MarginV(top)/MarginR bound the wrap box, text centers within it
        margin_l = round(x_frac * width)
        margin_r = round(max(0.0, 1.0 - (x_frac + w_frac)) * width)
        margin_v = round(y_frac * height)
    else:  # bottom
        alignment, margin_l, margin_r = 2, 20, 20
        margin_v = max(10, round(height * SUBTITLE_MARGIN_V_RATIO))

    background_events = build_background_events(entries, style, width, height, fontsize)

    text_events = []
    for s, e, text in entries:
        safe_text = text.replace("{", "(").replace("}", ")").replace("\n", "\\N")
        text_events.append(
            f"Dialogue: 1,{seconds_to_ass_time(s)},{seconds_to_ass_time(e)},"
            f"Default,,0,0,0,,{safe_text}"
        )

    content = ASS_TEMPLATE.format(
        width=width, height=height, font=font_name, fontsize=fontsize,
        primary=primary, outlinecolour=outline_colour, backcolour=back_colour,
        borderstyle=border_style, outline=outline, shadow=shadow,
        alignment=alignment, marginl=margin_l, marginr=margin_r, marginv=margin_v,
        events="\n".join(background_events + text_events),
    )
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)


# ============================================================
# Intro / outro (applied as a post-step on the finished mp4, after whichever
# mode rendered it - keeps this decoupled from the per-mode filter graphs)
# ============================================================

def probe_fps(path):
    out = run(
        [FFPROBE_BIN, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    txt = out.stdout.strip()
    if "/" in txt:
        num, den = txt.split("/")
        den = float(den)
        return float(num) / den if den else float(num)
    return float(txt or 30)


def normalize_for_concat(input_path, width, height, fps, out_path):
    """Intro/outro clips are arbitrary user files - almost never the same
    resolution/fps/codec as the main render. Re-encode everything (including
    the main render itself) to identical parameters first, then the concat
    demuxer can just stream-copy them together with no quality surprises."""
    run([
        FFMPEG_BIN, "-y", "-i", str(input_path),
        "-vf", (f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}"),
        "-ar", "44100", "-ac", "2",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k",
        str(out_path),
    ], capture_output=True)


def apply_intro_outro(out_video, intro_path, outro_path, width, height, workdir):
    """Overwrites out_video in place with intro+main+outro concatenated."""
    fps = probe_fps(out_video)
    pieces = []
    if intro_path and Path(intro_path).exists():
        p = workdir / "intro_norm.mp4"
        normalize_for_concat(intro_path, width, height, fps, p)
        pieces.append(p)
    main_norm = workdir / "main_norm.mp4"
    normalize_for_concat(out_video, width, height, fps, main_norm)
    pieces.append(main_norm)
    if outro_path and Path(outro_path).exists():
        p = workdir / "outro_norm.mp4"
        normalize_for_concat(outro_path, width, height, fps, p)
        pieces.append(p)

    if len(pieces) <= 1:
        return
    concat_list = workdir / "concat_list.txt"
    with open(concat_list, "w", encoding="utf-8") as f:
        for p in pieces:
            f.write(f"file '{p.resolve()}'\n")
    run([
        FFMPEG_BIN, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
        "-c", "copy", str(out_video),
    ], capture_output=True)


# ============================================================
# Per-mode pipelines
# ============================================================

def write_subtitle_outputs(entries, out_srt, width, height, workdir, sub):
    """Shared by all three modes: write the .srt (soft subs) when captions
    are on at all, and additionally build the .ass for burning when the
    mode is "burn". Returns the .ass path to hand to a mux function, or
    None (skip the ass filter entirely) if captions are off or set to
    "File (.srt)" only."""
    if not sub["enabled"]:
        return None
    write_srt(entries, out_srt)
    if sub["mode"] != "burn":
        return None
    ass_path = workdir / "burn.ass"
    write_ass(entries, width, height, ass_path, sub["style"])
    return ass_path


def process_dubbing(input_video, workdir, words, lang, video_duration, width, height,
                     out_video, out_srt, gemini_keys, voice, rate, style_text, length_mult,
                     sub, blur_boxes, flip_video, auto_color, aspect_filter=None):
    print("[4/8] grouping into scene-anchored blocks (speaker-turn based)")
    blocks = group_scene_blocks(words, lang)
    classify_dialogue(blocks)
    compute_scene_spans(blocks, video_duration)
    compute_budgets(blocks, length_mult)
    n_dialogue = sum(1 for b in blocks if b["is_dialogue"])
    print(f"      {len(blocks)} blocks: {n_dialogue} dialogue, {len(blocks) - n_dialogue} narration")
    if not blocks:
        raise RuntimeError("no usable blocks produced from transcript")

    print("[5/8] translating blocks with Gemini (dialogue-aware)")
    blocks = translate_blocks(blocks, gemini_keys, style_text)
    if not blocks:
        raise RuntimeError("no blocks survived translation")

    print(f"[6/8] synthesizing Burmese voice with edge-tts (voice={voice}, rate={rate}), trimming silence")
    synthesize_blocks(blocks, workdir, voice, rate)
    raw_durations = [b["raw_dur"] for b in blocks]

    print("[7/8] laying out voice sequentially (no overlap), adaptively fitting to the video")
    base_pct = float(rate.rstrip("%"))
    tempo_max = max(1.0, (1.0 + DUB_VOICE_SPEED_MAX_PCT / 100.0) / (1.0 + base_pct / 100.0))
    voice_tempo, video_speed, freeze_extend, placements, total_voice_duration = \
        fit_global_timing(blocks, raw_durations, video_duration, tempo_max,
                           DUB_VIDEO_SPEED_MIN, DUB_VIDEO_SPEED_MAX)
    no_overlap, bad_i = verify_no_overlap(placements)
    if not no_overlap:
        raise RuntimeError(f"internal error: voice segments overlap at block {bad_i} - this should never happen")

    final_video_duration = max(video_duration / video_speed, total_voice_duration)
    effective_voice_pct = (1.0 + base_pct / 100.0) * voice_tempo * 100.0 - 100.0
    print(f"      video duration: {final_video_duration:.2f}s (source: {video_duration:.2f}s)")
    print(f"      final voice duration: {total_voice_duration:.2f}s")
    print(f"      CHOSEN SPEEDS: video={video_speed:.3f}x  voice=+{effective_voice_pct:.1f}% "
          f"(tempo={voice_tempo:.3f}x over the +{base_pct:.0f}% synthesis baseline), "
          f"freeze-extend={freeze_extend:.2f}s")
    print("      overlap check: OK - no two voice segments overlap")

    n = len(blocks)
    sample_idx = sorted({0, 1, n // 2, n // 2 + 1, n - 2, n - 1} & set(range(n)))
    print("      scene start vs actual voice start (sample blocks):")
    for i in sample_idx:
        scene_start = blocks[i]["scene_start"]
        voice_start = placements[i][0]
        print(f"        block {i}: scene_start={scene_start:7.2f}s  voice_start={voice_start:7.2f}s  "
              f"drift={voice_start - scene_start:+.2f}s")
    last_voice_end = placements[-1][1]
    print(f"      last block's voice ends at {last_voice_end:.2f}s, video ends at "
          f"{final_video_duration:.2f}s (gap: {final_video_duration - last_voice_end:.2f}s)")

    audio_wav = workdir / "final_audio.wav"
    build_voice_track(blocks, voice_tempo, placements, total_voice_duration, workdir, audio_wav)

    print("[8/8] writing word-timed phrase captions, then muxing")
    entries = build_word_timed_entries(blocks, voice_tempo, placements)
    ass_path = write_subtitle_outputs(entries, out_srt, width, height, workdir, sub)
    mux_video_single(input_video, audio_wav, ass_path, video_speed, total_voice_duration, video_duration,
                      blur_boxes, width, height, flip_video, auto_color, out_video, aspect_filter)

    print(f"BLOCK_COUNT:{len(blocks)}")
    print(f"DIALOGUE_COUNT:{n_dialogue}")
    print(f"NARRATION_COUNT:{len(blocks) - n_dialogue}")
    return out_video


def process_ai_recap(input_video, workdir, words, lang, video_duration, width, height,
                      out_video, out_srt, gemini_keys, voice, rate, style_text, length_mult,
                      sub, blur_boxes, flip_video, auto_color, aspect_filter=None):
    print("[4/7] translating the whole transcript into one continuous Burmese paragraph with Gemini")
    narration = translate_transcript(words, lang, gemini_keys)
    if not narration.strip():
        raise RuntimeError("translation returned no narration text")
    print(f"      narration length: {len(narration)} chars")

    print(f"[5/7] synthesizing Burmese voice with edge-tts (voice={voice}, rate={rate}), trimming silence")
    sentences = split_into_sentences(narration)
    sentences.append(AI_RECAP_FOLLOW_LINE)
    print(f"      split into {len(sentences)} sentences for TTS (incl. the fixed follow line)")
    sentence_results = synthesize_sentences(sentences, workdir, voice, rate)

    print("[6/7] assembling continuous voice track - the video is resized to match it exactly")
    audio_wav = workdir / "final_audio.wav"
    voice_duration, placements = build_continuous_track(sentence_results, audio_wav)
    video_speed = video_duration / voice_duration
    final_duration = voice_duration
    print(f"      voice duration={voice_duration:.2f}s, source video duration={video_duration:.2f}s")
    print(f"      CHOSEN VIDEO SPEED: {video_speed:.4f}x -> final video duration={final_duration:.2f}s "
          f"(exact match to voice, no dead silence, no post-hoc voice tempo change)")

    print("[7/7] writing subtitles from the actual synthesized voice, then muxing")
    entries = build_recap_caption_entries(sentence_results, placements)
    ass_path = write_subtitle_outputs(entries, out_srt, width, height, workdir, sub)
    mux_video_single(input_video, audio_wav, ass_path, video_speed, final_duration, video_duration,
                      blur_boxes, width, height, flip_video, auto_color, out_video, aspect_filter)

    print(f"SENTENCE_COUNT:{len(sentences)}")
    print(f"VOICE_DURATION:{voice_duration:.3f}")
    print(f"VIDEO_DURATION:{final_duration:.3f}")
    print(f"VIDEO_SPEED:{video_speed:.4f}")
    return out_video


def process_subtitle_only(input_video, workdir, words, lang, video_duration, width, height,
                           out_video, out_srt, gemini_keys, style_text, length_mult,
                           sub, blur_boxes, flip_video, auto_color, aspect_filter=None):
    print("[4/6] grouping into scene-anchored blocks (speaker-turn based)")
    blocks = group_scene_blocks(words, lang)
    classify_dialogue(blocks)
    compute_scene_spans(blocks, video_duration)
    compute_budgets(blocks, length_mult)
    n_dialogue = sum(1 for b in blocks if b["is_dialogue"])
    print(f"      {len(blocks)} blocks: {n_dialogue} dialogue, {len(blocks) - n_dialogue} narration")
    if not blocks:
        raise RuntimeError("no usable blocks produced from transcript")

    print("[5/6] translating blocks with Gemini (dialogue-aware)")
    blocks = translate_blocks(blocks, gemini_keys, style_text)
    if not blocks:
        raise RuntimeError("no blocks survived translation")

    print("[6/6] writing subtitles from source timing, then muxing (original audio kept, no voice)")
    texts = [b["translation"] for b in blocks]
    placements = [(b["start"], b["end"] - b["start"]) for b in blocks]
    entries = build_subtitle_entries(texts, placements)
    ass_path = write_subtitle_outputs(entries, out_srt, width, height, workdir, sub)
    mux_subtitle_only(input_video, ass_path, blur_boxes, width, height, flip_video, auto_color, out_video,
                       aspect_filter)

    print(f"BLOCK_COUNT:{len(blocks)}")
    print(f"DIALOGUE_COUNT:{n_dialogue}")
    print(f"NARRATION_COUNT:{len(blocks) - n_dialogue}")
    return out_video


def process(input_video, workdir, assemblyai_key, gemini_keys, options):
    mode = options.get("mode") or "dubbing"
    voice = options.get("voice") or DEFAULT_OPTIONS["voice"]
    voice_speed = float(options.get("voice_speed") or DEFAULT_OPTIONS["voice_speed"])
    rate = speed_to_rate(voice_speed)
    recap_length = options.get("recap_length") or "standard"
    recap_tone = options.get("recap_tone") or "neutral"
    watermark = options.get("watermark") or ""
    aspect = options.get("aspect") or "original"
    length_mult = LENGTH_MULTIPLIERS.get(recap_length, 1.0)
    style_text = style_instruction(recap_length, recap_tone)

    sub = {
        "enabled": bool(options.get("subtitles_enabled", True)),
        "mode": options.get("subtitle_mode") or "burn",
        "style": {
            "font": options.get("subtitle_font") or SUBTITLE_FONT_NAME,
            "font_size": options.get("subtitle_font_size") or "medium",
            "color": options.get("subtitle_color") or "white",
            "position": options.get("subtitle_position") or "bottom",
            "custom_box": options.get("subtitle_custom_box") or DEFAULT_OPTIONS["subtitle_custom_box"],
            "background": options.get("subtitle_background") or "none",
        },
    }
    blur_boxes = (options.get("blur_boxes") or [])[:3] if options.get("blur_enabled") else []
    # Each box carries its own style ("smooth"/"mosaic"/"remove") rather
    # than threading a parameter through every mux/build_post_filters call
    # site - build_blur_stage just reads box["style"]. Default fills in
    # only if a box arrives without one (e.g. an older saved preset).
    blur_boxes = [dict(b, style=b.get("style") or DEFAULT_BLUR_STYLE) for b in blur_boxes]

    flip_video = bool(options.get("flip_video", False))
    auto_color = bool(options.get("auto_color", False))
    intro_outro_enabled = bool(options.get("intro_outro_enabled", False))
    intro_path = options.get("intro_path") or None
    outro_path = options.get("outro_path") or None

    # A flip mirrors the whole frame; boxes were placed by dragging on the
    # ORIGINAL (unflipped) preview, so mirror their x here to keep them over
    # the same visual content once the frame itself is mirrored.
    if flip_video:
        blur_boxes = [mirror_box_x(b) for b in blur_boxes]
        if sub["style"]["position"] == "custom":
            sub["style"]["custom_box"] = mirror_box_x(sub["style"]["custom_box"])

    print(f"options: mode={mode} voice={voice} rate={rate} recap_length={recap_length} "
          f"recap_tone={recap_tone} watermark={watermark!r} aspect={aspect}")
    print(f"         subtitles: enabled={sub['enabled']} mode={sub['mode']} style={sub['style']}")
    print(f"         blur: {len(blur_boxes)} box(es), styles={[b['style'] for b in blur_boxes]}")
    print(f"         flip_video={flip_video} auto_color={auto_color} "
          f"intro_outro_enabled={intro_outro_enabled} intro={bool(intro_path)} outro={bool(outro_path)}")

    stem = input_video.stem
    out_video = input_video.parent / f"{stem}-mm.mp4"
    out_srt = input_video.parent / f"{stem}-mm.srt"

    print(f"[1/8] probing video: {input_video.name}")
    video_duration = ffprobe_duration(input_video)
    width, height = probe_dimensions(input_video)
    print(f"      duration = {video_duration:.2f}s, {width}x{height}")

    aspect_mode = options.get("aspect_mode") or "fill"
    aspect_filter = None
    if aspect in ASPECT_RATIOS:
        target_ratio = ASPECT_RATIOS[aspect][0] / ASPECT_RATIOS[aspect][1]
    elif aspect == "custom":
        cw = float(options.get("aspect_custom_w") or DEFAULT_OPTIONS["aspect_custom_w"])
        ch = float(options.get("aspect_custom_h") or DEFAULT_OPTIONS["aspect_custom_h"])
        target_ratio = cw / ch if cw > 0 and ch > 0 else None
    else:
        target_ratio = None
    if target_ratio:
        orig_w, orig_h = width, height
        width, height, aspect_filter = compute_aspect_reframe(width, height, target_ratio, aspect_mode)
        print(f"      aspect reframe: {aspect} ({aspect_mode}) {orig_w}x{orig_h} -> {width}x{height}")

    print("[2/8] extracting audio with ffmpeg")
    wav_path = workdir / "audio.wav"
    extract_wav(input_video, wav_path)

    print("[3/8] transcribing with AssemblyAI (language_detection + speaker diarization)")
    words, lang = transcribe(wav_path, assemblyai_key)
    print(f"      detected language: {lang}, {len(words)} words")
    if not words:
        raise RuntimeError("no speech found in transcript")

    if mode == "subtitle_only":
        out_video = process_subtitle_only(
            input_video, workdir, words, lang, video_duration, width, height,
            out_video, out_srt, gemini_keys, style_text, length_mult,
            sub, blur_boxes, flip_video, auto_color, aspect_filter,
        )
    elif mode == "ai_recap":
        out_video = process_ai_recap(
            input_video, workdir, words, lang, video_duration, width, height,
            out_video, out_srt, gemini_keys, voice, rate, style_text, length_mult,
            sub, blur_boxes, flip_video, auto_color, aspect_filter,
        )
    else:
        out_video = process_dubbing(
            input_video, workdir, words, lang, video_duration, width, height,
            out_video, out_srt, gemini_keys, voice, rate, style_text, length_mult,
            sub, blur_boxes, flip_video, auto_color, aspect_filter,
        )

    if intro_outro_enabled and (intro_path or outro_path):
        print("[+] applying intro/outro")
        apply_intro_outro(out_video, intro_path, outro_path, width, height, workdir)

    print(f"\ndone: {out_video}")
    print(f"      {out_srt}")
    print(f"OUTPUT_PATH:{out_video}")
    print(f"MODE:{mode}")
    return out_video


def main():
    if len(sys.argv) < 2:
        print("error: no input video given")
        sys.exit(1)
    input_video = Path(sys.argv[1]).expanduser().resolve()
    if not input_video.exists():
        print(f"error: input file not found: {input_video}")
        sys.exit(1)

    options = load_options(sys.argv[2] if len(sys.argv) > 2 else None)

    env = load_env(SCRIPT_DIR / ".env")
    assemblyai_key = env.get("ASSEMBLYAI_API_KEY", "")
    gemini_keys = [
        env.get("GEMINI_API_KEY_1", ""),
        env.get("GEMINI_API_KEY_2", ""),
        env.get("GEMINI_API_KEY_3", ""),
    ]
    gemini_keys = [k for k in gemini_keys if k]
    if not assemblyai_key:
        print("error: ASSEMBLYAI_API_KEY missing in .env")
        sys.exit(1)
    if not gemini_keys:
        print("error: no GEMINI_API_KEY_* set in .env")
        sys.exit(1)

    try:
        with tempfile.TemporaryDirectory(prefix="recap_pro_") as workdir_str:
            process(input_video, Path(workdir_str), assemblyai_key, gemini_keys, options)
    except GeminiFatalError as e:
        print(f"\n{e}")
        sys.exit(1)
    except Exception:
        print("\n--- FAILED ---")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
