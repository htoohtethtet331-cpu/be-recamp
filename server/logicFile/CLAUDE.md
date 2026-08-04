# Recap Pro — project spec

## What this tool does
Personal Mac tool. I drop in a finished English or Chinese TikTok recap
video. It outputs a ready-to-post mp4 with a Burmese voiceover.
This is TRANSLATION of the video's own transcript. No script writing.

## Hard rules — never break these
- ZERO options. No settings, no sliders, no flags. Drop video in, get mp4 out.
- Voice speed is ALWAYS +30%. This is my standard. Never make it adjustable.
- Video speed may slow to 0.90x at worst. Never slower - it looks bad.
- Original audio is dropped completely. Burmese voice only.
- Voice runs continuously start to end. No gaps. Nothing cut off at the end.
- SCENE-ANCHORED BLOCKS, NOT ONE CONTINUOUS TRACK AND NOT PER-LINE. A single
  continuous voice track over unmodified video drifts - the whole thing
  slides out of sync because voice duration and video duration disagree by
  the end. Per-line timestamp placement is too tight - Burmese runs 1.5-2x
  longer than English/Chinese, so forcing each line into its exact source
  slot chops the audio or the meaning. The middle ground: group into
  scene-level blocks (typically 3-10s), anchor each block's voice to when
  that block's scene actually starts on screen, and fit each block's
  length against its OWN scene only - never a global track, never a bare
  per-line slot.
- TRANSLATE WHAT'S ACTUALLY SAID, NOT A THIRD-PERSON RECAP SUMMARY. Keep
  whatever person/perspective the source uses - if it's first-person
  ("I did X"), the Burmese is first-person too, not rewritten into "the
  male lead did X". Where the video is real back-and-forth between
  characters, translate the actual lines each one says, kept as an
  exchange - not flattened into narration.
- Build ONE working method. Do not offer me alternatives to choose from.

## Pipeline (proven - do not redesign it)
1. ffmpeg: extract wav.
2. AssemblyAI with language_detection=True and speaker_labels=True (never
   force a language). Diarization is what tells scene blocks apart from
   dialogue turns - a block whose speaker differs from the block next to
   it is a real turn boundary, not a guess.
3. Group into scene blocks directly from words:
   - A speaker change ALWAYS starts a new block - that's what turns a
     back-and-forth into a few adjacent short blocks instead of one
     merged blob.
   - Within one uninterrupted speaker run, break at a sentence end or a
     clause-level break (comma included, not just . ? !) or a >=0.9s
     pause, once the block has reached >=3s. Force a break past 10s
     regardless of punctuation, so one comma-free stretch can't run away.
   - Drop any block over 45 characters per second (bad transcription).
4. Tag each block: "dialogue" if its speaker differs from the block right
   before or after it (sitting at a turn boundary); "narration" otherwise
   (an uninterrupted single-speaker run, or the only speaker in the video -
   that's a legitimate outcome, not every video has real back-and-forth).
5. Translate in Gemini batches of 35 (gemini-3.6-flash, maxOutputTokens
   16384, JSON array output, one string per block). Pass each block's
   dialogue/narration tag and speaker id, and the previous block's Burmese
   translation as context so it flows. Character budget: ~16 chars per
   second of the block's scene duration, no hard floor - a faithful line
   that runs a little long beats one chopped short, since local tempo/
   video-speed fit (step 7) can absorb some overshoot.
6. edge-tts, Burmese voice, fixed rate="+30%", one clip per block (blocks
   are already short enough for a single TTS call - no further splitting
   needed). Trim leading/trailing silence from every clip.
7. Fit PER BLOCK, locally, against that block's own scene - never a global
   track-wide fit:
   - Voice longer than its scene: nudge voice tempo up to 1.15x, then slow
     JUST that block's video segment down to 0.90x at worst.
   - Voice shorter than its scene: hold - the video segment plays at
     normal speed, the leftover time is silence.
   Build the final video as N retimed segments (trim + setpts per block)
   concatenated back to back, and the final audio as N matching segments
   (voice, tempo-adjusted, padded to the same length) concatenated with a
   short crossfade - both built from the identical sequence of segment
   durations, so they can't drift apart the way one track over fixed video
   did.
8. Build subtitle cues (5-7 words per block) from the ACTUAL measured
   duration of each synthesized block after all speed changes - not the
   original transcript timing. Write these out twice:
   - a plain .srt, kept as a normal output file for when a soft-sub version
     is wanted.
   - a hand-built .ass with an explicit PlayResX/PlayResY matching the
     video's real pixel dimensions, and a Style line carrying the font,
     size, colors and position below - this is what actually gets burned
     in, not the .srt.
9. ffmpeg mux + hardsub in the same pass: burn the .ass in with the `ass`
   libass filter, then pad the last frame so nothing is cut. Style: Noto
   Sans Myanmar, white text, thin black outline (no box, no shadow),
   bottom-center, medium size, sized as a fraction of video height (not
   fixed pixels) so it holds up across resolutions:
   - FontSize  = 3.2% of video height
   - Outline   = 5% of that font size
   - MarginV   = 12% of video height (safe margin off the bottom, clear of
     TikTok's UI)
   This needs ffmpeg-full (installed via `brew install ffmpeg-full`,
   kept keg-only) - the plain `ffmpeg` formula ships without libass and
   has no subtitles/ass filter at all.

## Bugs already found - do not reintroduce
- Gemini 3.x returns a THINKING part first in candidates[0].content.parts.
  Join only the parts where `thought` is not true. Reading parts[0].text
  gives you the thought and the translation comes back empty.
- Never use `PROMPT % payload`. A literal "%" in the prompt breaks it.
  Use placeholders (e.g. __TRANSCRIPT__) with .replace() instead.
- Gemini is on a paid billing tier now - free-tier quota limits no longer
  apply. Pace 1s between requests. On 429/503, back off 3s, 10s, 25s across
  rotating keys before giving up on the whole job - there's no such thing
  as a partial narration to drop, so a translation request that still
  fails after retries is fatal, not skippable.
- A 403 PERMISSION_DENIED from Gemini is a billing/access problem, not a
  rate limit. Never retry or back off on it - stop immediately and print
  "Gemini key rejected: check billing on this project".
- Do not use Whisper. AssemblyAI only - more accurate, installs in 30s.
- Do not force language="en". It hallucinates on Chinese audio.
- MP3 chunk duration must be read from the real frame headers, not estimated
  from word-boundary ends, or the SRT drifts over the length of the file.
- ffmpeg's silenceremove `stop_periods` triggers on the FIRST internal pause
  it finds, not the genuine trailing silence - it cut clips down to a
  fraction of a second, chopping off real speech. Trim trailing silence
  with the reverse / trim-start / reverse trick instead, using only
  `start_periods` (twice, once reversed).
- Concatenating trimmed TTS clips back to back with a hard cut can leave an
  audible click at the seam. Use a short (~20ms) crossfade between
  sentences.
- The plain Homebrew `ffmpeg` formula has no libass/fontconfig - no
  `subtitles` or `ass` filter exists at all, it just silently isn't in
  `ffmpeg -filters`. Use `ffmpeg-full` for muxing (installed keg-only
  alongside it, so it doesn't touch the system-wide `ffmpeg` symlink other
  tools may rely on).
- Handing a plain .srt to the `subtitles` filter with `force_style` and no
  declared script resolution makes libass guess one, and FontSize/MarginV
  came out scaled ~4-5x from what was requested (text way too big and
  pushed up out of the lower third) - `original_size` did NOT fix this.
  Build a proper .ass with an explicit PlayResX/PlayResY matching the
  video's real dimensions instead; that removes the ambiguity entirely.
- Myanmar text renders as tofu boxes unless the subtitle style explicitly
  names a Myanmar-capable font (FontName=Noto Sans Myanmar in the .ass
  Style line). It's already on macOS as a system font, so no install is
  needed - just verify it loads (check the ffmpeg log for a
  "fontselect: (Noto Sans Myanmar...)" line, or render a frame and look).
- A single global tempo/video-speed fit applied to one continuous voice
  track over unmodified video looks fine on a short clip but drifts on
  anything longer - voice duration and video duration only have to
  disagree slightly for the mismatch to grow across the whole video. Fit
  per scene block instead (see pipeline step 7); each block's video
  segment and voice segment are built from the same duration, so they
  can't drift apart from each other.
- Telling Gemini to write "the way a recap narrator would tell the story"
  pushes it toward third-person summary even when the source is first-
  person ("I did X") - it will rewrite "I" as "the male lead". Ask it to
  preserve whatever person/perspective the original actually uses instead
  of naming a narration style.
- Only break scene blocks on ". ! ?" and diarized speaker changes and
  blocks run way past the 3-10s target (12-14s) on dense narration with
  few full stops. Chinese commas ("，") separate clauses just as often as
  periods do - include clause-level punctuation in the break set, not
  just sentence-enders, once a block has reached the minimum length.

## Keys
Read from .env in this folder. Normally just one Gemini key (paid tier,
no need to rotate for quota). GEMINI_API_KEY_2 and GEMINI_API_KEY_3 may be
blank - that's not an error. If more than one key is present, still rotate
across them on retryable errors.

## How to work with me
- Run the tool yourself on test.mp4. Read the real error output. Fix it.
  Run it again. Repeat until it produces a working mp4.
- Do not ask me to copy error messages to you. You have a terminal.
- At the end tell me only what you changed, in short plain sentences.
