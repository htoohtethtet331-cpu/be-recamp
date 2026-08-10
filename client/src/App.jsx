import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Check, CheckCircle2, Download, RefreshCw, Play, Loader2, AlertTriangle, SlidersHorizontal, ArrowRight, Video, Sparkles, Copy, Settings, LogOut, UploadCloud, Headphones, Zap, X, CreditCard, HelpCircle, KeyRound, ChevronDown } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from './context/AuthContext';
import AdminDashboard from './components/AdminDashboard';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import coreURL from './assets/ffmpeg/ffmpeg-core.js?url';
import wasmURL from './assets/ffmpeg/ffmpeg-core.wasm?url';

export const getFreeLimitRemaining = (user) => {
  const today = new Date().toISOString().split('T')[0];
  if (user?.lastFreeVideoDate && new Date(user.lastFreeVideoDate).toISOString().split('T')[0] === today) {
    return Math.max(0, 3 - (user.freeVideosUsed || 0));
  }
  return 3;
};

export const getLimitDisplay = (user) => {
  if (user?.role === 'admin') return '';
  if (user?.role === 'free') {
    return `| Limit: ${getFreeLimitRemaining(user)}/3`;
  }
  return `| Limit: ${user?.videoLimit || 0}`;
};

const AutoLoadingOverlay = ({ step, progress, onCancel, isServerRender }) => {
  const steps = [
    'Fetching',
    'Transcribing',
    'Translating',
    'Synthesizing',
    isServerRender ? '🚀 Server Rendering' : 'Rendering'
  ];

  // Calculate stroke dashoffset for circular progress
  const radius = 65;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  if (step === 0 || step === 6) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/95 backdrop-blur-md">
      <div className="flex flex-col items-center w-full max-w-sm px-6">

        {/* Circular Progress */}
        <div className="relative w-48 h-48 flex items-center justify-center mb-10">
          <svg className="w-full h-full transform -rotate-90 absolute">
            <circle cx="96" cy="96" r="65" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
            <circle
              cx="96"
              cy="96"
              r="65"
              fill="transparent"
              stroke="url(#gradient)"
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500 ease-in-out"
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
          <div className="text-center flex flex-col items-center justify-center absolute z-10">
            <span className="text-4xl font-extrabold text-white tracking-tighter">{Math.round(progress)}%</span>
            <span className="text-[11px] font-medium text-gray-400 mt-1 uppercase tracking-wider">Please wait</span>
          </div>
        </div>

        {/* Vertical Steps */}
        <div className="w-full space-y-4 mb-12 relative px-4">
          {/* Vertical connecting line */}
          <div className="absolute left-[31px] top-4 bottom-4 w-0.5 bg-white/5 -z-10"></div>

          {steps.map((stepName, index) => {
            const stepNumber = index + 1;
            const isCompleted = step > stepNumber;
            const isActive = step === stepNumber;

            return (
              <div key={stepName} className="flex items-center gap-5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all z-10 ${isCompleted ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] border border-emerald-300/30' :
                    isActive ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] border border-blue-400/50 animate-pulse' :
                      'bg-[#1e293b] text-gray-500 border border-white/10'
                  }`}>
                  {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : stepNumber}
                </div>
                <span className={`font-bold text-base transition-all ${isCompleted ? 'text-emerald-400/90' :
                    isActive ? 'text-white tracking-wide' :
                      'text-gray-500'
                  }`}>
                  {stepName}
                </span>
              </div>
            );
          })}
        </div>

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          className="w-full max-w-[200px] py-3.5 rounded-2xl font-bold text-sm text-gray-400 bg-white/5 hover:bg-white/10 hover:text-white border border-white/10 transition-all active:scale-95"
        >
          Cancel Job
        </button>

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
    <div className={`flex flex-col items-center justify-center ${compact ? 'space-y-2 py-3' : 'space-y-4 py-6'} bg-white/10 backdrop-blur-md/50 rounded-2xl border border-white/20 backdrop-blur-xl ${compact ? '' : 'mt-6'} shadow-sm`}>
      <div className={`flex flex-col items-center ${compact ? 'gap-1' : 'gap-3'} w-full px-4`}>
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
const VOICE_PRESETS = [
  { id: 'BB', icon: 'BB', name: 'ဘိုဘို', desc: 'Male', voice: 'my-MM-ThihaNeural', pitch: '+0Hz', rate: '+0%' },
  { id: 'NL', icon: 'NL', name: 'ဉာဏ်လင်း', desc: 'Male', voice: 'my-MM-ThihaNeural', pitch: '-12Hz', rate: '+0%' },
  { id: 'PW', icon: 'PW', name: 'ဖြိုးဝေ', desc: 'Male', voice: 'my-MM-ThihaNeural', pitch: '+12Hz', rate: '+3%' },
  { id: 'KM', icon: 'KM', name: 'ကောင်းမြတ်', desc: 'Male', voice: 'my-MM-ThihaNeural', pitch: '-22Hz', rate: '-5%' },
  { id: 'ZK', icon: 'ZK', name: 'ဇော်ကို', desc: 'Male', voice: 'my-MM-ThihaNeural', pitch: '+20Hz', rate: '+6%' },
  { id: 'HS', icon: 'HS', name: 'နှင်းဆီ', desc: 'Female', voice: 'my-MM-NilarNeural', pitch: '+0Hz', rate: '+0%' },
  { id: 'SL', icon: 'SL', name: 'စုလွင်', desc: 'Female', voice: 'my-MM-NilarNeural', pitch: '-10Hz', rate: '+0%' },
  { id: 'YS', icon: 'YS', name: 'ယွန်းရွှေ', desc: 'Female', voice: 'my-MM-NilarNeural', pitch: '+12Hz', rate: '+3%' },
  { id: 'EC', icon: 'EC', name: 'အိမ့်ချစ်', desc: 'Female', voice: 'my-MM-NilarNeural', pitch: '-18Hz', rate: '-5%' },
  { id: 'TS', icon: 'TS', name: 'သက်စု', desc: 'Female', voice: 'my-MM-NilarNeural', pitch: '+20Hz', rate: '+6%' },
];

const VoiceSelector = ({ selectedVoice, setSelectedVoice, pitchOffset, setPitchOffset }) => {
  const [isPreviewing, setIsPreviewing] = useState(false);

  const handlePreview = async () => {
    if (isPreviewing) return;
    setIsPreviewing(true);
    try {
      const finalPitch = Number(selectedVoice.pitch.replace('Hz', '')) + pitchOffset;
      const voicePayload = {
        voice: selectedVoice.voice,
        rate: selectedVoice.rate,
        pitch: `${finalPitch > 0 ? '+' : ''}${finalPitch}Hz`
      };

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const token = localStorage.getItem('token');
      const res = await axios.post(`${apiUrl}/tts-preview`, {
        voice: voicePayload,
        text: 'မင်္ဂလာပါ။ ဒါကတော့ အသံအစမ်း နားထောင်ကြည့်တာပါ။'
      }, {
        responseType: 'blob',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const audioUrl = URL.createObjectURL(res.data);
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPreviewing(false);
      audio.play();
    } catch (e) {
      console.error('Preview error:', e);
      setIsPreviewing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {VOICE_PRESETS.map((preset) => (
          <div
            key={preset.id}
            onClick={() => setSelectedVoice(preset)}
            className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${selectedVoice.id === preset.id
                ? 'border-purple-400 bg-purple-900/30 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                : 'border-white/10 bg-[#0f172a] hover:bg-white/5 hover:border-white/20'
              }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg ${preset.voice.includes('Nilar') ? 'bg-gradient-to-br from-[#c6449e] to-[#9b49b4]' : 'bg-gradient-to-br from-[#2a7bfa] to-[#1e5cdc]'}`}>
              {preset.icon}
            </div>
            <div className="text-[11px] font-bold text-white mt-1">{preset.name}</div>
            <div className="text-[10px] text-gray-400">{preset.desc}</div>
          </div>
        ))}
      </div>

      <div className="bg-[#0f172a] border border-white/10 p-4 rounded-2xl flex flex-col gap-4">
        <div>
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-semibold text-white flex items-center gap-2">
              <span>ဝါး/ကြည် (Pitch Offset)</span>
            </label>
            <span className="text-sm font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
              {pitchOffset > 0 ? '+' : ''}{pitchOffset}Hz
            </span>
          </div>
          <input
            type="range"
            min="-30"
            max="30"
            step="1"
            value={pitchOffset}
            onChange={(e) => setPitchOffset(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <div className="flex justify-between text-[10px] text-gray-500 mt-2 font-mono">
            <span>-30Hz (ဝါး)</span>
            <span>0Hz</span>
            <span>+30Hz (ကြည်)</span>
          </div>
        </div>

        <button
          onClick={handlePreview}
          disabled={isPreviewing}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${isPreviewing
              ? 'bg-purple-900/50 text-purple-300 cursor-not-allowed border border-purple-500/30'
              : 'bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white border border-purple-500/50'
            }`}
        >
          {isPreviewing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> ဖွင့်နေပါသည်...</>
          ) : (
            <><Play className="w-4 h-4 fill-current" /> အသံစမ်းနားထောင်မည်</>
          )}
        </button>
      </div>
    </div>
  );
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login, logout, setUser } = useAuth();
  const isPremium = user?.role === 'admin' || user?.role === 'premium';
  const [appMode, setAppMode] = useState('manual');
  const [autoStep, setAutoStep] = useState(0);
  const [autoProgress, setAutoProgress] = useState(0);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  // Use VITE_API_URL for separate frontend deployments (like Netlify), fallback to production domain
  const rawApiUrl = import.meta.env.PROD
    ? (import.meta.env.VITE_API_URL || 'https://deeplearnaixrecapstudio.app/api')
    : `http://${window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname}:5001/api`;
  // Strip trailing slash to prevent double-slash in URLs
  const apiUrl = rawApiUrl.replace(/\/+$/, '');

  const [pricingPackages, setPricingPackages] = useState([]);

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const res = await fetch(`${apiUrl}/settings/public`);
        const data = await res.json();
        if (data.packages) {
          setPricingPackages(data.packages);
        }
      } catch (err) {
        console.error("Failed to fetch packages", err);
      }
    };
    fetchPackages();
  }, [apiUrl]);

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
  const [videoDuration, setVideoDuration] = useState(0);
  const [utterances, setUtterances] = useState([]);
  const [step2Text, setStep2Text] = useState('');
  const [step3Text, setStep3Text] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(VOICE_PRESETS[0]);
  const [pitchOffset, setPitchOffset] = useState(0);
  const [renderMode, setRenderMode] = useState('premium'); // 'fast' | 'premium'
  // Translation Mode States
  const [translationMode, setTranslationMode] = useState(null); // 'manual' | 'api'
  const [geminiApiKey, setGeminiApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [assemblyAiKey, setAssemblyAiKey] = useState(localStorage.getItem('assemblyAiKey') || '');
  const [manualTranslationInput, setManualTranslationInput] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showApiKeyConfig, setShowApiKeyConfig] = useState(!localStorage.getItem('assemblyAiKey'));

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
    if (user?.role === 'free') {
      setError('Auto mode is only available for Premium users.');
      return;
    }
    if (user?.role !== 'admin' && (user?.videoLimit === undefined || user?.videoLimit <= 0)) {
      setError('Video limit reached. You have 0 credits remaining.');
      return;
    }
    setLoading(true); setFfmpegProgress(0); setError('');
    setAutoStep(1); setAutoProgress(10); // Fetching step

    try {
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile('input_video.mp4', await fetchFile(file));
      setAutoProgress(15);
      await ffmpeg.exec(['-i', 'input_video.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', 'extracted_audio.mp3']);
      const audioData = await ffmpeg.readFile('extracted_audio.mp3');
      const formData = new FormData();
      formData.append('audio', new File([new Blob([audioData.buffer], { type: 'audio/mp3' })], 'extracted_audio.mp3', { type: 'audio/mp3' }));
      if (assemblyAiKey) formData.append('assemblyAiKey', assemblyAiKey);

      const token = localStorage.getItem('token');

      setAutoStep(2); setAutoProgress(25); // Transcribing step

      const extractRes = await axios.post(`${apiUrl}/step1-extract`, formData, { headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` } });
      if (extractRes.data.remainingLimit !== undefined && setUser) {
        setUser({
          ...user,
          videoLimit: extractRes.data.remainingLimit,
          freeVideosUsed: extractRes.data.freeVideosUsed !== undefined ? extractRes.data.freeVideosUsed : user.freeVideosUsed,
          lastFreeVideoDate: extractRes.data.lastFreeVideoDate !== undefined ? extractRes.data.lastFreeVideoDate : user.lastFreeVideoDate
        });
      }
      const extractedUtterances = extractRes.data.utterances;

      setAutoStep(3); setAutoProgress(45); // Translating step

      const translateRes = await axios.post(`${apiUrl}/step2-translate`, { utterances: extractedUtterances }, { headers: { Authorization: `Bearer ${token}` } });
      const translatedUtterances = translateRes.data.translatedUtterances;

      setAutoStep(4); setAutoProgress(65); // Synthesizing step

      const finalPitch = Number(selectedVoice.pitch.replace('Hz', '')) + pitchOffset;
      const voicePayload = {
        voice: selectedVoice.voice,
        rate: selectedVoice.rate,
        pitch: `${finalPitch > 0 ? '+' : ''}${finalPitch}Hz`
      };

      const ttsRes = await axios.post(`${apiUrl}/step3-tts`, { translatedUtterances, voice: voicePayload, videoDuration }, { headers: { Authorization: `Bearer ${token}` } });
      const audioUrl = ttsRes.data.url;
      const audioFilename = ttsRes.data.finalAudioFilename;

      setAutoProgress(75);

      // ── Premium/Admin: Server-Side Render (faster) ──
      if (user?.role === 'premium' || user?.role === 'admin') {
        setAutoStep(5); setAutoProgress(80);

        const renderForm = new FormData();
        renderForm.append('video', file);
        renderForm.append('audioFilename', audioFilename);
        renderForm.append('videoSegmentsJson', JSON.stringify(ttsRes.data.videoSegments || []));
        renderForm.append('videoDuration', String(videoDuration));

        const renderRes = await axios.post(`${apiUrl}/step4-render`, renderForm, {
          headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` },
          onUploadProgress: (progressEvent) => {
            const uploadPct = (progressEvent.loaded / (progressEvent.total || 1)) * 100;
            // Upload is 80–90%, server processing is 90–100%
            setAutoProgress(80 + uploadPct * 0.10);
          }
        });

        setAutoProgress(100);
        setAutoStep(6);

        setUtterances(ttsRes.data.updatedUtterances || ttsRes.data.utterances || []);
        setPreviewAudioUrl(audioUrl);
        setVideoSegments(ttsRes.data.videoSegments || []);
        setFinalVideoUrl(renderRes.data.url);
        setLoading(false);
        return; // done — skip client-side render below
      }

      // ── Free users: Client-Side FFmpeg.wasm Render ──
      const fetchedAudioData = await fetchFile(audioUrl);

      const renderFfmpeg = renderFfmpegRef.current;
      await renderFfmpeg.writeFile('input_video.mp4', await fetchFile(file));
      await renderFfmpeg.writeFile('merge_input_audio.mp3', fetchedAudioData);

      // Free up memory from the primary ffmpeg instance to avoid OOM
      await ffmpeg.deleteFile('input_video.mp4').catch(() => { });
      await ffmpeg.deleteFile('extracted_audio.mp3').catch(() => { });

      const utterancesArray = ttsRes.data.updatedUtterances || ttsRes.data.utterances || [];
      const videoSegmentsArr = ttsRes.data.videoSegments || [];
      const audioDurationMs = utterancesArray.length > 0 ? (utterancesArray[utterancesArray.length - 1].newEndMs || utterancesArray[utterancesArray.length - 1].end || 0) : 0;


      // ── CLAUDE.md Step 7: N retimed segments (trim+setpts per block) concatenated ──
      // Filter out zero-length or invalid segments first so split count matches concat count
      const validSegs = videoSegmentsArr.filter(
        (seg) => typeof seg.originalStart === 'number' &&
          typeof seg.originalEnd === 'number' &&
          seg.originalEnd > seg.originalStart + 0.001
      );

      // Add a final segment for the remainder of the video if there's silence at the end
      if (validSegs.length > 0) {
        const videoDuration = await getVideoDuration(file);
        const lastSeg = validSegs[validSegs.length - 1];
        if (videoDuration - lastSeg.originalEnd > 0.1) {
          validSegs.push({
            originalStart: lastSeg.originalEnd,
            originalEnd: null,
            videoSpeed: 1.0
          });
        }
      }

      let filterScript = '';
      const ffmpegArgs = [
        '-i', 'input_video.mp4',
        '-i', 'merge_input_audio.mp3'
      ];

      if (validSegs.length > 1) {
        // Split the input video into exactly validSegs.length copies
        const splitLabels = validSegs.map((_, i) => `[s${i}]`).join('');
        filterScript += `[0:v]split=${validSegs.length}${splitLabels};\n`;

        // Trim + setpts each segment per CLAUDE.md spec
        const segLabels = validSegs.map((seg, i) => {
          const speed = typeof seg.videoSpeed === 'number' && seg.videoSpeed > 0 ? seg.videoSpeed : 1.0;
          if (seg.originalEnd === null) {
            filterScript += `[s${i}]trim=start=${seg.originalStart.toFixed(4)},setpts=${(1 / speed).toFixed(6)}*(PTS-STARTPTS)[v${i}];\n`;
          } else {
            filterScript += `[s${i}]trim=${seg.originalStart.toFixed(4)}:${seg.originalEnd.toFixed(4)},setpts=${(1 / speed).toFixed(6)}*(PTS-STARTPTS)[v${i}];\n`;
          }
          return `[v${i}]`;
        });

        // Concatenate all retimed segments back to back
        filterScript += `${segLabels.join('')}concat=n=${validSegs.length}:v=1:a=0[outv]\n`;

      } else if (validSegs.length === 1) {
        // Single segment — no split needed
        const seg = validSegs[0];
        const speed = typeof seg.videoSpeed === 'number' && seg.videoSpeed > 0 ? seg.videoSpeed : 1.0;
        if (seg.originalEnd === null) {
          filterScript += `[0:v]trim=start=${seg.originalStart.toFixed(4)},setpts=${(1 / speed).toFixed(6)}*(PTS-STARTPTS)[outv]\n`;
        } else {
          filterScript += `[0:v]trim=${seg.originalStart.toFixed(4)}:${seg.originalEnd.toFixed(4)},setpts=${(1 / speed).toFixed(6)}*(PTS-STARTPTS)[outv]\n`;
        }

      } else {
        // No segments at all — pass video through as-is
        filterScript += `[0:v]null[outv]\n`;
      }

      await renderFfmpeg.writeFile('filter.txt', new TextEncoder().encode(filterScript));

      ffmpegArgs.push(
        '-filter_complex_script', 'filter.txt',
        '-map', '[outv]',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        '-shortest',
        'final_output.mp4'
      );

      // Setup Preview States
      setUtterances(utterancesArray);
      setPreviewAudioUrl(audioUrl);
      setVideoSegments(ttsRes.data.videoSegments || []);

      setAutoStep(5); setAutoProgress(80); // Rendering step

      // Start rendering
      const progressHandler = ({ progress, time }) => {
        let p = 0;
        if (time !== undefined && audioDurationMs > 0) {
          const timeInMs = time / 1000;
          p = (timeInMs / audioDurationMs) * 100;
          if (p > 99) p = 99;
        } else if (progress >= 0 && progress <= 1) {
          p = progress * 100;
        }
        // Scale ffmpeg progress (0-100) to autoProgress (80-100)
        setAutoProgress(80 + (p * 0.2));
      };

      renderFfmpeg.on('progress', progressHandler);
      try {
        await renderFfmpeg.exec(ffmpegArgs);
      } catch (err) {
        console.warn("Auto render exec threw (often benign Aborted at teardown):", err);
      }
      renderFfmpeg.off('progress', progressHandler);

      let finalData;
      try {
        finalData = await renderFfmpeg.readFile('final_output.mp4');
      } catch (err) {
        throw new Error('Video rendering failed. The video might be too large or incompatible.');
      }

      setAutoProgress(100);
      setAutoStep(6); // Finished

      const finalUrl = URL.createObjectURL(new Blob([finalData.buffer], { type: 'video/mp4' }));
      setFinalVideoUrl(finalUrl);

      // CLEAR MEMORY to prevent slowdowns on next render
      await renderFfmpeg.deleteFile('input_video.mp4').catch(() => { });
      await renderFfmpeg.deleteFile('merge_input_audio.mp3').catch(() => { });
      await renderFfmpeg.deleteFile('final_output.mp4').catch(() => { });
      await renderFfmpeg.deleteFile('filter.txt').catch(() => { });

      setLoading(false);

    } catch (err) {
      console.error(err);
      setError(err.response?.data?.details || err.response?.data?.error || err.message || 'Auto Process failed.');
      setLoading(false);
      setAutoStep(0);
      setAutoProgress(0);
    }
  };

  const handleCancelAutoProcess = () => {
    if (ffmpegRef.current) {
      try {
        ffmpegRef.current.terminate();
        ffmpegRef.current = new FFmpeg();
        loadFfmpeg();
      } catch (e) { }
    }
    setLoading(false);
    setAutoStep(0);
    setAutoProgress(0);
    setFile(null);
    setFinalVideoUrl('');
    setError('Job was cancelled by user.');
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];

      // Enforce 10 minute limit
      const objectUrl = URL.createObjectURL(selectedFile);
      const media = document.createElement(selectedFile.type.startsWith('audio') ? 'audio' : 'video');

      media.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl);
        if (media.duration > 600) {
          setError('၁၀ မိနစ်အောက် Video များကိုသာ လက်ခံပါသည်။ (Video must be less than 10 minutes)');
          setFile(null);
        } else {
          setFile(selectedFile);
          setVideoDuration(media.duration);
          setError('');
          resetFlow();
        }
      };

      media.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        // Fallback if browser can't read metadata quickly
        setFile(selectedFile);
        setError('');
        resetFlow();
      };

      media.src = objectUrl;
    }
  };

  const handleExtract = async () => {
    if (!file) {
      setError('Please select a video file first.');
      return;
    }
    if (user?.role === 'restrict') {
      setError('သင့်အကောင့်ကို ပိတ်ပင်ထားပါသည်။ (Your account has been restricted.)');
      return;
    }
    if (user?.role === 'free') {
      if (!assemblyAiKey || assemblyAiKey.trim() === '') {
        setError('Free users must provide their own AssemblyAI API key.');
        return;
      }
      if (getFreeLimitRemaining(user) <= 0) {
        setError('Daily video limit reached. You can only generate 3 videos per day on the Free plan.');
        return;
      }
    } else if (user?.role !== 'admin' && (user?.videoLimit === undefined || user?.videoLimit <= 0)) {
      setError('Video limit reached. You have 0 credits remaining.');
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
      try {
        await ffmpeg.exec(['-i', 'input_video.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', 'extracted_audio.mp3']);
      } catch (err) {
        console.warn("Extract exec threw (benign Aborted):", err);
      }

      let audioData;
      try {
        audioData = await ffmpeg.readFile('extracted_audio.mp3');
      } catch (err) {
        throw new Error('Audio extraction failed. File not generated.');
      }
      
      const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp3' });
      const audioFile = new File([audioBlob], 'extracted_audio.mp3', { type: 'audio/mp3' });

      // Clean up memory
      await ffmpeg.deleteFile('input_video.mp4');
      await ffmpeg.deleteFile('extracted_audio.mp3');

      // 2. Upload ONLY the audio file to the server
      const formData = new FormData();
      formData.append('audio', audioFile);
      if (assemblyAiKey) formData.append('assemblyAiKey', assemblyAiKey);

      const token = localStorage.getItem('token');
      const response = await axios.post(`${apiUrl}/step1-extract`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` },
      });
      if (response.data.remainingLimit !== undefined && setUser) {
        setUser({
          ...user,
          videoLimit: response.data.remainingLimit,
          role: response.data.role || user.role,
          freeVideosUsed: response.data.freeVideosUsed !== undefined ? response.data.freeVideosUsed : user.freeVideosUsed,
          lastFreeVideoDate: response.data.lastFreeVideoDate !== undefined ? response.data.lastFreeVideoDate : user.lastFreeVideoDate
        });
      }
      setUtterances(response.data.utterances);
      setStep2Text(response.data.utterances.map(u => u.text).join('\n\n'));
      setVideoId(response.data.videoId);
      setStep(2);
      setLoadingSteps([]);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.details || err.response?.data?.error || err.message || 'Extraction failed.');
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

      const ffmpegArgs = [
        '-i', 'input.mp4',
        '-i', 'tts.mp3',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-y', 'output.mp4'
      ];

      try {
        await renderFfmpeg.exec(ffmpegArgs);
      } catch (err) {
        console.warn("Manual render exec threw (often benign Aborted at teardown):", err);
      }

      renderFfmpeg.off('progress', progressHandler);

      let data;
      try {
        data = await renderFfmpeg.readFile('output.mp4');
      } catch (err) {
        throw new Error('Failed to retrieve rendered video. Output file not found.');
      }
      
      const finalBlob = new Blob([data.buffer], { type: 'video/mp4' });
      const finalUrl = URL.createObjectURL(finalBlob);

      // CLEAR MEMORY: Delete files from FFmpeg virtual file system to prevent RAM leak and slowdowns
      await renderFfmpeg.deleteFile('input.mp4').catch(() => { });
      await renderFfmpeg.deleteFile('tts.mp3').catch(() => { });
      await renderFfmpeg.deleteFile('output.mp4').catch(() => { });
      if (needsStretching) {
        await renderFfmpeg.deleteFile('filter.txt').catch(() => { });
      }

      setBackgroundTask({
        status: 'done',
        progress: 100,
        videoUrl: finalUrl,
        error: ''
      });

      // Auto-trigger download
      const a = document.createElement('a');
      a.href = finalUrl;
      a.download = `RecapStudio_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

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
    if (!isPremium && !geminiApiKey.trim()) {
      setError('Gemini api key ထည့်သွင်းပေးပါခင်ဗျာ။');
      return;
    }

    // Save API key
    localStorage.setItem('geminiApiKey', geminiApiKey);

    setLoading(true);
    setError('');
    setLoadingSteps([
      "AI က မူရင်းစာကြောင်းများကို ဖတ်နေပါသည်...",
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

      const token = localStorage.getItem('token');
      const response = await axios.post(`${apiUrl}/step2-translate`, {
        utterances: updatedUtterances,
        apiKey: geminiApiKey
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setUtterances(response.data.translatedUtterances);
      setStep3Text(response.data.translatedUtterances.map(u => u.translatedText).join('\n\n'));
      setStep(3);
      setLoadingSteps([]);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.details || err.response?.data?.error || err.message || 'Translation failed.');
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

    const prompt = `You are a professional video dubbing translator. You MUST translate the following source subtitles into natural spoken Burmese (Myanmar script ONLY, NO English, NO phonetic guides).
  
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

      const finalPitch = Number(selectedVoice.pitch.replace('Hz', '')) + pitchOffset;
      const voicePayload = {
        voice: selectedVoice.voice,
        rate: selectedVoice.rate,
        pitch: `${finalPitch > 0 ? '+' : ''}${finalPitch}Hz`
      };

      const token = localStorage.getItem('token');
      const response = await axios.post(`${apiUrl}/step3-tts`, {
        translatedUtterances: updatedUtterances,
        voice: voicePayload,
        videoDuration
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setDownloadUrl(response.data.url);
      if (response.data.videoSegments) setVideoSegments(response.data.videoSegments);
      if (response.data.updatedUtterances) setUtterances(response.data.updatedUtterances);

      setStep(4);
      setLoadingSteps([]);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.details || err.response?.data?.error || err.message || 'TTS mixing failed.');
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

      // 1. Write inputs to FFmpeg FS
      await ffmpeg.writeFile('merge_input_video.mp4', await fetchFile(file));
      await ffmpeg.writeFile('merge_input_audio.mp3', await fetchFile(downloadUrl));

      // 2. Simple mux: keep original video speed, drop original audio, add new mixed audio
      const ffmpegArgs = [
        '-i', 'merge_input_video.mp4',
        '-i', 'merge_input_audio.mp3',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-y', 'output_merged.mp4'
      ];

      try {
        await ffmpeg.exec(ffmpegArgs);
      } catch (err) {
        console.warn("Manual Mode merge exec threw (benign Aborted):", err);
      }

      // 3. Read output and trigger download
      let outputData;
      try {
        outputData = await ffmpeg.readFile('output_merged.mp4');
      } catch (err) {
        throw new Error('Video merge failed. Output file not generated.');
      }
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
      await ffmpeg.deleteFile('merge_input_video.mp4').catch(() => { });
      await ffmpeg.deleteFile('merge_input_audio.mp3').catch(() => { });
      await ffmpeg.deleteFile('output_merged.mp4').catch(() => { });
      await ffmpeg.deleteFile('filter.txt').catch(() => { });

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
            <div
              onClick={() => setIsDrawerOpen(true)}
              className="flex items-center gap-2 sm:gap-3 bg-white/5 border border-white/10 rounded-full pl-1 sm:pl-2 pr-4 sm:pr-5 py-1 sm:py-1.5 transition-all cursor-pointer hover:bg-white/10 shadow-sm hover:shadow-md"
            >
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-purple-500/50 shrink-0" />
              ) : (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-xs sm:text-sm shrink-0">{user.name.charAt(0)}</div>
              )}
              <div className="flex flex-col max-w-[80px] sm:max-w-none overflow-hidden">
                <span className="text-xs sm:text-sm font-medium text-white leading-none truncate">{user.name}</span>
                <span className="text-[8px] sm:text-[10px] text-purple-400 uppercase tracking-wider font-bold mt-1">
                  {user.role} {getLimitDisplay(user)}
                </span>
              </div>
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

        <div className="flex-1 flex flex-col items-center p-6 relative z-10 overflow-hidden">
          <div className="max-w-xl w-full bg-white/5 backdrop-blur-2xl border border-white/10 p-6 sm:p-8 rounded-3xl shadow-2xl text-center flex flex-col max-h-full overflow-y-auto sm:my-auto">
            <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-green-500/30 shrink-0">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Premium Auto Mode</h2>
            <p className="text-gray-400 mb-8">တစ်ချက်နှိပ်ရုံဖြင့် Video ကို ဘာသာပြန်ပေးပါမည်။ အသံထုတ်ယူခြင်း၊ ဘာသာပြန်ခြင်း၊ အသံဖန်တီးခြင်းနှင့် ပေါင်းစပ်ခြင်းတို့ကို Admin API Keys များ အသုံးပြု၍ အလိုအလျောက် လုပ်ဆောင်ပေးသွားပါမည်။</p>

            {!file ? (
              <label className="border-2 border-dashed border-purple-500/30 bg-purple-500/5 rounded-3xl p-10 text-center cursor-pointer relative overflow-hidden transition-all hover:bg-purple-500/10 hover:border-purple-500/50 group mt-4 block w-full">
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={loading}
                />
                <UploadCloud className="w-8 h-8 text-purple-400 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                <span className="text-purple-300 font-bold text-base pointer-events-none">နှိပ်၍ File ရွေးချယ်ပါ</span>
              </label>
            ) : finalVideoUrl ? (
              <div className="space-y-4 mt-4">
                <div className="w-full bg-black/50 rounded-2xl overflow-hidden shadow-inner border border-white/10">
                  <video src={finalVideoUrl} controls className="w-full max-h-72 object-contain bg-black" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <a
                    href={finalVideoUrl}
                    download="auto_translated_video.mp4"
                    className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 hover:scale-[1.02]"
                  >
                    <Download className="w-5 h-5" />
                    Download Video
                  </a>

                  <button
                    onClick={handleDownloadSRT}
                    className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30 hover:scale-[1.02]"
                  >
                    <Download className="w-5 h-5" />
                    Download Subtitles (.srt)
                  </button>
                </div>

                <button
                  onClick={() => { setFile(null); setFinalVideoUrl(''); setIsPreviewMode(false); }}
                  className="w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10"
                >
                  <RefreshCw className="w-5 h-5" />
                  Translate Another Video
                </button>
              </div>
            ) : (
              <div className="space-y-4 mt-4">
                <div className="p-4 bg-[#1e293b]/50 rounded-2xl border border-white/10 flex items-center gap-4 text-left">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
                    <Video className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate text-sm">{file.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button onClick={() => setFile(null)} className="p-2.5 text-gray-400 hover:text-red-400 rounded-xl hover:bg-white/5 transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* Removed AssemblyAI API Key Input for Premium Auto Mode */}

                {/* Voice Selection for Auto Mode */}
                <div className="pt-2">
                  <VoiceSelector
                    selectedVoice={selectedVoice}
                    setSelectedVoice={setSelectedVoice}
                    pitchOffset={pitchOffset}
                    setPitchOffset={setPitchOffset}
                  />
                </div>

                <button
                  onClick={handleAutoProcess}
                  disabled={loading}
                  className="w-full py-4 mt-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
                  {loading ? 'Processing...' : 'Start Auto Translate'}
                </button>
              </div>
            )}
          </div>
        </div>
        <AutoLoadingOverlay step={autoStep} progress={autoProgress} onCancel={handleCancelAutoProcess} isServerRender={user?.role === 'premium' || user?.role === 'admin'} />
        <UserProfileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} user={user} logout={logout} packages={pricingPackages} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col font-sans relative overflow-hidden text-white">
      {/* Navbar (Same as Auto Mode) */}
      <div className="relative z-10 w-full px-6 py-4 flex justify-between items-center border-b border-white/10 bg-black/20 backdrop-blur-md shadow-sm">
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

        {/* User Menu */}
        <div className="flex items-center gap-2 sm:gap-4">
          <button onClick={() => setShowGuide(true)} className="hidden md:flex p-1.5 sm:p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-sm border border-white/20 text-xs text-white items-center gap-1 font-semibold">
             <HelpCircle className="w-4 h-4" /> အသုံးပြုနည်း လမ်းညွှန်
          </button>
          <div
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-2 sm:gap-3 bg-white/5 border border-white/10 rounded-full pl-1 sm:pl-2 pr-4 sm:pr-5 py-1 sm:py-1.5 transition-all cursor-pointer hover:bg-white/10 shadow-sm hover:shadow-md"
          >
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-purple-500/50 shrink-0" />
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-xs sm:text-sm shrink-0">
                {user.name.charAt(0)}
              </div>
            )}
            <div className="flex flex-col overflow-hidden max-w-[80px] sm:max-w-[150px]">
              <span className="text-xs sm:text-sm font-medium text-white leading-none truncate">{user.name}</span>
              <span className="text-[8px] sm:text-[10px] text-purple-400 uppercase tracking-wider font-bold mt-0.5">
                {user.role} {getLimitDisplay(user)}
              </span>
            </div>
          </div>
          {user?.role === 'admin' && (
            <button onClick={() => navigate('/admin')} className="p-1.5 sm:p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-sm border border-white/20 group backdrop-blur-xl">
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

      {/* Main Container */}
      <div className="flex-1 flex flex-col items-center p-4 relative z-10 overflow-hidden">

        {/* Background Task Floating Indicator */}
        {backgroundTask.status !== 'idle' && (
          <div className="fixed top-4 left-4 z-[100] flex items-center bg-[#1e293b]/90 backdrop-blur-md shadow-2xl border border-white/20 rounded-full pl-2 pr-5 py-2.5 gap-4 transition-all duration-500 hover:scale-105">
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

        {/* Manual Mode Editor Card */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-white/10 flex flex-col max-h-full sm:my-auto">
          {/* Breadcrumb Header */}
          <div className="bg-transparent py-4 px-6 border-b border-white/10 flex gap-3 text-sm font-bold text-blue-400 w-full overflow-x-auto hide-scrollbar justify-center items-center shrink-0">
            <span className={`whitespace-nowrap flex items-center gap-1.5 ${step >= 1 ? 'text-blue-300' : 'text-gray-500'}`}><span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px]">1</span> Upload</span>
            <span className="text-gray-600">›</span>
            <span className={`whitespace-nowrap flex items-center gap-1.5 ${step >= 2 ? 'text-blue-300' : 'text-gray-500'}`}><span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px]">2</span> Source Text</span>
            <span className="text-gray-600">›</span>
            <span className={`whitespace-nowrap flex items-center gap-1.5 ${step >= 3 ? 'text-blue-300' : 'text-gray-500'}`}><span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px]">3</span> Myanmar</span>
            <span className="text-gray-600">›</span>
            <span className={`whitespace-nowrap flex items-center gap-1.5 ${step >= 4 ? 'text-blue-300' : 'text-gray-500'}`}><span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px]">4</span> Result</span>
          </div>

          {/* Main Content (Scrollable) */}
          <div className="p-6 space-y-6 overflow-y-auto grow">

            {/* API Key Configuration Inline Layout */}
            <div className="bg-[#1e293b]/60 border border-purple-500/30 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3"></div>
              
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-purple-400" />
                  <h3 className="font-bold text-white text-sm sm:text-base">AssemblyAI API Key (Required)</h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-[10px] sm:text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full font-bold border border-purple-500/30 shadow-sm">
                    Local Storage
                  </div>
                  <button 
                    onClick={() => setShowApiKeyConfig(!showApiKeyConfig)}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                  >
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${showApiKeyConfig ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>
              
              {showApiKeyConfig && (
                <div className="relative z-10 mt-4 animate-in slide-in-from-top-2 fade-in duration-200">
                  <input
                    type="password"
                    value={assemblyAiKey}
                    onChange={(e) => { 
                      setAssemblyAiKey(e.target.value); 
                      localStorage.setItem('assemblyAiKey', e.target.value); 
                    }}
                    placeholder="Enter your AssemblyAI key..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-sm"
                  />
                  <p className="text-[10px] sm:text-xs text-gray-400 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-400" /> Key is saved locally and only used for your transcriptions.
                  </p>
                </div>
              )}
            </div>

            {/* Step 1: Upload Section */}
            {step >= 1 && (
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/5 mb-6">
                <h2 className="text-xl font-bold text-white mb-2">Step 1: Video တင်ပါ</h2>
                <p className="text-sm text-gray-400 mb-6">Recap လုပ်မည့် video ကို ရွေးချယ်ပါ။ (အသံကို အရင်ဆွဲထုတ်ပါမည်)</p>

                {!file && (
                  <label className="border-2 border-dashed border-purple-500/30 bg-purple-500/5 rounded-3xl p-10 text-center cursor-pointer relative overflow-hidden transition-all hover:bg-purple-500/10 hover:border-purple-500/50 group block w-full">
                    <input
                      type="file"
                      accept="video/*,audio/*"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={loading}
                    />
                    <UploadCloud className="w-8 h-8 text-purple-400 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                    <span className="text-purple-300 font-bold text-base pointer-events-none">နှိပ်၍ File ရွေးချယ်ပါ</span>
                  </label>
                )}

                {/* Video Preview right after selection to test browser compatibility */}
                {videoUrl && (
                  <div className="mt-4 rounded-xl overflow-hidden border border-white/30 bg-black">
                    <div className="bg-white/10/20 p-2 flex justify-between items-center px-4">
                      <span className="text-xs text-white/70 font-medium truncate max-w-[200px]">{file?.name || 'Local Cache Preview'}</span>
                      <label className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer font-bold flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> Change File
                        <input
                          type="file"
                          accept="video/*,audio/*"
                          onChange={handleFileChange}
                          className="hidden"
                          disabled={loading}
                        />
                      </label>
                    </div>
                    <video src={videoUrl} controls className="w-full h-48 object-contain" playsInline />
                  </div>
                )}

                {/* Removed inline AssemblyAI API Key Input */}

                {step === 1 && (
                  <button
                    onClick={handleExtract}
                    disabled={loading || !file || user?.role === 'restrict'}
                    className={`w-full mt-6 py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${loading || !file || user?.role === 'restrict' ? 'bg-white/10 text-white/50 cursor-not-allowed' : 'bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-500'}`}
                  >
                    {user?.role === 'restrict' ? (
                      <>Account Restricted <AlertTriangle className="w-5 h-5" /></>
                    ) : loading ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                    ) : (
                      <>Step 1: အသံထုတ်မည် <Play className="w-5 h-5 fill-current" /></>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Step 2: English Transcript Review */}
            {step >= 1 && file && (
              <div className={`bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/5 space-y-4 transition-all duration-500 ${step === 1 ? 'opacity-50 pointer-events-none' : 'opacity-100 mb-6'}`}>
                <h2 className="text-xl font-bold text-white">Step 2: မူရင်းစာသားကို စစ်ဆေးပါ (Source Text)</h2>
                <p className="text-xs text-white/70">အောက်ပါ မူရင်းစာကြောင်းများကို လိုအပ်ပါက ပြင်ဆင်နိုင်ပါသည်။</p>

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
                    disabled={step === 1}
                    className="w-full text-sm p-4 pt-12 rounded-xl border border-white/20 focus:outline-none focus:border-white/20 focus:ring-2 focus:ring-blue-100 bg-black/20 h-56 min-h-[14rem] overflow-y-auto font-mono leading-relaxed"
                    placeholder={step === 1 ? "Waiting for extraction..." : "Text here..."}
                  />
                </div>

                {step >= 2 && (
                  <div className="flex flex-col gap-3 mt-6">
                    {!translationMode ? (
                      isPremium ? (
                        <button
                          onClick={handleTranslate}
                          disabled={loading}
                          className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-green-600 text-white shadow-lg shadow-green-500/30 hover:bg-green-500"
                        >
                          {loading ? (
                            <><Loader2 className="w-5 h-5 animate-spin" /> Translating...</>
                          ) : (
                            <>Step 2: Translate <Play className="w-5 h-5 fill-current" /></>
                          )}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setTranslationMode('manual');
                              handleManualCopy();
                            }}
                            disabled={loading}
                            className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-500"
                          >
                            Gemini App မှ တစ်ဆင့် ဘာသာပြန်မည်
                          </button>
                          <button
                            onClick={() => setTranslationMode('api')}
                            disabled={loading}
                            className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-500"
                          >
                            Gemini API Key ဖြင့် ဆက်သွားမည်
                          </button>
                        </>
                      )
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
                          className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 relative z-10 ${!manualTranslationInput ? 'bg-white/10/30 text-white/50 cursor-not-allowed' : 'bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-500'}`}
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
                        {!isPremium && (
                          <input
                            type="password"
                            value={geminiApiKey}
                            onChange={(e) => setGeminiApiKey(e.target.value)}
                            placeholder="Enter your Gemini  API Key"
                            className="w-full p-3 border border-white/20 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                          />
                        )}
                        <button
                          onClick={handleTranslate}
                          disabled={loading || (!isPremium && !geminiApiKey.trim())}
                          className={`w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${loading || (!isPremium && !geminiApiKey.trim()) ? 'bg-white/10/30 text-white/50 cursor-not-allowed' : 'bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-500'}`}
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
              </div>
            )}

            {/* Step 3: Burmese Transcript Review */}
            {step >= 2 && step2Text && (
              <div className={`bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/5 space-y-4 transition-all duration-500 ${step === 2 ? 'opacity-50 pointer-events-none' : 'opacity-100 mb-6 mt-6'}`}>
                <h2 className="font-bold text-white text-xl">Step 3: မြန်မာဘာသာပြန်ကို စစ်ဆေးပါ</h2>
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
                    disabled={step === 2}
                    className="w-full text-sm p-4 pt-12 rounded-xl border border-white/20 focus:outline-none focus:border-white/20 focus:ring-2 focus:ring-blue-100 bg-white/10 backdrop-blur-md/10 h-56 min-h-[14rem] overflow-y-auto font-mono leading-relaxed"
                    placeholder={step === 2 ? "Waiting for translation..." : "Translated text here..."}
                  />
                </div>

                {step >= 3 && (
                  <div className="space-y-4 mt-6 pt-6 border-t border-white/10">
                    <h3 className="text-white/80 font-bold mb-2">အသံရွေးချယ်ပါ (Select Voice)</h3>
                    <VoiceSelector
                      selectedVoice={selectedVoice}
                      setSelectedVoice={setSelectedVoice}
                      pitchOffset={pitchOffset}
                      setPitchOffset={setPitchOffset}
                    />

                    <button
                      onClick={handleTTS}
                      disabled={loading}
                      className={`w-full mt-4 py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${loading ? 'bg-white/10 cursor-not-allowed text-white/50' : 'bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-500'}`}
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
            )}

            {/* Step 4: Result (Audio, Subtitles, Final Video) */}
            {/* Step 4: Result (Audio, Subtitles, Final Video) */}
            {step >= 4 && downloadUrl && (
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/5 space-y-4 mt-6">
                <h2 className="font-bold text-white text-xl">Step 4: ရလဒ်များ (Results)</h2>
                <p className="text-sm text-white/80">အောက်ပါဖိုင်များကို Download ရယူနိုင်ပါသည်။</p>

                <div className="bg-white/10/20 p-4 rounded-xl border border-white/30 flex flex-col items-center gap-4">
                  <div className="flex flex-col w-full gap-3 mt-2">
                    <button
                      onClick={handleDownloadSRT}
                      className="w-full py-3 bg-purple-600 text-white text-center rounded-xl font-bold text-sm hover:bg-purple-700 transition shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" /> Download Subtitles (.srt)
                    </button>

                    <button
                      onClick={() => {
                        if (backgroundTask.status === 'done' && backgroundTask.videoUrl) {
                          const a = document.createElement('a');
                          a.href = backgroundTask.videoUrl;
                          a.download = `RecapStudio_${Date.now()}.mp4`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        } else {
                          handleDownloadVideo();
                        }
                      }}
                      disabled={backgroundTask.status === 'rendering' || loading}
                      className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-2xl shadow-lg hover:shadow-purple-500/30 transition-all flex items-center justify-center gap-3 disabled:opacity-50 text-lg mt-2"
                    >
                      {backgroundTask.status === 'rendering' ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" /> Rendering Video...
                        </>
                      ) : backgroundTask.status === 'done' ? (
                        <>
                          <CheckCircle2 className="w-6 h-6" /> Download Again
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
                    className="w-full py-3 bg-white text-slate-900 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all flex items-center justify-center gap-2 shadow-lg"
                  >
                    <RefreshCw className="w-4 h-4" /> အသစ်ပြန်လုပ်မည် (Start New Project)
                  </button>
                </div>
              </div>
            )}



          </div>

        </div>

        {/* Global Error Toast */}
        {error && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md p-4 bg-red-950/90 backdrop-blur-xl border border-red-500/50 rounded-2xl shadow-[0_10px_40px_rgba(239,68,68,0.3)] flex items-start gap-3 animate-in slide-in-from-top-4 duration-300">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-100 text-sm font-medium leading-relaxed flex-1">{error}</p>
            <button onClick={() => setError('')} className="p-1 text-red-400 hover:text-white rounded-full hover:bg-red-500/30 transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

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

              <h2 className="text-2xl font-bold text-white mb-2">Premium ဝယ်ယူရန်</h2>
              <p className="text-gray-400 mb-6">Auto Mode ကို Premium User များသာ အသုံးပြုနိုင်ပါသည်။ Video တစ်ခုလုံးကို One-Click နှိပ်ရုံဖြင့် အလိုအလျောက် ဘာသာပြန်ပေးပါမည်။</p>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span>အလွန်မြန်ဆန်သော AI ဘာသာပြန်စနစ်</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span>ကိုယ်တိုင်ပြင်ဆင်ရန် လုံးဝမလိုတော့ပါ</span>
                </div>
              </div>

              <div className="space-y-3">
                {pricingPackages.map((pkg, index) => (
                  <button key={index} onClick={() => { alert('Premium purchasing coming soon!'); setShowPremiumModal(false); }} className={`w-full p-3 rounded-xl border transition flex items-center justify-between group relative overflow-hidden ${pkg.isPopular ? 'border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                    {pkg.isPopular && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-b-md z-10">အရောင်းရဆုံး</div>
                    )}
                    {pkg.discount > 0 && (
                      <div className="absolute top-0 left-0 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-br-md z-10 shadow-lg">{pkg.discount}% OFF</div>
                    )}
                    <div className={`text-left ${(pkg.isPopular || pkg.discount > 0) ? 'mt-2' : ''}`}>
                      <h4 className={`font-bold text-sm flex items-center gap-2 ${pkg.isPopular ? 'text-purple-400' : 'text-blue-400'}`}>
                        {pkg.title}
                      </h4>
                      <div className="flex flex-col mt-0.5">
                        {pkg.discount > 0 && (
                          <span className="text-gray-500 text-[10px] line-through decoration-red-500/50">{Math.round(pkg.mmk / (1 - pkg.discount / 100)).toLocaleString()} MMK</span>
                        )}
                        <span className="text-gray-300 text-xs font-semibold">{pkg.mmk.toLocaleString()} MMK / {pkg.bath} Bath</span>
                      </div>
                    </div>
                    <span className={`px-4 py-2 rounded-lg text-sm font-bold transition ${pkg.isPopular ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30 group-hover:bg-purple-600' : 'bg-blue-500/20 text-blue-300 group-hover:bg-blue-500 group-hover:text-white'}`}>ဝယ်မည်</span>
                  </button>
                ))}
                {pricingPackages.length === 0 && (
                  <p className="text-gray-500 text-sm italic text-center py-2">No packages available.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <UserProfileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} user={user} logout={logout} packages={pricingPackages} setShowGuide={setShowGuide} />

      {/* Guide Modal */}
      {showGuide && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0F172A] border border-white/20 rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button onClick={() => setShowGuide(false)} className="absolute top-4 right-4 p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white sticky float-right z-10">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 pr-10">
              <HelpCircle className="w-6 h-6 text-purple-400 shrink-0" /> အသုံးပြုနည်း လမ်းညွှန်
            </h2>
            <div className="space-y-4 text-sm text-gray-300">
              <p><strong>၁။ Video တင်ပါ (Upload Video):</strong> သင် Recap လုပ်လိုသော ဗီဒီယို (သို့) အသံဖိုင်ကို ရွေးချယ်ပြီး တင်ပေးပါ။ ပထမအဆင့်အနေဖြင့် အသံကို ဆွဲထုတ်ပါမည်။</p>
              <p><strong>၂။ စာသားစစ်ဆေးခြင်း (Source Text):</strong> ဆွဲထုတ်ထားသော အင်္ဂလိပ်စာသားများကို ပြင်ဆင်ရန် လိုအပ်ပါက ပြင်ဆင်နိုင်ပါသည်။ ပြီးလျှင် "Translate" ခလုတ်ကို နှိပ်ပါ။</p>
              <p><strong>၃။ မြန်မာစာသား နှင့် အသံရွေးချယ်ခြင်း (Translation & Voice):</strong> ဘာသာပြန်ထားသော မြန်မာစာသားများကို စစ်ဆေးပါ။ ထို့နောက် မိမိကြိုက်နှစ်သက်ရာ အသံ (Voice) ကို ရွေးချယ်ပြီး "အသံဖန်တီးမည်" ခလုတ်ကို နှိပ်ပါ။</p>
              <p><strong>၄။ ရလဒ်ရယူခြင်း (Results):</strong> အသံနှင့် စာတမ်းထိုး (Subtitles) များ ပါဝင်သော ဗီဒီယိုအသစ်ကို Download ရယူနိုင်ပါသည်။</p>
              
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-6">
                <h3 className="font-bold text-white mb-2 text-base text-purple-300">🔑 API Key ယူနည်းများ</h3>
                <div className="space-y-3">
                  <div>
                    <span className="font-bold text-white">AssemblyAI API Key (Free User များအတွက်):</span>
                    <br/>
                    <a href="https://www.assemblyai.com/dashboard/signup" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">AssemblyAI Website</a> တွင် အကောင့်လုပ်ပါ။ ထို့နောက် Dashboard မှ API Key ကို Copy ကူးပြီး ထည့်ပေးပါ။
                  </div>
                  <div>
                    <span className="font-bold text-white">Gemini API Key (Free User များအတွက်):</span>
                    <br/>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google AI Studio</a> တွင် အကောင့်ဝင်ပြီး "Create API Key" ကိုနှိပ်ကာ API Key အသစ် ရယူနိုင်ပါသည်။
                  </div>
                </div>
              </div>

              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 mt-4 text-purple-200">
                💡 <strong>မှတ်ချက်:</strong> Auto Mode ဖြင့် အသုံးပြုပါက အထက်ပါ အဆင့်များကို စနစ်မှ အလိုအလျောက် ဆောင်ရွက်ပေးသွားမည် ဖြစ်ပါသည်။
              </div>
            </div>
            <button onClick={() => setShowGuide(false)} className="w-full mt-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all">
              နားလည်ပါပြီ
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

const UserProfileDrawer = ({ isOpen, onClose, user, logout, packages = [], setShowGuide }) => {
  return (
    <div className={`fixed inset-0 z-[100] flex justify-end transition-all duration-300 ${isOpen ? 'visible' : 'invisible pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`relative w-full max-w-[360px] h-full bg-[#0f172a] border-l border-white/10 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full border-2 border-purple-500" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center font-bold text-lg text-white">
                {user.name.charAt(0)}
              </div>
            )}
            <div className="flex flex-col">
              <span className="font-bold text-white text-lg leading-tight">{user.name}</span>
              <span className="text-xs text-purple-400 font-bold uppercase">
                {user.role} {getLimitDisplay(user)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">

          {/* Guide Button */}
          <button 
            onClick={() => { onClose(); setShowGuide(true); }}
            className="w-full flex items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-white font-bold text-sm transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-purple-400" /> အသုံးပြုနည်း လမ်းညွှန်
          </button>

          {/* Credit Status */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <CreditCard className="w-5 h-5 text-purple-400" />
                <span className="font-bold">လက်ကျန် ဗီဒီယို</span>
              </div>
              <span className="text-sm font-mono text-white/70">
                {user?.role === 'free' ? `${getFreeLimitRemaining(user)} / 3 Free` : `${user?.videoLimit || 0} ဗီဒီယို ကျန်ရှိ`}
              </span>
            </div>
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                style={{ width: user?.role === 'free' ? `${(getFreeLimitRemaining(user) / 3) * 100}%` : '100%' }}
              />
            </div>
            <p className="text-[10px] text-gray-400">
              {user?.role === 'free'
                ? `You have ${getFreeLimitRemaining(user)} out of 3 free videos left.`
                : `You have ${user?.videoLimit || 0} credits remaining in your account.`}
            </p>
          </div>

          {/* Pricing Plans */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white mb-2">Upgrade Packages</h3>

            {packages.map((pkg, index) => (
              <div key={index} onClick={() => alert('Premium purchasing coming soon!')} className={`p-4 rounded-xl border transition cursor-pointer group relative overflow-hidden ${pkg.isPopular ? 'border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                {pkg.isPopular && (
                  <div className="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10">အရောင်းရဆုံး</div>
                )}
                {pkg.discount > 0 && (
                  <div className="absolute top-0 left-0 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-br-lg z-10 shadow-lg">{pkg.discount}% OFF</div>
                )}
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition">
                  <Sparkles className={`w-12 h-12 ${pkg.isPopular ? 'text-purple-400' : 'text-blue-400'}`} />
                </div>
                <h4 className={`font-bold text-lg mb-1 ${pkg.isPopular ? 'text-purple-400' : 'text-blue-400'} ${pkg.discount > 0 ? 'mt-3' : ''}`}>{pkg.title}</h4>
                <div className="flex flex-col mb-3">
                  {pkg.discount > 0 && (
                    <span className="text-gray-500 text-sm line-through decoration-red-500/70 decoration-2">{Math.round(pkg.mmk / (1 - pkg.discount / 100)).toLocaleString()} MMK</span>
                  )}
                  <div className="flex items-end gap-2">
                    <span className="text-2xl font-black text-white">{pkg.mmk.toLocaleString()} MMK</span>
                    <span className="text-sm text-gray-400 mb-1 ml-1">/ {pkg.bath} Bath</span>
                  </div>
                </div>
                <button className={`w-full py-2 rounded-lg text-sm font-bold transition ${pkg.isPopular ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-600' : 'bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-white'}`}>ဝယ်မည်</button>
              </div>
            ))}
            {packages.length === 0 && (
              <p className="text-gray-500 text-sm italic">No packages available.</p>
            )}
          </div>

        </div>

        {/* Footer / Logout */}
        <div className="p-4 border-t border-white/10 bg-black/20 shrink-0">
          <button
            onClick={logout}
            className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-bold flex items-center justify-center gap-2 transition"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
