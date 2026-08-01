import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { CheckCircle2, Download, RefreshCw, Play, Loader2, AlertTriangle, SlidersHorizontal, ArrowRight, Video, Sparkles, Copy, Settings, LogOut, UploadCloud, Headphones } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from './context/AuthContext';
import AdminDashboard from './components/AdminDashboard';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import coreURL from './assets/ffmpeg/ffmpeg-core.js?url';
import wasmURL from './assets/ffmpeg/ffmpeg-core.wasm?url';

const AILoadingOverlay = ({ isLoading, steps, progress }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!isLoading) {
      setCurrentStep(0);
      setText('');
      return;
    }

    let charIndex = 0;
    const targetText = steps[currentStep] || steps[steps.length - 1] || 'Processing...';
    setText('');

    const typingInterval = setInterval(() => {
      if (charIndex < targetText.length) {
        setText(targetText.substring(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(typingInterval);
      }
    }, 50);

    // Advance step every 4 seconds (except if it's the last step)
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => prev < steps.length - 1 ? prev + 1 : prev);
    }, 4000);

    return () => {
      clearInterval(typingInterval);
      clearInterval(stepInterval);
    };
  }, [isLoading, currentStep, steps]);

  if (!isLoading) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md rounded-3xl overflow-hidden">
      <div className="bg-white/10 border border-white/20 p-8 rounded-2xl flex flex-col items-center justify-center max-w-md w-full shadow-2xl">
        <div className="relative w-20 h-20 mb-6">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-spin blur-md opacity-70"></div>
          <div className="absolute inset-2 bg-gray-900 rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-white animate-pulse" />
          </div>
        </div>
        <h3 className="text-xl font-bold text-white mb-2 text-center h-8">{text}<span className="animate-pulse">_</span></h3>

        {progress > 0 && (
          <div className="w-full mt-4">
            <div className="flex justify-between text-xs text-white/70 mb-1">
              <span>Progress</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AILoadingState = ({ steps, progress = 0, compact = false }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!steps || steps.length === 0) return;

    // Typewriter effect
    let charIndex = 0;
    const targetText = steps[currentStep];
    setText('');

    const typingInterval = setInterval(() => {
      if (charIndex < targetText.length) {
        setText((prev) => prev + targetText.charAt(charIndex));
        charIndex++;
      } else {
        clearInterval(typingInterval);

        // Wait a bit, then go to next step
        setTimeout(() => {
          if (currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
          } else {
            // Loop back to start if it's still loading
            setCurrentStep(0);
          }
        }, 1500);
      }
    }, 40);

    return () => clearInterval(typingInterval);
  }, [currentStep, steps]);

  return (
    <div className={`flex flex-col items-center justify-center ${compact ? 'space-y-2 py-3' : 'space-y-6 py-10'} bg-white/10 backdrop-blur-md/50 rounded-2xl border border-white/20 backdrop-blur-xl ${compact ? '' : 'mt-6'} shadow-sm`}>
      <div className={`relative flex ${compact ? 'h-10 w-10' : 'h-20 w-20'} items-center justify-center`}>
        <div className="absolute h-full w-full animate-ping rounded-full bg-blue-200 opacity-40"></div>
        <div className={`absolute ${compact ? 'h-7 w-7' : 'h-14 w-14'} animate-pulse rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 shadow-xl shadow-blue-500/30`}></div>
        <Sparkles className={`absolute ${compact ? 'h-4 w-4' : 'h-7 w-7'} animate-pulse text-white`} />
      </div>
      <div className={`flex flex-col items-center ${compact ? 'gap-1' : 'gap-3'} w-full px-4`}>
        <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'} font-bold text-blue-300 uppercase tracking-widest`}>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white/10 backdrop-blur-md/100"></span>
          </span>
          AI is {compact ? 'working' : 'thinking'}
        </div>
        <div className={`font-mono ${compact ? 'text-[10px] h-4' : 'text-sm h-6'} text-white drop-shadow-md bg-white/10 backdrop-blur-md/10 px-2 py-0.5 rounded-full shadow-inner border border-white/20`}>
          {text}
          <span className="animate-pulse font-bold text-blue-300 ml-1">|</span>
        </div>

        {progress > 0 && (
          <div className="w-full mt-1 max-w-[200px]">
            <div className={`flex justify-between ${compact ? 'text-[8px]' : 'text-[10px]'} text-blue-300 mb-1 font-mono font-bold px-1`}>
              <span>PROCESSING</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className={`w-full bg-blue-100 rounded-full ${compact ? 'h-1.5' : 'h-2.5'} overflow-hidden shadow-inner border border-white/20`}>
              <div
                className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 h-full rounded-full transition-all duration-[2000ms] ease-out relative"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              >
                <div className="absolute inset-0 bg-white/10 backdrop-blur-md/30 animate-[shimmer_1.5s_infinite]"></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login, logout } = useAuth();
  const isPremium = user?.role === 'admin' || user?.role === 'premium';
  const [appMode, setAppMode] = useState('manual');
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoadingText, setFfmpegLoadingText] = useState('');
  const [ffmpegProgress, setFfmpegProgress] = useState(0);
  const ffmpegRef = useRef(new FFmpeg());
  const renderFfmpegRef = useRef(new FFmpeg()); // Dedicated instance for rendering

  const loadFfmpeg = async () => {
    const ffmpeg = ffmpegRef.current;
    const renderFfmpeg = renderFfmpegRef.current;

    ffmpeg.on('log', ({ message }) => {
      console.log('Extract:', message);
    });

    ffmpeg.on('progress', ({ progress, time }) => {
      if (progress >= 0 && progress <= 1) {
        setFfmpegProgress(progress * 100);
      }
    });

    renderFfmpeg.on('log', ({ message }) => {
      console.log('Render:', message);
    });

    // Note: renderFfmpeg progress will be handled in the specific function

    setFfmpegLoadingText('ပထမဆုံးအကြိမ် စတင်သုံးစွဲသူဖြစ်တဲ့အတွက် အင်ဂျင်ကို တပ်ဆင်နေပါတယ်... (Downloading Engine - ~30MB)');

    try {
      await Promise.all([
        ffmpeg.load({ coreURL, wasmURL }),
        renderFfmpeg.load({ coreURL, wasmURL })
      ]);
      setFfmpegLoadingText('အင်ဂျင် တပ်ဆင်ပြီးပါပြီ! အသုံးပြုနိုင်ပါပြီ။ (Engine Ready!)');
      setTimeout(() => {
        setFfmpegLoaded(true);
      }, 1500);
    } catch (e) {
      console.error(e);
      setFfmpegLoadingText('အင်ဂျင် တပ်ဆင်ရာတွင် အခက်အခဲရှိနေပါသည်။ Internet Connection ကို စစ်ဆေးပေးပါ။');
    }
  };

  useEffect(() => {
    loadFfmpeg();
  }, []);

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [error, setError] = useState('');
  const [finalVideoUrl, setFinalVideoUrl] = useState('');

  // Wizard States
  const [step, setStep] = useState(1);
  const [utterances, setUtterances] = useState([]);
  const [step2Text, setStep2Text] = useState('');
  const [step3Text, setStep3Text] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('my-MM-NilarNeural');

  // Translation Mode States
  const [translationMode, setTranslationMode] = useState(null); // 'manual' | 'api'
  const [geminiApiKey, setGeminiApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [manualTranslationInput, setManualTranslationInput] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // Sync Player States (Simplified)
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState('');

  // Background Render State
  const [backgroundTask, setBackgroundTask] = useState({
    status: 'idle', // 'idle' | 'rendering' | 'done' | 'error'
    progress: 0,
    videoUrl: '',
    error: ''
  });

  const [videoSegments, setVideoSegments] = useState([]);

  // Live Preview States
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState('');
  const previewVideoRef = useRef(null);
  const previewAudioRef = useRef(null);

  // Automatically generate and cleanup the object URL whenever the file changes
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoUrl('');
    }
  }, [file]);

  // Sync logic for Live Preview
  useEffect(() => {
    let animationFrameId;
    if (isPreviewMode && previewVideoRef.current && videoSegments.length > 0) {
      const video = previewVideoRef.current;

      const checkTime = () => {
        const currentTime = video.currentTime;
        const currentSegment = videoSegments.find(
          seg => currentTime >= seg.originalStart && currentTime < seg.originalEnd
        );

        if (currentSegment && currentSegment.videoSpeed > 0) {
          // Playback rate is inversely proportional to videoSpeed.
          // Because videoSpeed = originalDur / newDur
          const newPlaybackRate = 1 / currentSegment.videoSpeed;
          // Constrain playbackRate between 0.1 and 4.0 to avoid browser errors
          const constrainedRate = Math.min(Math.max(newPlaybackRate, 0.1), 4.0);

          if (Math.abs(video.playbackRate - constrainedRate) > 0.05) {
            video.playbackRate = constrainedRate;
          }
        } else {
          if (video.playbackRate !== 1) video.playbackRate = 1;
        }

        animationFrameId = requestAnimationFrame(checkTime);
      };

      animationFrameId = requestAnimationFrame(checkTime);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isPreviewMode, videoSegments]);

  if (!ffmpegLoaded) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[100px] opacity-50"></div>
        
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-10 max-w-md w-full text-center space-y-8 relative z-10">
          <div className="relative flex h-24 w-24 mx-auto items-center justify-center">
            <div className="absolute h-full w-full animate-ping rounded-full border-2 border-blue-400/30"></div>
            <div className="absolute h-full w-full animate-spin rounded-full border-4 border-white/10 border-t-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
            <Sparkles className="h-10 w-10 text-blue-400 animate-pulse" />
          </div>
          
          <div>
            <h2 className="text-2xl font-bold text-white mb-2 drop-shadow-md">Recap Studio AI</h2>
            <p className="text-blue-200/80 text-sm font-medium leading-relaxed bg-black/20 py-3 px-4 rounded-xl border border-white/5 inline-block">
              {ffmpegLoadingText}
            </p>
          </div>
          
          <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden shadow-inner border border-white/10">
            <div className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 w-full animate-pulse rounded-full relative">
              <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Use VITE_API_URL for separate frontend deployments (like Netlify), fallback to /api if unified
  const apiUrl = import.meta.env.PROD
    ? (import.meta.env.VITE_API_URL || '/api')
    : `http://${window.location.hostname}:5001/api`;

  const resetFlow = () => {
    setStep(1);
    setUtterances([]);
    setStep2Text('');
    setStep3Text('');
    setDownloadUrl('');
    setError('');
    setIsPlaying(false);
    setBackgroundTask({ status: 'idle', progress: 0, videoUrl: '', error: '' });
  };


  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await fetch(`${apiUrl}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential })
      });
      const data = await res.json();
      if (res.ok) {
        login(data.token);
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error('Login error', err);
    }
  };

  const handleAutoProcess = async () => {
    if (!file) { setError('Please select a video file first.'); return; }
    setLoading(true); setFfmpegProgress(0); setError('');

    try {
      setLoadingSteps(["[1/4] AI က ဗီဒီယိုကို လေ့လာနေပါသည်...", "အသံဖိုင်ကို သီးသန့် ခွဲထုတ်နေပါသည်..."]);
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile('input_video.mp4', await fetchFile(file));
      await ffmpeg.exec(['-i', 'input_video.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', 'extracted_audio.mp3']);
      const audioData = await ffmpeg.readFile('extracted_audio.mp3');
      const formData = new FormData();
      formData.append('audio', new File([new Blob([audioData.buffer], { type: 'audio/mp3' })], 'extracted_audio.mp3', { type: 'audio/mp3' }));

      const token = localStorage.getItem('token');

      const extractRes = await axios.post(`${apiUrl}/step1-extract`, formData, { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` } });
      const extractedUtterances = extractRes.data.utterances;

      setLoadingSteps(["[2/4] အင်္ဂလိပ်စာသားများကို မြန်မာလို အလိုအလျောက် ဘာသာပြန်နေပါသည်...", "စကားပြောသကဲ့သို့ သဘာဝကျအောင် ပြုပြင်နေပါသည်..."]);
      const translateRes = await axios.post(`${apiUrl}/step2-translate`, { utterances: extractedUtterances }, { headers: { Authorization: `Bearer ${token}` } });
      const translatedUtterances = translateRes.data.translatedUtterances;

      setLoadingSteps(["[3/4] AI က မြန်မာအသံထွက်များကို ဖန်တီးနေပါသည်...", "အသံအနှေးအမြန်များကို ကိုက်ညီအောင် ညှိနေပါသည်..."]);
      const ttsRes = await axios.post(`${apiUrl}/step3-tts`, { translatedUtterances, voice: selectedVoice }, { headers: { Authorization: `Bearer ${token}` } });
      const audioUrl = ttsRes.data.url;

      setLoadingSteps(["[4/4] ဗီဒီယိုနှင့် အသံဖိုင်ကို ပြင်ဆင်နေပါသည်...", "AI က သင့်ဖုန်းအတွင်း၌ ဗီဒီယိုနှင့် အသံကို ပေါင်းစပ်နေပါသည်... (Local Processing)"]);

      // Automatic Merge
      const fetchedAudioData = await fetchFile(audioUrl);
      await ffmpeg.writeFile('merge_input_audio.mp3', fetchedAudioData);

      const videoSegments = ttsRes.data.videoSegments;
      let needsStretching = false;
      if (videoSegments && videoSegments.length > 0) {
        needsStretching = videoSegments.some(seg => Math.abs(seg.videoSpeed - 1.0) > 0.001);
      }

      let filterScript = '';
      const ffmpegArgs = [
        '-i', 'input_video.mp4',
        '-i', 'merge_input_audio.mp3'
      ];

      if (needsStretching) {
        let concatInputs = '';
        let vIndex = 0;

        const fullSegments = [...videoSegments];
        let splitOutputs = '';
        for (let i = 0; i < fullSegments.length; i++) {
          splitOutputs += `[s${i}]`;
        }
        filterScript += `[0:v]split=${fullSegments.length}${splitOutputs};\n`;

        fullSegments.forEach((seg) => {
          if (seg.originalStart >= seg.originalEnd) return;
          filterScript += `[s${vIndex}]trim=${seg.originalStart}:${seg.originalEnd},setpts=${(1 / seg.videoSpeed).toFixed(4)}*(PTS-STARTPTS)[v${vIndex}];\n`;
          concatInputs += `[v${vIndex}]`;
          vIndex++;
        });

        filterScript += `${concatInputs}concat=n=${vIndex}:v=1:a=0[outv]\n`;

        await ffmpeg.writeFile('filter.txt', new TextEncoder().encode(filterScript));

        ffmpegArgs.push(
          '-filter_complex_script', 'filter.txt',
          '-map', '[outv]'
        );
      } else {
        ffmpegArgs.push('-map', '0:v');
      }

      ffmpegArgs.push('-map', '1:a');

      if (needsStretching) {
        ffmpegArgs.push(
          '-c:v', 'libx264',
          '-preset', 'ultrafast'
        );
      } else {
        ffmpegArgs.push('-c:v', 'copy');
      }

      ffmpegArgs.push(
        '-c:a', 'aac',
        '-shortest',
        'final_output.mp4'
      );

      const utterancesArray = ttsRes.data.updatedUtterances || ttsRes.data.utterances || [];
      const audioDurationMs = utterancesArray.length > 0 ? (utterancesArray[utterancesArray.length - 1].newEndMs || utterancesArray[utterancesArray.length - 1].end || 0) : 0;

      // Setup Preview States
      setUtterances(utterancesArray);
      setPreviewAudioUrl(audioUrl);
      setVideoSegments(ttsRes.data.videoSegments || []);
      setIsPreviewMode(true);
      setLoading(false); // Hide the blocking loading overlay immediately

      // Start rendering in the background (Non-blocking)
      (async () => {
        try {
          const progressHandler = ({ progress, time }) => {
            if (time !== undefined && audioDurationMs > 0) {
              const timeInMs = time / 1000;
              let calculatedProgress = (timeInMs / audioDurationMs) * 100;
              if (calculatedProgress > 99) calculatedProgress = 99;
              setFfmpegProgress(calculatedProgress);
            } else if (progress >= 0 && progress <= 1) {
              setFfmpegProgress(progress * 100);
            }
          };

          ffmpeg.on('progress', progressHandler);
          await ffmpeg.exec(ffmpegArgs);
          ffmpeg.off('progress', progressHandler);
          setFfmpegProgress(100);

          const finalData = await ffmpeg.readFile('final_output.mp4');
          const finalUrl = URL.createObjectURL(new Blob([finalData.buffer], { type: 'video/mp4' }));
          setFinalVideoUrl(finalUrl);
        } catch (bgErr) {
          console.error("Background render failed:", bgErr);
          setError("Failed to process final video: " + bgErr.message);
        }
      })();

    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Auto Process failed.');
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      resetFlow();
    }
  };

  const handleExtract = async () => {
    if (!file) {
      setError('Please select a video file first.');
      return;
    }
    setLoading(true);
    setFfmpegProgress(0);
    setError('');
    setLoadingSteps([
      "AI က ဗီဒီယိုကို လေ့လာနေပါသည်...",
      "Video ထဲမှ အသံဖိုင်ကို သင့်ဖုန်းထဲတွင် သီးသန့် ခွဲထုတ်နေပါသည်...",
      "အသံဖိုင်ကို AI ဆီသို့ ပို့ဆောင်နေပါသည်...",
      "စကားသံများကို နားထောင်ပြီး စာသားအဖြစ် ပြောင်းလဲနေပါသည်...",
      "ခဏစောင့်ပေးပါ၊ ပြီးတော့မည်..."
    ]);

    try {
      // 1. Local Audio Extraction using FFmpeg.wasm
      const ffmpeg = ffmpegRef.current;
      const fileData = await fetchFile(file);
      await ffmpeg.writeFile('input_video.mp4', fileData);

      // Extract audio as mp3
      await ffmpeg.exec(['-i', 'input_video.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', 'extracted_audio.mp3']);

      const audioData = await ffmpeg.readFile('extracted_audio.mp3');
      const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp3' });
      const audioFile = new File([audioBlob], 'extracted_audio.mp3', { type: 'audio/mp3' });

      // Clean up memory
      await ffmpeg.deleteFile('input_video.mp4');
      await ffmpeg.deleteFile('extracted_audio.mp3');

      // 2. Upload ONLY the audio file to the server
      const formData = new FormData();
      formData.append('audio', audioFile);

      const response = await axios.post(`${apiUrl}/step1-extract`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUtterances(response.data.utterances);
      setStep2Text(response.data.utterances.map(u => u.text).join('\n\n'));
      setVideoId(response.data.videoId);
      setStep(2);
      setLoadingSteps([]);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Extraction failed.');
      setLoadingSteps([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSRT = () => {
    if (!utterances || utterances.length === 0) return;

    let srtContent = '';

    // Helper to convert milliseconds to SRT time format: HH:MM:SS,mmm
    const formatTime = (ms) => {
      const date = new Date(ms);
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
      return `${hours}:${minutes}:${seconds},${milliseconds}`;
    };

    utterances.forEach((u, index) => {
      const startTime = u.newStartMs || u.start || 0;
      const endTime = u.newEndMs || u.end || 0;
      const text = u.translatedText || u.text || '';

      srtContent += `${index + 1}\n`;
      srtContent += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
      srtContent += `${text}\n\n`;
    });

    const blob = new Blob([srtContent], { type: 'text/srt;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RecapStudio_${Date.now()}.srt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadVideo = async () => {
    if (!file || !downloadUrl) return;

    setBackgroundTask({
      status: 'rendering',
      progress: 0,
      videoUrl: '',
      error: ''
    });

    try {
      const renderFfmpeg = renderFfmpegRef.current;
      if (!renderFfmpeg.loaded) {
        throw new Error("Render FFmpeg is not loaded yet.");
      }

      const audioDurationMs = utterances.length > 0 ? (utterances[utterances.length - 1].newEndMs || utterances[utterances.length - 1].end) : 0;

      const progressHandler = ({ progress, time }) => {
        if (time !== undefined && audioDurationMs > 0) {
          const timeInMs = time / 1000;
          let calculatedProgress = (timeInMs / audioDurationMs) * 100;
          if (calculatedProgress > 99) calculatedProgress = 99; // hold at 99% until finished
          setBackgroundTask(prev => ({ ...prev, progress: calculatedProgress }));
        } else if (progress >= 0 && progress <= 1) {
          setBackgroundTask(prev => ({ ...prev, progress: progress * 100 }));
        }
      };
      renderFfmpeg.on('progress', progressHandler);

      // Fetch the source video and TTS audio into virtual FS
      await renderFfmpeg.writeFile('input.mp4', await fetchFile(file));
      await renderFfmpeg.writeFile('tts.mp3', await fetchFile(downloadUrl));

      // 4. Build FFmpeg command based on whether stretching is actually needed
      let needsStretching = false;
      if (videoSegments && videoSegments.length > 0) {
        needsStretching = videoSegments.some(seg => Math.abs(seg.videoSpeed - 1.0) > 0.001);
      }

      let filterScript = '';
      const ffmpegArgs = [
        '-i', 'input.mp4',
        '-i', 'tts.mp3'
      ];

      if (needsStretching) {
        let concatInputs = '';
        let vIndex = 0;

        // Ensure the array covers the whole video duration
        const fullSegments = [...videoSegments];
        const finalEnd = fullSegments[fullSegments.length - 1].originalEnd;

        let splitOutputs = '';
        for (let i = 0; i < fullSegments.length; i++) {
          splitOutputs += `[s${i}]`;
        }
        filterScript += `[0:v]split=${fullSegments.length}${splitOutputs};\n`;

        fullSegments.forEach((seg) => {
          if (seg.originalStart >= seg.originalEnd) return;
          filterScript += `[s${vIndex}]trim=${seg.originalStart}:${seg.originalEnd},setpts=${(1 / seg.videoSpeed).toFixed(4)}*(PTS-STARTPTS)[v${vIndex}];\n`;
          concatInputs += `[v${vIndex}]`;
          vIndex++;
        });

        filterScript += `${concatInputs}concat=n=${vIndex}:v=1:a=0[outv]\n`;

        await renderFfmpeg.writeFile('filter.txt', new TextEncoder().encode(filterScript));

        ffmpegArgs.push(
          '-filter_complex_script', 'filter.txt',
          '-map', '[outv]'
        );
      } else {
        // No stretching needed, we can just copy the video stream!
        ffmpegArgs.push('-map', '0:v');
      }

      ffmpegArgs.push('-map', '1:a');

      if (needsStretching) {
        ffmpegArgs.push(
          '-c:v', 'libx264',
          '-preset', 'ultrafast'
        );
      } else {
        ffmpegArgs.push('-c:v', 'copy');
      }

      ffmpegArgs.push(
        '-c:a', 'aac',
        '-shortest',
        'output.mp4'
      );

      await renderFfmpeg.exec(ffmpegArgs);

      renderFfmpeg.off('progress', progressHandler);

      const data = await renderFfmpeg.readFile('output.mp4');
      const finalBlob = new Blob([data.buffer], { type: 'video/mp4' });
      const finalUrl = URL.createObjectURL(finalBlob);
      setBackgroundTask({
        status: 'done',
        progress: 100,
        videoUrl: finalUrl,
        error: ''
      });

    } catch (err) {
      console.error('Render error:', err);
      setBackgroundTask(prev => ({
        ...prev,
        status: 'error',
        error: err.message || 'Failed to render final video.'
      }));
    }
  };

  const handleTranslate = async () => {
    if (!geminiApiKey.trim()) {
      setError('OpenRouter API Key ထည့်သွင်းပေးပါခင်ဗျာ။');
      return;
    }

    // Save API key
    localStorage.setItem('geminiApiKey', geminiApiKey);

    setLoading(true);
    setError('');
    setLoadingSteps([
      "AI က English စာကြောင်းများကို ဖတ်နေပါသည်...",
      "ကျွန်တော်အဓိပ္ပါယ်များကို နားလည်အောင် ခွဲခြမ်းစိတ်ဖြာနေပါသည်...",
      "မြန်မာဘာသာသို့  အကောင်းဆုံး ပြန်ဆိုနေပါသည်..အစ်ကို.",
      "သဒ္ဒါမှန်ကန်အောင် စစ်ဆေးနေပါတယ်.. အစ်ကို...",
      "ခဏစောင့်ပေးပါ...အစ်ကို.."
    ]);

    try {
      const chunks = step2Text.split(/\n\n+/);
      const updatedUtterances = utterances.map((u, i) => ({
        ...u,
        text: chunks[i] !== undefined ? chunks[i].trim() : u.text
      }));
      setUtterances(updatedUtterances);

      const response = await axios.post(`${apiUrl}/step2-translate`, {
        utterances: updatedUtterances,
        apiKey: geminiApiKey
      });
      setUtterances(response.data.translatedUtterances);
      setStep3Text(response.data.translatedUtterances.map(u => u.translatedText).join('\n\n'));
      setStep(3);
      setLoadingSteps([]);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Translation failed.');
      setLoadingSteps([]);
    } finally {
      setLoading(false);
    }
  };

  const handleManualCopy = () => {
    const chunks = step2Text.split(/\n\n+/);
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
    const fallbackCopyTextToClipboard = (text) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;

      // Avoid scrolling to bottom
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
        console.error('Fallback: Oops, unable to copy', err);
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
        console.error('Async: Could not copy text: ', err);
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

      // If lengths mismatch, we just map what we can. The user can edit the final text in Step 3.
      if (parsed.translations.length !== utterances.length) {
        console.warn(`Translation length mismatch: Expected ${utterances.length}, got ${parsed.translations.length}. Proceeding anyway.`);
      }

      const updatedUtterances = utterances.map((u, i) => ({
        ...u,
        translatedText: parsed.translations[i] || u.text
      }));

      setUtterances(updatedUtterances);
      setStep3Text(updatedUtterances.map(u => u.translatedText).join('\n\n'));
      setStep(3);
    } catch (err) {
      setError('JSON ဖတ်၍မရပါ။ Gemini မှ ပြန်ပေးသော JSON Object ကို အတိအကျ Paste လုပ်ပေးပါ။ Error: ' + err.message);
    }
  };

  const handleTTS = async () => {
    setLoading(true);
    setError('');
    setLoadingSteps([
      "AI က မြန်မာအသံထွက်များကို ဖန်တီးနေပါသည်...",
      "လူပြောသကဲ့သို့ သဘာဝကျအောင် ပြုပြင်နေပါတယ်ဗျ ...",
      "အသံအတိုးအကျယ်များကို ညှိနေလို့ပါ ခနလေးနော် အစ်ကို ..",
      "Audio ကို သေချာစစ်ဆေးနေပါတယ်ဗျ..",
      "အစအဆုံးပြန်စစ်ကြည့်မယ်နော် အစ်ကို"
    ]);

    try {
      const chunks = step3Text.split(/\n\n+/);
      const updatedUtterances = utterances.map((u, i) => ({
        ...u,
        translatedText: chunks[i] !== undefined ? chunks[i].trim() : u.translatedText
      }));
      setUtterances(updatedUtterances);

      const response = await axios.post(`${apiUrl}/step3-tts`, {
        translatedUtterances: updatedUtterances,
        voice: selectedVoice
      });
      setDownloadUrl(response.data.url);
      if (response.data.videoSegments) setVideoSegments(response.data.videoSegments);
      if (response.data.updatedUtterances) setUtterances(response.data.updatedUtterances);

      setStep(4);
      setLoadingSteps([]);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'TTS mixing failed.');
      setLoadingSteps([]);
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    setLoading(true);
    setFfmpegProgress(0);
    setError('');
    setLoadingSteps([
      "ဗီဒီယိုနှင့် အသံဖိုင်ကို ပြင်ဆင်နေပါသည်...",
      "AI က သင့်ဖုန်းအတွင်း၌ ဗီဒီယိုနှင့် အသံကို ပေါင်းစပ်နေပါသည်... (Local Processing)",
      "အသံ အနှေးအမြန်နှင့် အချိန်ကိုက်ညီအောင် ညှိနေပါသည်...",
      "Video ဖိုင်အသစ် ဖန်တီးနေပါသည်...",
      "ခဏစောင့်ပေးပါ၊ ပြီးတော့မည်..."
    ]);

    try {
      const ffmpeg = ffmpegRef.current;

      // 1. Write Video to FFmpeg FS
      const videoData = await fetchFile(file);
      await ffmpeg.writeFile('merge_input_video.mp4', videoData);

      // 2. Fetch Audio from Backend and write to FFmpeg FS
      const audioData = await fetchFile(downloadUrl);
      await ffmpeg.writeFile('merge_input_audio.mp3', audioData);

      // 3. Prepare filter
      let filterComplex = '';
      if (offset >= 0) {
        const delayMs = Math.round(offset * 1000);
        filterComplex = `[1:a]adelay=${delayMs}|${delayMs},atempo=${audioSpeed}[aout]`;
      } else {
        const trimSec = Math.abs(offset);
        filterComplex = `[1:a]atrim=start=${trimSec},asetpts=PTS-STARTPTS,atempo=${audioSpeed}[aout]`;
      }

      // 4. Run FFmpeg command
      const ffmpegArgs = [
        '-i', 'merge_input_video.mp4',
        '-i', 'merge_input_audio.mp3',
        '-filter_complex', filterComplex,
        '-map', '0:v:0',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        'output_merged.mp4'
      ];

      await ffmpeg.exec(ffmpegArgs);

      // 5. Read output and download
      const outputData = await ffmpeg.readFile('output_merged.mp4');
      const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(outputBlob);

      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.download = `Recap_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Clean up
      await ffmpeg.deleteFile('merge_input_video.mp4');
      await ffmpeg.deleteFile('merge_input_audio.mp3');
      await ffmpeg.deleteFile('output_merged.mp4');

      setLoadingSteps([]);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Video merge failed.');
      setLoadingSteps([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTextEdit = (index, field, value) => {
    const newUtterances = [...utterances];
    newUtterances[index][field] = value;
    setUtterances(newUtterances);
  };

  // Sync Player Controls
  const togglePlay = () => {
    if (videoRef.current && audioRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        audioRef.current.pause();
      } else {
        videoRef.current.play();
        audioRef.current.currentTime = Math.max(0, videoRef.current.currentTime + offset);
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleVideoSeek = () => {
    if (videoRef.current && audioRef.current && isPlaying) {
      audioRef.current.currentTime = Math.max(0, videoRef.current.currentTime + offset);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-10 rounded-3xl text-center shadow-2xl max-w-md w-full">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome to Recap Studio
          </h1>
          <p className="text-gray-400 mb-10">Please sign in to access your dashboard.</p>
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => console.log('Login Failed')}
              theme="filled_blue"
              size="large"
              shape="pill"
              text="continue_with"
            />
          </div>
        </div>
      </div>
    );
  }

  if (location.pathname === '/admin') {
    if (!user || user.role !== 'admin') {
      return (
        <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center text-white p-4">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-gray-400 mb-6">You need Administrator privileges to view this page.</p>
          <button onClick={() => navigate('/')} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl font-medium transition-colors">
            Return Home
          </button>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4">
        <AdminDashboard onBack={() => navigate('/')} />
      </div>
    );
  }

  if (appMode === 'auto' && isPremium) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col font-sans relative overflow-hidden text-white">
        {/* Navbar */}
        <div className="relative z-10 w-full px-6 py-4 flex justify-between items-center border-b border-white/10 bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">Recap Studio</h1>
          </div>
          {/* Mode Switcher */}
          <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 bg-white/5 p-1 rounded-full items-center shadow-inner border border-white/10">
            <button onClick={() => setAppMode('manual')} className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${appMode === 'manual' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>Manual Editor</button>
            <button onClick={() => { if (!isPremium) setShowPremiumModal(true); else setAppMode('auto'); }} className={`px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${appMode === 'auto' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><Sparkles className="w-4 h-4" /> Auto Mode</button>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 bg-white/5 border border-white/10 rounded-full pl-1 sm:pl-2 pr-3 sm:pr-4 py-1 sm:py-1.5">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-purple-500/50" />
              ) : (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-xs sm:text-sm">{user.name.charAt(0)}</div>
              )}
              <div className="flex flex-col max-w-[80px] sm:max-w-none overflow-hidden">
                <span className="text-xs sm:text-sm font-medium text-white leading-none truncate">{user.name}</span>
                <span className="text-[8px] sm:text-[10px] text-purple-400 uppercase tracking-wider font-bold mt-1">{user.role}</span>
              </div>
              <button onClick={logout} className="ml-1 p-1 sm:p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-colors shrink-0"><LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
            </div>
            {user?.role === 'admin' && (
              <button onClick={() => navigate('/admin')} className="p-1.5 sm:p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-sm border border-white/20 group">
                <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-gray-300 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile Mode Switcher (Below Header) */}
        <div className="md:hidden w-full bg-white/5 border-b border-white/10 p-2 flex justify-center shadow-inner">
          <div className="flex bg-black/20 p-1 rounded-full items-center">
            <button onClick={() => setAppMode('manual')} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${appMode === 'manual' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>Manual</button>
            <button onClick={() => { if (!isPremium) setShowPremiumModal(true); else setAppMode('auto'); }} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${appMode === 'auto' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><Sparkles className="w-3 h-3" /> Auto</button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
          <div className="max-w-xl w-full bg-white/5 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl shadow-2xl text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-green-500/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Premium Auto Mode</h2>
            <p className="text-gray-400 mb-8">One-click video translation. We will extract, translate, synthesize, and merge automatically using Admin API Keys.</p>

            <input
              type="file"
              accept="video/*"
              id="auto-file-upload"
              className="hidden"
              onChange={handleFileChange}
            />

            {!file ? (
              <label htmlFor="auto-file-upload" className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-500 cursor-pointer">
                <UploadCloud className="w-6 h-6" /> Select Video
              </label>
            ) : finalVideoUrl ? (
              <div className="space-y-4">
                <div className="w-full bg-black/50 rounded-xl overflow-hidden shadow-inner border border-white/10 mt-4">
                  <video src={finalVideoUrl} controls className="w-full max-h-64 object-contain" />
                </div>
                <a
                  href={finalVideoUrl}
                  download="auto_translated_video.mp4"
                  className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 hover:scale-[1.02]"
                >
                  <Download className="w-6 h-6" />
                  Download Final Video
                </a>
                <button
                  onClick={() => { setFile(null); setFinalVideoUrl(''); setIsPreviewMode(false); }}
                  className="w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20"
                >
                  <RefreshCw className="w-5 h-5" />
                  Translate Another Video
                </button>
              </div>
            ) : isPreviewMode ? (
              <div className="space-y-4">
                <div className="p-6 bg-white/5 rounded-xl border border-white/10 mt-4">
                  <div className="flex items-center gap-2 mb-4 text-purple-300">
                    <Headphones className="w-5 h-5" />
                    <h3 className="font-bold text-sm text-left">Generated Audio (MP3) Preview</h3>
                  </div>
                  <audio src={previewAudioUrl} controls className="w-full mb-4" />

                  <button
                    onClick={handleDownloadSRT}
                    className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition shadow-sm flex items-center justify-center gap-2 border border-white/20"
                  >
                    <Download className="w-4 h-4" /> Download Subtitles (.srt)
                  </button>
                </div>

                {/* Render Progress Bar */}
                <div className="w-full bg-black/30 rounded-full h-5 overflow-hidden border border-white/10 relative mt-2">
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-300" style={{ width: `${ffmpegProgress}%` }}></div>
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white drop-shadow-md">{Math.round(ffmpegProgress)}% Rendering Final Video...</span>
                </div>

                <button
                  disabled
                  className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white opacity-50 cursor-not-allowed mt-2"
                >
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Please Wait...
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center gap-3 text-left">
                  <Video className="w-6 h-6 text-purple-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button onClick={() => setFile(null)} className="p-2 text-gray-400 hover:text-red-400 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* Voice Selection for Auto Mode */}
                <div className="bg-white/5 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-sm flex flex-col gap-3">
                  <p className="font-bold text-white drop-shadow-md text-sm text-left">အသံရွေးချယ်ရန် (Voice Selection):</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="auto-voice"
                        value="my-MM-NilarNeural"
                        checked={selectedVoice === 'my-MM-NilarNeural'}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="w-4 h-4 text-emerald-400 focus:ring-emerald-500 bg-black/20 border-white/20"
                      />
                      <span className="text-sm font-medium text-gray-200">နီလာ (Nilar - Female)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="auto-voice"
                        value="my-MM-ThihaNeural"
                        checked={selectedVoice === 'my-MM-ThihaNeural'}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="w-4 h-4 text-emerald-400 focus:ring-emerald-500 bg-black/20 border-white/20"
                      />
                      <span className="text-sm font-medium text-gray-200">သီဟ (Thiha - Male)</span>
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleAutoProcess}
                  disabled={loading}
                  className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6" />}
                  {loading ? 'Processing...' : 'Start Auto Translate'}
                </button>
              </div>
            )}

            {error && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-3 text-left">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}
          </div>
        </div>
        <AILoadingOverlay isLoading={loading} steps={loadingSteps} progress={ffmpegProgress} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4 font-sans text-white relative pt-20 sm:pt-4">
      {/* Global Top-Right User Menu */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full pl-1 sm:pl-2 pr-3 sm:pr-4 py-1 sm:py-1.5 shadow-lg">
          {user.picture ? (
            <img src={user.picture} alt={user.name} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-purple-500/50 shrink-0" />
          ) : (
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-xs sm:text-sm shrink-0">
              {user.name.charAt(0)}
            </div>
          )}
          <div className="flex flex-col overflow-hidden max-w-[80px] sm:max-w-[150px]">
            <span className="text-xs sm:text-sm font-medium text-white leading-none truncate">{user.name}</span>
            <span className="text-[8px] sm:text-[10px] text-purple-400 uppercase tracking-wider font-bold mt-0.5">{user.role}</span>
          </div>
          <button onClick={logout} className="ml-1 p-1 sm:p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-colors shrink-0" title="Logout">
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
        {user?.role === 'admin' && (
          <button onClick={() => navigate('/admin')} className="p-1.5 sm:p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-sm border border-white/20 group backdrop-blur-xl">
            <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-gray-300 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
          </button>
        )}
      </div>
      {/* Background Task Floating Indicator */}
      {backgroundTask.status !== 'idle' && (
        <div className="fixed top-6 left-6 z-50 flex items-center bg-white/10 backdrop-blur-md/95 backdrop-blur-md shadow-2xl border border-white/20/50 rounded-full pl-2 pr-5 py-2.5 gap-4 transition-all duration-500 hover:scale-105">
          {backgroundTask.status === 'rendering' && (
            <>
              <div className="relative w-10 h-10 flex items-center justify-center">
                <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-white/90"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-blue-300 transition-all duration-[2000ms] ease-out"
                    strokeDasharray={`${backgroundTask.progress}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute text-[11px] font-extrabold text-blue-200 font-mono tracking-tighter">{Math.round(backgroundTask.progress)}%</span>
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-sm font-bold text-white leading-tight">Rendering...</span>
                <span className="text-[11px] text-blue-300 font-medium">Creating video in background</span>
              </div>
            </>
          )}

          {backgroundTask.status === 'done' && (
            <>
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-sm font-bold text-green-300 leading-tight">Finished!</span>
                <a href={backgroundTask.videoUrl} download={`RecapStudio_${Date.now()}.mp4`} className="text-[11px] text-blue-300 font-bold hover:underline">
                  Click to Download
                </a>
              </div>
              <button onClick={() => setBackgroundTask({ status: 'idle', progress: 0, videoUrl: '', error: '' })} className="ml-3 p-1 text-white/50 hover:text-white transition-colors bg-white/10/20 rounded-full">
                &times;
              </button>
            </>
          )}

          {backgroundTask.status === 'error' && (
            <>
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shadow-inner">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-sm font-bold text-red-700 leading-tight">Failed</span>
                <span className="text-[11px] text-white/70 truncate max-w-[150px]">{backgroundTask.error}</span>
              </div>
              <button onClick={() => setBackgroundTask({ status: 'idle', progress: 0, videoUrl: '', error: '' })} className="ml-3 p-1 text-white/50 hover:text-white transition-colors bg-white/10/20 rounded-full">
                &times;
              </button>
            </>
          )}
        </div>
      )}

      <div className="bg-white/10 backdrop-blur-md/10 backdrop-blur-2xl rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md/10 p-4 border-b border-white/20 flex flex-wrap items-center justify-between gap-y-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/10 backdrop-blur-md/100 rounded-lg rotate-45 flex items-center justify-center shrink-0">
              <div className="w-3 h-3 bg-white/10 backdrop-blur-md -rotate-45 rounded-sm"></div>
            </div>
            <div>
              <h1 className="font-bold text-white text-lg leading-tight">Recap Studio</h1>
              <p className="text-xs text-white/70 hidden sm:block">Manual Editor Workflow</p>
            </div>
          </div>
          {/* Mode Switcher */}
          <div className="flex bg-white/5 p-1 rounded-full items-center shadow-inner border border-white/10 ml-auto shrink-0">
            <button onClick={() => setAppMode('manual')} className={`px-3 sm:px-6 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all ${appMode === 'manual' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>Manual</button>
            <button onClick={() => { if (!isPremium) setShowPremiumModal(true); else setAppMode('auto'); }} className={`px-3 sm:px-6 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${appMode === 'auto' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><Sparkles className="w-3 h-3 sm:w-4 sm:h-4" /> Auto</button>
          </div>
          <div className="flex gap-2 text-xs font-bold text-blue-400 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 hide-scrollbar">
            <span className={`whitespace-nowrap ${step >= 1 ? 'text-blue-300' : 'text-gray-500'}`}>1. Upload</span>
            <span className="text-gray-600">›</span>
            <span className={`whitespace-nowrap ${step >= 2 ? 'text-blue-300' : 'text-gray-500'}`}>2. English</span>
            <span className="text-gray-600">›</span>
            <span className={`whitespace-nowrap ${step >= 3 ? 'text-blue-300' : 'text-gray-500'}`}>3. Myanmar</span>
            <span className="text-gray-600">›</span>
            <span className={`whitespace-nowrap ${step >= 4 ? 'text-blue-300' : 'text-gray-500'}`}>4. Result</span>
          </div>
        </div>

        {/* Main Content (Scrollable) */}
        <div className="p-6 space-y-6 overflow-y-auto grow">

          {/* Step 1: Upload Section */}
          {step === 1 && (
            <div className="bg-black/20 backdrop-blur-md rounded-2xl p-5 border border-white/20">
              <h2 className="font-bold text-white mb-1">Step 1: Video တင်ပါ</h2>
              <p className="text-xs text-white/70 mb-4">Recap လုပ်မည့် video ကို ရွေးချယ်ပါ။ (အသံကို အရင်ဆွဲထုတ်ပါမည်)</p>

              <div className="border-2 border-dashed border-white/20 bg-black/20 rounded-xl p-6 text-center cursor-pointer relative overflow-hidden transition hover:bg-white/20">
                <input
                  type="file"
                  accept="video/*,audio/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={loading}
                />
                {file ? (
                  <div className="flex flex-col items-center justify-center gap-2 text-green-300 font-medium z-10 relative pointer-events-none">
                    <CheckCircle2 className="w-8 h-8 text-green-400 mb-1" />
                    <span className="truncate max-w-xs text-sm">{file.name}</span>
                  </div>
                ) : (
                  <span className="text-white/70 font-medium text-sm z-10 relative pointer-events-none">နှိပ်၍ File ရွေးချယ်ပါ</span>
                )}
              </div>

              {/* Video Preview right after selection to test browser compatibility */}
              {videoUrl && (
                <div className="mt-4 rounded-xl overflow-hidden border border-white/30 bg-black">
                  <p className="bg-white/10/20 text-xs text-center p-1 text-white/70">Local Cache (Blob URL) Preview</p>
                  <video src={videoUrl} controls className="w-full h-48 object-contain" playsInline />
                </div>
              )}
            </div>
          )}

          {/* Step 2: English Transcript Review */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-bold text-white">Step 2: English Text ကို စစ်ဆေးပါ</h2>
              <p className="text-xs text-white/70">အောက်ပါ အင်္ဂလိပ်စာကြောင်းများကို လိုအပ်ပါက ပြင်ဆင်နိုင်ပါသည်။</p>

              <div className="relative">
                <div className="absolute top-2 right-2 z-10">
                  <button
                    onClick={handleManualCopy}
                    className="p-2 bg-white/10 backdrop-blur-md hover:bg-white/10/20 text-white drop-shadow-md rounded-md border border-white/30 transition-colors shadow-sm flex items-center gap-1 text-xs font-medium"
                  >
                    <Copy className="w-3 h-3" /> Copy Full Prompt
                  </button>
                </div>
                <textarea
                  value={step2Text}
                  onChange={(e) => setStep2Text(e.target.value)}
                  className="w-full text-sm p-4 pt-12 rounded-xl border border-white/20 focus:outline-none focus:border-white/20 focus:ring-2 focus:ring-blue-100 bg-black/20 min-h-[400px] font-mono leading-relaxed"
                  placeholder="Text here..."
                />
              </div>
            </div>
          )}

          {/* Step 3: Burmese Transcript Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-bold text-white">Step 3: မြန်မာဘာသာပြန်ကို စစ်ဆေးပါ</h2>
              <p className="text-xs text-white/70">အောက်ပါ မြန်မာစာကြောင်းများကို လိုအပ်ပါက ပြင်ဆင်နိုင်ပါသည်။</p>

              <div className="relative">
                <div className="absolute top-2 right-2 z-10">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(step3Text);
                      alert('Copied to clipboard!');
                    }}
                    className="p-2 bg-white/10 backdrop-blur-md hover:bg-white/10 backdrop-blur-md/10 text-blue-200 rounded-md border border-white/20 transition-colors shadow-sm flex items-center gap-1 text-xs font-medium"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
                <textarea
                  value={step3Text}
                  onChange={(e) => setStep3Text(e.target.value)}
                  className="w-full text-sm p-4 pt-12 rounded-xl border border-white/20 focus:outline-none focus:border-white/20 focus:ring-2 focus:ring-blue-100 bg-white/10 backdrop-blur-md/10 min-h-[400px] font-mono leading-relaxed"
                  placeholder="Translated text here..."
                />
              </div>
            </div>
          )}

          {/* Step 4: Result (Audio, Subtitles, Final Video) */}
          {step === 4 && downloadUrl && (
            <div className="space-y-4">
              <h2 className="font-bold text-white">Step 4: ရလဒ်များ (Results)</h2>
              <p className="text-sm text-white/80">အောက်ပါဖိုင်များကို Download ရယူနိုင်ပါသည်။</p>

              <div className="bg-white/10/20 p-4 rounded-xl border border-white/30 flex flex-col items-center gap-4">
                <audio controls src={downloadUrl} className="w-full" />

                <div className="flex flex-col w-full gap-3 mt-2">
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 bg-blue-600 text-white text-center rounded-xl font-bold text-sm hover:bg-blue-700 transition shadow-md flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download Audio (အသံဖိုင်)
                  </a>

                  <button
                    onClick={handleDownloadSRT}
                    className="w-full py-3 bg-purple-600 text-white text-center rounded-xl font-bold text-sm hover:bg-purple-700 transition shadow-md flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download Subtitles (.srt)
                  </button>

                  <button
                    onClick={() => handleDownloadVideo()}
                    disabled={backgroundTask.status === 'rendering' || loading}
                    className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-2xl shadow-lg hover:shadow-green-500/30 transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-lg mt-2"
                  >
                    {backgroundTask.status === 'rendering' ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" /> Rendering Video...
                      </>
                    ) : (
                      <>
                        <Download className="w-6 h-6" /> Download Final Video
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-col pt-4 gap-3">
                <p className="text-center text-white/50 text-xs leading-relaxed px-2">
                  <span className="text-white/70 font-semibold">မှတ်ချက်:</span> Video ထုတ်ယူသည့်အချိန်သည် မူရင်း Video အရွယ်အစား / သင့်ဖုန်းရဲ့ Performance အပေါ်မူတည်ပါသည်။ / internet လုံးဝမလိုပါ ❌ ။
                </p>
                <button
                  onClick={resetFlow}
                  disabled={loading}
                  className="w-full py-3 bg-white/10/20 text-white drop-shadow-md rounded-xl font-bold text-sm hover:bg-white/10/30 text-white/50 transition flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> အသစ်ပြန်လုပ်မည် (Start New Project)
                </button>
              </div>
            </div>
          )}

          {/* Status / Error */}
          {error && (
            <div className="p-3 bg-red-900/40 text-white text-red-600 text-sm rounded-lg border border-red-200">
              {error}
            </div>
          )}
          {/* Removed full-screen loading for background rendering */}
          {loading && loadingSteps.length > 0 && (
            <div className="mt-8">
              <AILoadingState steps={loadingSteps} progress={ffmpegProgress} />
            </div>
          )}
        </div>

        <div className="p-4 bg-black/20 border-t border-white/20 shrink-0">
          {step === 1 && (
            <button
              onClick={handleExtract}
              disabled={loading || !file}
              className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${loading || !file ? 'bg-white/10/30 text-white/50 text-white/70 cursor-not-allowed' : 'bg-white/10 backdrop-blur-md/100 text-white shadow-lg shadow-blue-200 hover:bg-blue-600'
                }`}
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
              ) : (
                <>Step 1: အသံထုတ်မည် <Play className="w-5 h-5 fill-current" /></>
              )}
            </button>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              {!translationMode ? (
                <>
                  <button
                    onClick={() => {
                      setTranslationMode('manual');
                      handleManualCopy();
                    }}
                    disabled={loading}
                    className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-purple-500 text-white shadow-lg shadow-purple-200 hover:bg-purple-600"
                  >
                    Gemini App မှ တစ်ဆင့် ဘာသာပြန်မည်
                  </button>
                  <button
                    onClick={() => setTranslationMode('api')}
                    disabled={loading}
                    className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-white/10 backdrop-blur-md/100 text-white shadow-lg shadow-blue-200 hover:bg-blue-600"
                  >
                    OpenRouter API Key ဖြင့် ဆက်သွားမည်
                  </button>
                </>
              ) : translationMode === 'manual' ? (
                <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/30 shadow-sm flex flex-col gap-3 text-left">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white drop-shadow-md">Manual Translation Mode</span>
                    <button onClick={() => setTranslationMode(null)} className="text-xs text-blue-300 hover:underline">Change Mode</button>
                  </div>
                  {copySuccess && <p className="text-xs text-green-400 font-semibold bg-black/20 p-2 rounded border border-white/20">Copied to clipboard! Please paste into Gemini and copy the JSON result.</p>}
                  <textarea
                    value={manualTranslationInput}
                    onChange={(e) => setManualTranslationInput(e.target.value)}
                    placeholder="Paste the JSON response from Gemini here..."
                    className="w-full p-3 border border-white/20 rounded-lg text-sm font-mono h-32 min-h-[8rem] resize-y focus:ring-2 focus:ring-purple-200 outline-none"
                  />
                  {error && error.includes('JSON') && (
                    <div className="p-2 bg-red-900/40 text-white text-red-600 text-xs rounded border border-red-200 break-words">
                      {error}
                    </div>
                  )}
                  <button
                    onClick={handleManualSubmit}
                    disabled={!manualTranslationInput}
                    className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 relative z-10 ${!manualTranslationInput ? 'bg-white/10/30 text-white/50 text-white/70 cursor-not-allowed' : 'bg-black/200 text-white shadow-lg shadow-green-200 hover:bg-green-600'}`}
                  >
                    Submit Translation <Play className="w-4 h-4 inline" />
                  </button>
                </div>
              ) : (
                <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/30 shadow-sm flex flex-col gap-3 text-left">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white drop-shadow-md">API Key Translation Mode</span>
                    <button onClick={() => setTranslationMode(null)} className="text-xs text-blue-300 hover:underline">Change Mode</button>
                  </div>
                  <input
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="Enter your OpenRouter API Key"
                    className="w-full p-3 border border-white/20 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                  <button
                    onClick={handleTranslate}
                    disabled={loading || !geminiApiKey.trim()}
                    className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${loading || !geminiApiKey.trim() ? 'bg-white/10/30 text-white/50 text-white/70 cursor-not-allowed' : 'bg-white/10 backdrop-blur-md/100 text-white shadow-lg shadow-blue-200 hover:bg-blue-600'}`}
                  >
                    {loading ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Translating...</>
                    ) : (
                      <>Translate <Play className="w-5 h-5 fill-current" /></>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {/* Voice Selection */}
              <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 shadow-sm flex flex-col gap-3">
                <p className="font-bold text-white drop-shadow-md text-sm">အသံရွေးချယ်ရန် (Voice Selection):</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="voice"
                      value="my-MM-NilarNeural"
                      checked={selectedVoice === 'my-MM-NilarNeural'}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-4 h-4 text-blue-300 focus:ring-blue-400"
                    />
                    <span className="text-sm font-medium text-white">နီလာ (Nilar - Female)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="voice"
                      value="my-MM-ThihaNeural"
                      checked={selectedVoice === 'my-MM-ThihaNeural'}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-4 h-4 text-blue-300 focus:ring-blue-400"
                    />
                    <span className="text-sm font-medium text-white">သီဟ (Thiha - Male)</span>
                  </label>
                </div>
              </div>

              <button
                onClick={handleTTS}
                disabled={loading}
                className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${loading ? 'bg-white/10/30 text-white/50 text-white/70 cursor-not-allowed' : 'bg-black/200 text-white shadow-lg shadow-green-200 hover:bg-green-600'
                  }`}
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                ) : (
                  <>Step 3: အသံဖန်တီးမည် <Play className="w-5 h-5 fill-current" /></>
                )}
              </button>
            </div>
          )}
        </div>


        {/* Premium Modal */}
        {showPremiumModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[#0F172A] border border-white/20 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500"></div>

              <button onClick={() => setShowPremiumModal(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors">
                ✕
              </button>

              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mb-6 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Sparkles className="w-8 h-8 text-white" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">Upgrade to Premium</h2>
              <p className="text-gray-400 mb-6">Auto Mode is a premium feature. Upgrade to automatically extract, translate, and synthesize your videos with one click!</p>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <span>Blazing fast AI translation</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <span>Zero manual editing required</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <span>Priority processing queue</span>
                </div>
              </div>

              <button onClick={() => { alert('Premium purchasing coming soon!'); setShowPremiumModal(false); }} className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-[1.02]">
                Upgrade Now - $9.99/mo
              </button>
            </div>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

export default App;
