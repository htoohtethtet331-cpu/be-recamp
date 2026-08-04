import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { CheckCircle2, Download, Play, Loader2, AlertTriangle, Sparkles, Copy, Settings, Zap, SlidersHorizontal, ArrowRight, Video } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreURL from './assets/ffmpeg/ffmpeg-core.js?url';
import wasmURL from './assets/ffmpeg/ffmpeg-core.wasm?url';
import AdminDashboard from './components/AdminDashboard';

const AILoadingState = ({ steps, progress = 0, compact = false }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!steps || steps.length === 0) return;
    let charIndex = 0;
    const targetText = steps[currentStep] || '';
    setText('');
    const typingInterval = setInterval(() => {
      if (charIndex < targetText.length) {
        setText((prev) => prev + targetText.charAt(charIndex));
        charIndex++;
      } else {
        clearInterval(typingInterval);
        setTimeout(() => {
          if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
          } else {
            setCurrentStep(0);
          }
        }, 1500);
      }
    }, 40);
    return () => clearInterval(typingInterval);
  }, [currentStep, steps]);

  return (
    <div className={`flex flex-col items-center justify-center ${compact ? 'space-y-2 py-3' : 'space-y-6 py-10'} bg-white/20 rounded-3xl border border-white/40 backdrop-blur-xl ${compact ? '' : 'mt-6'} shadow-2xl`}>
      <div className={`relative flex ${compact ? 'h-10 w-10' : 'h-20 w-20'} items-center justify-center`}>
        <div className="absolute h-full w-full animate-ping rounded-full bg-blue-200 opacity-50"></div>
        <div className={`absolute ${compact ? 'h-7 w-7' : 'h-14 w-14'} animate-pulse rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 shadow-[0_0_30px_rgba(59,130,246,0.5)]`}></div>
        <Sparkles className={`absolute ${compact ? 'h-4 w-4' : 'h-7 w-7'} animate-pulse text-white`} />
      </div>
      <div className={`flex flex-col items-center ${compact ? 'gap-1' : 'gap-3'} w-full px-4`}>
        <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'} font-bold text-blue-700 uppercase tracking-widest drop-shadow-sm`}>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500"></span>
          </span>
          AI is {compact ? 'working' : 'thinking'}
        </div>
        <div className={`font-mono ${compact ? 'text-[10px] h-4' : 'text-sm h-6'} text-gray-800 bg-white/50 px-3 py-1 rounded-full shadow-inner border border-white/50 backdrop-blur-md`}>
          {text}
          <span className="animate-pulse font-bold text-blue-600 ml-1">|</span>
        </div>
        
        {progress > 0 && (
          <div className="w-full mt-2 max-w-[250px]">
            <div className={`flex justify-between ${compact ? 'text-[8px]' : 'text-xs'} text-blue-700 mb-1 font-mono font-bold px-1`}>
              <span>PROCESSING</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className={`w-full bg-white/40 rounded-full ${compact ? 'h-1.5' : 'h-3'} overflow-hidden shadow-inner border border-white/50`}>
              <div 
                className="bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-500 h-full rounded-full transition-all duration-[2000ms] ease-out relative"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              >
                <div className="absolute inset-0 bg-white/30 animate-[shimmer_1.5s_infinite]"></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoadingText, setFfmpegLoadingText] = useState('');
  const [ffmpegProgress, setFfmpegProgress] = useState(0);
  const ffmpegRef = useRef(new FFmpeg());
  const renderFfmpegRef = useRef(new FFmpeg());

  const loadFfmpeg = async () => {
    const ffmpeg = ffmpegRef.current;
    const renderFfmpeg = renderFfmpegRef.current;
    ffmpeg.on('progress', ({ progress }) => {
      if (progress >= 0 && progress <= 1) setFfmpegProgress(progress * 100);
    });
    setFfmpegLoadingText('ပထမဆုံးအကြိမ် စတင်သုံးစွဲသူဖြစ်တဲ့အတွက် အင်ဂျင်ကို တပ်ဆင်နေပါတယ်... (Downloading Engine - ~30MB)');
    try {
      await Promise.all([ffmpeg.load({ coreURL, wasmURL }), renderFfmpeg.load({ coreURL, wasmURL })]);
      setFfmpegLoadingText('အင်ဂျင် တပ်ဆင်ပြီးပါပြီ! အသုံးပြုနိုင်ပါပြီ။ (Engine Ready!)');
      setTimeout(() => setFfmpegLoaded(true), 1500);
    } catch (e) {
      setFfmpegLoadingText('အင်ဂျင် တပ်ဆင်ရာတွင် အခက်အခဲရှိနေပါသည်။ Internet Connection ကို စစ်ဆေးပေးပါ။');
    }
  };

  useEffect(() => { loadFfmpeg(); }, []);

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [utterances, setUtterances] = useState([]);
  const [step2Text, setStep2Text] = useState('');
  const [step3Text, setStep3Text] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('my-MM-NilarNeural');
  
  // App Mode & Admin
  const [appMode, setAppMode] = useState('auto'); // 'auto' or 'manual'
  const [showAdmin, setShowAdmin] = useState(false);

  // Manual Mode States
  const [translationMode, setTranslationMode] = useState(null);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [manualTranslationInput, setManualTranslationInput] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const [videoUrl, setVideoUrl] = useState('');
  const [backgroundTask, setBackgroundTask] = useState({ status: 'idle', progress: 0, videoUrl: '', error: '' });
  const [videoSegments, setVideoSegments] = useState([]);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoUrl('');
    }
  }, [file]);

  const apiUrl = import.meta.env.PROD ? (import.meta.env.VITE_API_URL || '/api') : `http://${window.location.hostname}:5001/api`;

  const resetFlow = () => {
    setStep(1); setUtterances([]); setStep2Text(''); setStep3Text('');
    setDownloadUrl(''); setError('');
    setBackgroundTask({ status: 'idle', progress: 0, videoUrl: '', error: '' });
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      resetFlow();
    }
  };

  // ----- AUTO MODE LOGIC -----
  const handleAutoProcess = async () => {
    if (!file) { setError('Please select a video file first.'); return; }
    setLoading(true); setFfmpegProgress(0); setError('');

    try {
      // Step 1: Extract
      setLoadingSteps(["AI က ဗီဒီယိုကို လေ့လာနေပါသည်...", "အသံဖိုင်ကို သီးသန့် ခွဲထုတ်နေပါသည်...", "စကားသံများကို နားထောင်ပြီး စာသားအဖြစ် ပြောင်းလဲနေပါသည်..."]);
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile('input_video.mp4', await fetchFile(file));
      await ffmpeg.exec(['-i', 'input_video.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', 'extracted_audio.mp3']);
      const audioData = await ffmpeg.readFile('extracted_audio.mp3');
      const formData = new FormData();
      formData.append('audio', new File([new Blob([audioData.buffer], { type: 'audio/mp3' })], 'extracted_audio.mp3', { type: 'audio/mp3' }));
      
      const extractRes = await axios.post(`${apiUrl}/step1-extract`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const extractedUtterances = extractRes.data.utterances;

      // Step 2: Translate (Uses Database Key)
      setLoadingSteps(["အင်္ဂလိပ်စာသားများကို မြန်မာလို အလိုအလျောက် ဘာသာပြန်နေပါသည်...", "စကားပြောသကဲ့သို့ သဘာဝကျအောင် ပြုပြင်နေပါသည်..."]);
      const translateRes = await axios.post(`${apiUrl}/step2-translate`, { utterances: extractedUtterances });
      const translatedUtterances = translateRes.data.translatedUtterances;

      // Step 3: TTS & Mix
      setLoadingSteps(["AI က မြန်မာအသံထွက်များကို ဖန်တီးနေပါသည်...", "အသံအနှေးအမြန်များကို ကိုက်ညီအောင် ညှိနေပါသည်..."]);
      const ttsRes = await axios.post(`${apiUrl}/step3-tts`, { translatedUtterances, voice: selectedVoice });
      
      setDownloadUrl(ttsRes.data.url);
      if (ttsRes.data.videoSegments) setVideoSegments(ttsRes.data.videoSegments);
      if (ttsRes.data.updatedUtterances) setUtterances(ttsRes.data.updatedUtterances);
      
      setStep(4);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Auto Process failed.');
    } finally {
      setLoading(false);
      setLoadingSteps([]);
    }
  };

  // ----- MANUAL MODE LOGIC -----
  const handleExtractManual = async () => {
    if (!file) return;
    setLoading(true); setFfmpegProgress(0); setError('');
    setLoadingSteps(["အသံထုတ်ယူနေပါသည်...", "စာသားအဖြစ် ပြောင်းလဲနေပါသည်..."]);
    try {
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile('input_video.mp4', await fetchFile(file));
      await ffmpeg.exec(['-i', 'input_video.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', 'extracted_audio.mp3']);
      const audioData = await ffmpeg.readFile('extracted_audio.mp3');
      const formData = new FormData();
      formData.append('audio', new File([new Blob([audioData.buffer], { type: 'audio/mp3' })], 'extracted.mp3'));
      
      const res = await axios.post(`${apiUrl}/step1-extract`, formData);
      setUtterances(res.data.utterances);
      setStep2Text(res.data.utterances.map(u => u.text).join('\n\n'));
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false); setLoadingSteps([]);
    }
  };

  const handleTranslateManual = async () => {
    setLoading(true); setError('');
    setLoadingSteps(["ဘာသာပြန်နေပါသည်..."]);
    try {
      const chunks = step2Text.split(/\n\n+/);
      const updated = utterances.map((u, i) => ({ ...u, text: chunks[i] !== undefined ? chunks[i].trim() : u.text }));
      setUtterances(updated);
      const res = await axios.post(`${apiUrl}/step2-translate`, { utterances: updated, apiKey: geminiApiKey });
      setUtterances(res.data.translatedUtterances);
      setStep3Text(res.data.translatedUtterances.map(u => u.translatedText).join('\n\n'));
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false); setLoadingSteps([]);
    }
  };

  const handleManualCopy = () => {
    const chunks = step2Text.split(/\\n\\n+/);
    const updatedUtterances = utterances.map((u, i) => ({
      ...u,
      text: chunks[i] !== undefined ? chunks[i].trim() : u.text
    }));
    setUtterances(updatedUtterances);

    const textArray = updatedUtterances.map((u, i) => {
      let maxDuration = (u.end - u.start) / 1000;
      if (i < updatedUtterances.length - 1) {
        const nextStart = updatedUtterances[i + 1].start / 1000;
        const currentStart = u.start / 1000;
        const gapToNext = nextStart - currentStart;
        if (gapToNext > maxDuration) {
          maxDuration = gapToNext - 0.1;
        }
      }
      return `ID: ${i} | Time Frame: ${(u.start / 1000).toFixed(1)}s to ${((u.start / 1000) + maxDuration).toFixed(1)}s (Max Limit: ${maxDuration.toFixed(1)}s) | Text: "${u.text}"`;
    }).join('\\n');

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

    const fallbackCopyTextToClipboard = (text) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 3000);
        } else {
          setError('Failed to copy to clipboard.');
        }
      } catch (err) {
        setError('Failed to copy to clipboard.');
      }
      document.body.removeChild(textArea);
    };

    if (!navigator.clipboard) {
      fallbackCopyTextToClipboard(prompt);
    } else {
      navigator.clipboard.writeText(prompt).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
      }).catch(err => {
        fallbackCopyTextToClipboard(prompt);
      });
    }
  };

  const handleManualSubmit = () => {
    try {
      setError('');
      const parsed = JSON.parse(manualTranslationInput);
      
      if (!parsed.translations || !Array.isArray(parsed.translations)) {
        throw new Error('Invalid JSON format. Ensure it contains a "translations" array.');
      }

      if (parsed.translations.length !== utterances.length) {
        console.warn(`Translation length mismatch: Expected ${utterances.length}, got ${parsed.translations.length}. Proceeding anyway.`);
      }

      const updatedUtterances = utterances.map((u, i) => ({
        ...u,
        translatedText: parsed.translations[i] || u.text
      }));

      setUtterances(updatedUtterances);
      setStep3Text(updatedUtterances.map(u => u.translatedText).join('\\n\\n'));
      setStep(3);
    } catch (err) {
      setError('JSON ဖတ်၍မရပါ။ Gemini မှ ပြန်ပေးသော JSON Object ကို အတိအကျ Paste လုပ်ပေးပါ။ Error: ' + err.message);
    }
  };

  const handleTTSManual = async () => {
    setLoading(true); setError('');
    setLoadingSteps(["အသံဖန်တီးနေပါသည်..."]);
    try {
      const chunks = step3Text.split(/\n\n+/);
      const updated = utterances.map((u, i) => ({ ...u, translatedText: chunks[i] !== undefined ? chunks[i].trim() : u.translatedText }));
      setUtterances(updated);
      const res = await axios.post(`${apiUrl}/step3-tts`, { translatedUtterances: updated, voice: selectedVoice });
      setDownloadUrl(res.data.url);
      if (res.data.videoSegments) setVideoSegments(res.data.videoSegments);
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false); setLoadingSteps([]);
    }
  };

  const handleDownloadVideo = async () => {
    setBackgroundTask({ status: 'rendering', progress: 0, videoUrl: '', error: '' });
    try {
      const renderFfmpeg = renderFfmpegRef.current;
      renderFfmpeg.on('progress', ({ progress }) => {
        if (progress >= 0 && progress <= 1) setBackgroundTask(prev => ({ ...prev, progress: progress * 100 }));
      });

      await renderFfmpeg.writeFile('input.mp4', await fetchFile(file));
      await renderFfmpeg.writeFile('tts.mp3', await fetchFile(downloadUrl));

      let needsStretching = false;
      if (videoSegments && videoSegments.length > 0) {
        needsStretching = videoSegments.some(seg => Math.abs(seg.videoSpeed - 1.0) > 0.001);
      }

      let filterScript = '';
      const ffmpegArgs = ['-i', 'input.mp4', '-i', 'tts.mp3'];

      if (needsStretching) {
        let concatInputs = ''; let vIndex = 0;
        const fullSegments = [...videoSegments];
        let splitOutputs = '';
        for (let i = 0; i < fullSegments.length; i++) splitOutputs += `[s${i}]`;
        filterScript += `[0:v]split=${fullSegments.length}${splitOutputs};\n`;

        fullSegments.forEach((seg) => {
          if (seg.originalStart >= seg.originalEnd) return;
          filterScript += `[s${vIndex}]trim=${seg.originalStart}:${seg.originalEnd},setpts=${(1/seg.videoSpeed).toFixed(4)}*(PTS-STARTPTS)[v${vIndex}];\n`;
          concatInputs += `[v${vIndex}]`;
          vIndex++;
        });
        filterScript += `${concatInputs}concat=n=${vIndex}:v=1:a=0[outv]\n`;
        await renderFfmpeg.writeFile('filter.txt', new TextEncoder().encode(filterScript));
        ffmpegArgs.push('-filter_complex_script', 'filter.txt', '-map', '[outv]');
      } else {
        ffmpegArgs.push('-map', '0:v');
      }

      ffmpegArgs.push('-map', '1:a');
      if (needsStretching) {
        ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast');
      } else {
        ffmpegArgs.push('-c:v', 'copy');
      }
      ffmpegArgs.push('-c:a', 'aac', '-shortest', 'output.mp4');

      await renderFfmpeg.exec(ffmpegArgs);
      
      const outData = await renderFfmpeg.readFile('output.mp4');
      const outUrl = URL.createObjectURL(new Blob([outData.buffer], { type: 'video/mp4' }));
      
      setBackgroundTask({ status: 'done', progress: 100, videoUrl: outUrl, error: '' });
      
      await renderFfmpeg.deleteFile('input.mp4');
      await renderFfmpeg.deleteFile('tts.mp3');
      await renderFfmpeg.deleteFile('output.mp4');
      if (needsStretching) await renderFfmpeg.deleteFile('filter.txt');
    } catch (err) {
      console.error(err);
      setBackgroundTask({ status: 'error', progress: 0, videoUrl: '', error: err.message || 'Render failed' });
    }
  };

  const handleDownloadSRT = () => {
    const srtContent = utterances.map((u, i) => {
      const formatTime = (ms) => {
        const d = new Date(ms);
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')},${String(d.getUTCMilliseconds()).padStart(3, '0')}`;
      };
      const start = formatTime(u.newStartMs || u.start);
      const end = formatTime(u.newEndMs || u.end);
      return `${i + 1}\n${start} --> ${end}\n${u.translatedText || u.text}\n`;
    }).join('\n');

    const blob = new Blob([srtContent], { type: 'text/srt' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Recap_${Date.now()}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!ffmpegLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-6 font-sans flex items-center justify-center">
        <div className="max-w-md w-full bg-white/20 backdrop-blur-2xl p-8 rounded-[2.5rem] shadow-2xl border border-white/40 text-center space-y-6">
          <div className="relative flex h-24 w-24 mx-auto items-center justify-center">
            <div className="absolute h-full w-full animate-spin rounded-full border-[5px] border-white/30 border-t-white"></div>
            <Sparkles className="h-10 w-10 text-white animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold text-white drop-shadow-md">Recap Studio AI</h2>
          <p className="text-white/90 font-medium leading-relaxed drop-shadow-sm">{ffmpegLoadingText}</p>
        </div>
      </div>
    );
  }

  if (showAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 font-sans p-6 flex flex-col items-center justify-center relative">
         <AdminDashboard onBack={() => setShowAdmin(false)} apiUrl={apiUrl} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center p-4 md:p-8 font-sans relative overflow-hidden">
      
      {/* Decorative Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-pink-500/30 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/30 blur-[120px] pointer-events-none"></div>

      {backgroundTask.status !== 'idle' && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center bg-white/30 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] border border-white/40 rounded-full pl-3 pr-6 py-3 gap-4 transition-all duration-500 hover:scale-105">
          {backgroundTask.status === 'rendering' && (
            <>
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                  <path className="text-white/20" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-white transition-all duration-[2000ms] ease-out" strokeDasharray={`${backgroundTask.progress}, 100`} strokeWidth="3.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span className="absolute text-[12px] font-extrabold text-white font-mono">{Math.round(backgroundTask.progress)}%</span>
              </div>
              <div className="flex flex-col justify-center text-white">
                <span className="text-sm font-bold leading-tight">Processing Video...</span>
                <span className="text-xs text-white/80 font-medium">Please wait</span>
              </div>
            </>
          )}
          {backgroundTask.status === 'done' && (
            <>
               <div className="w-12 h-12 bg-green-400/30 rounded-full flex items-center justify-center shadow-inner border border-green-400/50">
                 <CheckCircle2 className="w-7 h-7 text-green-100" />
               </div>
               <div className="flex flex-col justify-center text-white">
                 <span className="text-sm font-bold leading-tight">Finished!</span>
                 <a href={backgroundTask.videoUrl} download={`Recap_${Date.now()}.mp4`} className="text-xs text-green-100 font-bold hover:underline">Download Video</a>
               </div>
               <button onClick={() => setBackgroundTask({ status: 'idle', progress: 0, videoUrl: '', error: '' })} className="ml-4 p-2 text-white/60 hover:text-white transition-colors bg-white/10 rounded-full">&times;</button>
            </>
          )}
          {backgroundTask.status === 'error' && (
            <>
               <div className="w-12 h-12 bg-red-400/30 rounded-full flex items-center justify-center shadow-inner border border-red-400/50">
                 <AlertTriangle className="w-7 h-7 text-red-100" />
               </div>
               <div className="flex flex-col justify-center text-white">
                 <span className="text-sm font-bold leading-tight">Failed</span>
                 <span className="text-xs text-red-100 truncate max-w-[150px]">{backgroundTask.error}</span>
               </div>
               <button onClick={() => setBackgroundTask({ status: 'idle', progress: 0, videoUrl: '', error: '' })} className="ml-4 p-2 text-white/60 hover:text-white transition-colors bg-white/10 rounded-full">&times;</button>
            </>
          )}
        </div>
      )}

      {/* Main Glass Panel */}
      <div className="bg-white/10 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_30px_80px_rgba(0,0,0,0.2)] w-full max-w-3xl overflow-hidden border border-white/30 flex flex-col max-h-[90vh] relative z-10">
        
        {/* Header */}
        <div className="bg-white/10 p-5 border-b border-white/20 flex items-center justify-between shrink-0 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl rotate-45 flex items-center justify-center shadow-lg border border-white/30">
              <div className="w-4 h-4 bg-white -rotate-45 rounded-md"></div>
            </div>
            <div>
              <h1 className="font-bold text-white text-xl leading-tight drop-shadow-sm">Recap Studio</h1>
              <p className="text-[11px] text-white/70 tracking-wide font-medium">Next-Gen AI Dubbing</p>
            </div>
          </div>
          <button 
            onClick={() => setShowAdmin(true)}
            className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all shadow-sm"
            title="Admin Dashboard"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="p-6 pb-0 shrink-0">
          <div className="bg-white/10 p-1.5 rounded-2xl flex border border-white/20 backdrop-blur-md">
            <button
              onClick={() => { setAppMode('auto'); resetFlow(); }}
              className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${appMode === 'auto' ? 'bg-white text-indigo-700 shadow-md' : 'text-white/80 hover:text-white hover:bg-white/5'}`}
            >
              <Zap className="w-4 h-4" /> Auto Mode
            </button>
            <button
              onClick={() => { setAppMode('manual'); resetFlow(); }}
              className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${appMode === 'manual' ? 'bg-white text-indigo-700 shadow-md' : 'text-white/80 hover:text-white hover:bg-white/5'}`}
            >
              <SlidersHorizontal className="w-4 h-4" /> Manual Mode
            </button>
          </div>
        </div>

        {/* Main Content (Scrollable) */}
        <div className="p-6 space-y-6 overflow-y-auto grow custom-scrollbar">
          
          {error && (
            <div className="bg-red-500/20 border border-red-400/50 backdrop-blur-md text-red-100 p-4 rounded-2xl flex items-start gap-3 shadow-lg">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-300" />
              <div className="text-sm font-medium">{error}</div>
            </div>
          )}

          {loading && loadingSteps.length > 0 && (
            <AILoadingState steps={loadingSteps} progress={ffmpegProgress} />
          )}

          {!loading && step === 1 && (
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20 shadow-inner">
              <h2 className="font-bold text-white text-lg mb-2">Step 1: Upload Video</h2>
              <p className="text-sm text-white/70 mb-6">Select a video to automatically translate and dub.</p>

              <div className="border-2 border-dashed border-white/40 bg-white/5 rounded-2xl p-8 text-center cursor-pointer relative overflow-hidden transition-all hover:bg-white/10 hover:border-white/60">
                <input type="file" accept="video/*,audio/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={loading} />
                {file ? (
                  <div className="flex flex-col items-center justify-center gap-3 text-white font-medium z-10 relative pointer-events-none">
                    <CheckCircle2 className="w-12 h-12 text-green-400 drop-shadow-md" />
                    <span className="truncate max-w-[250px] text-base">{file.name}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 text-white/80 font-medium z-10 relative pointer-events-none">
                    <Video className="w-12 h-12 opacity-50" />
                    <span>Click or Drag to upload</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Manual Mode Specific Steps */}
          {!loading && appMode === 'manual' && step === 2 && (
             <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20 shadow-inner relative">
               <div className="absolute top-4 right-4 z-10">
                 {translationMode === 'manual' && (
                   <button onClick={handleManualCopy} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg border border-white/30 transition-colors shadow-sm flex items-center gap-1 text-xs font-medium">
                     <Copy className="w-3 h-3" /> {copySuccess ? 'Copied!' : 'Copy Full Prompt'}
                   </button>
                 )}
               </div>
               <h2 className="font-bold text-white text-lg mb-4">Step 2: English Text</h2>
               <textarea value={step2Text} onChange={(e) => setStep2Text(e.target.value)} className="w-full text-sm p-5 rounded-2xl border border-white/30 bg-black/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 min-h-[300px] font-mono leading-relaxed custom-scrollbar" />
             </div>
          )}

          {!loading && appMode === 'manual' && step === 3 && (
             <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20 shadow-inner space-y-6">
               <h2 className="font-bold text-white text-lg">Step 3: Myanmar Translation</h2>
               <textarea value={step3Text} onChange={(e) => setStep3Text(e.target.value)} className="w-full text-sm p-5 rounded-2xl border border-white/30 bg-black/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 min-h-[300px] font-mono leading-relaxed custom-scrollbar" />
             </div>
          )}

          {/* Result Step (Shared) */}
          {!loading && step === 4 && (
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20 shadow-inner text-center space-y-8">
              <div className="w-24 h-24 bg-green-400/20 rounded-full mx-auto flex items-center justify-center border border-green-400/30 shadow-[0_0_50px_rgba(74,222,128,0.2)]">
                <CheckCircle2 className="w-12 h-12 text-green-300 drop-shadow-md" />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white drop-shadow-md mb-2">Success!</h2>
                <p className="text-white/80 text-lg">Your dubbed video is ready to render.</p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <button onClick={handleDownloadVideo} className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-4 px-6 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.3)] transition-all flex items-center justify-center gap-2 hover:scale-[1.02]">
                  <Download className="w-5 h-5" /> Download MP4
                </button>
                <button onClick={handleDownloadSRT} className="flex-1 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold py-4 px-6 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 hover:scale-[1.02]">
                  <Download className="w-5 h-5" /> Download .srt
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!loading && (
          <div className="p-5 bg-white/5 border-t border-white/10 shrink-0 backdrop-blur-xl">
            {appMode === 'auto' && step === 1 && (
              <button onClick={handleAutoProcess} disabled={!file} className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${!file ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-white text-indigo-600 shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-[1.01]'}`}>
                <Sparkles className="w-6 h-6" /> Auto Translate & Dub
              </button>
            )}

            {appMode === 'manual' && step === 1 && (
              <button onClick={handleExtractManual} disabled={!file} className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${!file ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-blue-500 text-white shadow-lg hover:bg-blue-600'}`}>
                Extract Audio <ArrowRight className="w-5 h-5" />
              </button>
            )}
            
            {appMode === 'manual' && step === 2 && (
              <div className="flex flex-col gap-3">
                {!translationMode ? (
                  <>
                    <button onClick={() => { setTranslationMode('manual'); handleManualCopy(); }} className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-purple-500/80 text-white shadow-lg hover:bg-purple-600/90 border border-purple-400/50">
                      Gemini App မှ တစ်ဆင့် ဘာသာပြန်မည်
                    </button>
                    <button onClick={() => setTranslationMode('api')} className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-blue-500/80 text-white shadow-lg hover:bg-blue-600/90 border border-blue-400/50">
                      Gemini API Key ဖြင့် ဆက်သွားမည်
                    </button>
                  </>
                ) : translationMode === 'manual' ? (
                  <div className="bg-black/20 p-4 rounded-2xl border border-white/10 shadow-inner flex flex-col gap-3 text-left">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white">Manual Translation Mode</span>
                      <button onClick={() => setTranslationMode(null)} className="text-xs text-blue-300 hover:text-white">Change Mode</button>
                    </div>
                    {copySuccess && <p className="text-xs text-green-300 font-semibold bg-green-500/20 p-2 rounded-lg border border-green-500/30">Copied to clipboard! Please paste into Gemini and copy the JSON result.</p>}
                    <textarea value={manualTranslationInput} onChange={(e) => setManualTranslationInput(e.target.value)} placeholder="Paste the JSON response from Gemini here..." className="w-full p-3 border border-white/20 bg-white/10 rounded-xl text-sm font-mono h-32 min-h-[8rem] resize-y focus:ring-2 focus:ring-purple-400/50 outline-none text-white placeholder-white/50" />
                    <button onClick={handleManualSubmit} disabled={!manualTranslationInput} className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 relative z-10 ${!manualTranslationInput ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-green-500/80 text-white shadow-lg border border-green-400/50 hover:bg-green-600/90'}`}>
                      Submit Translation <Play className="w-4 h-4 inline" />
                    </button>
                  </div>
                ) : (
                  <div className="bg-black/20 p-4 rounded-2xl border border-white/10 shadow-inner flex flex-col gap-3 text-left">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white">API Key Translation Mode</span>
                      <button onClick={() => setTranslationMode(null)} className="text-xs text-blue-300 hover:text-white">Change Mode</button>
                    </div>
                    <input type="password" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} placeholder="Gemini API Key (Optional if Admin Dashboard is configured)" className="w-full p-3 rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 text-sm" />
                    <button onClick={handleTranslateManual} disabled={loading} className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${loading ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-indigo-500 text-white shadow-lg hover:bg-indigo-600 border border-indigo-400/50'}`}>
                      Translate <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {appMode === 'manual' && step === 3 && (
              <div className="space-y-4">
                <div className="bg-white/10 p-3 rounded-xl border border-white/20 flex gap-4 justify-center">
                  <label className="flex items-center gap-2 cursor-pointer text-white text-sm font-medium">
                    <input type="radio" name="voice" value="my-MM-NilarNeural" checked={selectedVoice === 'my-MM-NilarNeural'} onChange={(e) => setSelectedVoice(e.target.value)} className="w-4 h-4 accent-blue-500" />
                    Nilar (Female)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-white text-sm font-medium">
                    <input type="radio" name="voice" value="my-MM-ThihaNeural" checked={selectedVoice === 'my-MM-ThihaNeural'} onChange={(e) => setSelectedVoice(e.target.value)} className="w-4 h-4 accent-blue-500" />
                    Thiha (Male)
                  </label>
                </div>
                <button onClick={handleTTSManual} className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-purple-500 text-white shadow-lg hover:bg-purple-600">
                  Generate Audio <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
      `}</style>
    </div>
  );
}

export default App;
