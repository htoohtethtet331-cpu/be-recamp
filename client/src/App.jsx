import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { CheckCircle2, Download, RefreshCw, Play, Loader2, AlertTriangle, SlidersHorizontal, ArrowRight, Video, Sparkles } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import coreURL from './assets/ffmpeg/ffmpeg-core.js?url';
import wasmURL from './assets/ffmpeg/ffmpeg-core.wasm?url';
const AILoadingState = ({ steps }) => {
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
    <div className="flex flex-col items-center justify-center space-y-6 py-10 bg-white/50 rounded-2xl border border-blue-100 backdrop-blur-sm mt-6 shadow-sm">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute h-full w-full animate-ping rounded-full bg-blue-200 opacity-40"></div>
        <div className="absolute h-14 w-14 animate-pulse rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 shadow-xl shadow-blue-500/30"></div>
        <Sparkles className="absolute h-7 w-7 animate-pulse text-white" />
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-blue-600 uppercase tracking-widest">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500"></span>
          </span>
          AI is thinking
        </div>
        <div className="h-6 font-mono text-sm text-gray-700 bg-blue-50 px-4 py-1.5 rounded-full shadow-inner border border-blue-100">
          {text}
          <span className="animate-pulse font-bold text-blue-500 ml-1">|</span>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoadingText, setFfmpegLoadingText] = useState('');
  const ffmpegRef = useRef(new FFmpeg());

  const loadFfmpeg = async () => {
    const ffmpeg = ffmpegRef.current;
    
    ffmpeg.on('log', ({ message }) => {
      console.log(message);
    });
    
    setFfmpegLoadingText('ပထမဆုံးအကြိမ် စတင်သုံးစွဲသူဖြစ်တဲ့အတွက် အင်ဂျင်ကို တပ်ဆင်နေပါတယ်... (Downloading Engine - ~30MB)');
    
    try {
      await ffmpeg.load({
        coreURL,
        wasmURL,
      });
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

  // Wizard States
  const [step, setStep] = useState(1);
  const [utterances, setUtterances] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('my-MM-NilarNeural');

  // Sync Player States
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [offset, setOffset] = useState(0); // Audio offset in seconds
  const [duration, setDuration] = useState(10); // Video duration
  const [currentTime, setCurrentTime] = useState(0); // Current playback time
  const [audioSpeed, setAudioSpeed] = useState(1); // Audio playback speed
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState('');

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

  useEffect(() => {
    if (isPlaying && videoRef.current && audioRef.current) {
      audioRef.current.currentTime = Math.max(0, videoRef.current.currentTime + offset);
    }
  }, [offset, isPlaying]);

  if (!ffmpegLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6 font-sans flex items-center justify-center">
        <div className="max-w-md w-full bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-xl border border-white/50 text-center space-y-6">
          <div className="relative flex h-24 w-24 mx-auto items-center justify-center">
            <div className="absolute h-full w-full animate-spin rounded-full border-4 border-blue-100 border-t-blue-600"></div>
            <Sparkles className="h-10 w-10 text-blue-600 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Recap Studio AI</h2>
          <p className="text-gray-600 font-medium leading-relaxed">
            {ffmpegLoadingText}
          </p>
          <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 w-full animate-pulse"></div>
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
    setDownloadUrl('');
    setError('');
    setIsPlaying(false);
    setOffset(0);
    setAudioSpeed(1);
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

  const handleTranslate = async () => {
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
      const response = await axios.post(`${apiUrl}/step2-translate`, { utterances });
      setUtterances(response.data.translatedUtterances);
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
      const response = await axios.post(`${apiUrl}/step3-tts`, { 
        translatedUtterances: utterances,
        voice: selectedVoice 
      });
      setDownloadUrl(response.data.url);
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


  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden border border-blue-100 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-blue-50 p-4 border-b border-blue-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg rotate-45 flex items-center justify-center">
              <div className="w-3 h-3 bg-white -rotate-45 rounded-sm"></div>
            </div>
            <div>
              <h1 className="font-bold text-gray-800 text-lg leading-tight">Recap Studio</h1>
              <p className="text-xs text-gray-500">Manual Editor Workflow</p>
            </div>
          </div>
          <div className="flex gap-1 text-xs font-bold text-blue-400">
            <span className={step >= 1 ? 'text-blue-600' : ''}>1. Upload</span>
            <span>›</span>
            <span className={step >= 2 ? 'text-blue-600' : ''}>2. English</span>
            <span>›</span>
            <span className={step >= 3 ? 'text-blue-600' : ''}>3. Myanmar</span>
            <span>›</span>
            <span className={step >= 4 ? 'text-blue-600' : ''}>4. Result</span>
          </div>
        </div>

        {/* Main Content (Scrollable) */}
        <div className="p-6 space-y-6 overflow-y-auto grow">

          {/* Step 1: Upload Section */}
          {step === 1 && (
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
              <h2 className="font-bold text-gray-800 mb-1">Step 1: Video တင်ပါ</h2>
              <p className="text-xs text-gray-500 mb-4">Recap လုပ်မည့် video ကို ရွေးချယ်ပါ။ (အသံကို အရင်ဆွဲထုတ်ပါမည်)</p>

              <div className="border-2 border-dashed border-green-300 bg-green-50 rounded-xl p-6 text-center cursor-pointer relative overflow-hidden transition hover:bg-green-100">
                <input
                  type="file"
                  accept="video/*,audio/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={loading}
                />
                {file ? (
                  <div className="flex flex-col items-center justify-center gap-2 text-green-700 font-medium z-10 relative pointer-events-none">
                    <CheckCircle2 className="w-8 h-8 text-green-600 mb-1" />
                    <span className="truncate max-w-xs text-sm">{file.name}</span>
                  </div>
                ) : (
                  <span className="text-gray-500 font-medium text-sm z-10 relative pointer-events-none">နှိပ်၍ File ရွေးချယ်ပါ</span>
                )}
              </div>

              {/* Video Preview right after selection to test browser compatibility */}
              {videoUrl && (
                <div className="mt-4 rounded-xl overflow-hidden border border-gray-200 bg-black">
                  <p className="bg-gray-100 text-xs text-center p-1 text-gray-500">Local Cache (Blob URL) Preview</p>
                  <video src={videoUrl} controls className="w-full h-48 object-contain" playsInline />
                </div>
              )}
            </div>
          )}

          {/* Step 2: English Transcript Review */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-bold text-gray-800">Step 2: English Text ကို စစ်ဆေးပါ</h2>
              <p className="text-xs text-gray-500">အောက်ပါ အင်္ဂလိပ်စာကြောင်းများကို လိုအပ်ပါက ပြင်ဆင်နိုင်ပါသည်။</p>

              <div className="space-y-3">
                {utterances.map((u, i) => (
                  <div key={i} className="flex gap-2 items-start bg-gray-50 p-2 rounded-lg border border-gray-200">
                    <span className="text-xs font-bold text-gray-400 mt-2 w-16 text-right">
                      {(u.start / 1000).toFixed(1)}s
                    </span>
                    <textarea
                      value={u.text}
                      onChange={(e) => handleTextEdit(i, 'text', e.target.value)}
                      className="flex-1 text-sm p-2 rounded border border-gray-300 focus:outline-none focus:border-blue-500 min-h-[60px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Burmese Transcript Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-bold text-gray-800">Step 3: မြန်မာဘာသာပြန်ကို စစ်ဆေးပါ</h2>
              <p className="text-xs text-gray-500">အောက်ပါ မြန်မာစာကြောင်းများကို လိုအပ်ပါက ပြင်ဆင်နိုင်ပါသည်။</p>

              <div className="space-y-3">
                {utterances.map((u, i) => (
                  <div key={i} className="flex flex-col gap-1 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-gray-400">{(u.start / 1000).toFixed(1)}s</span>
                      <span className="text-xs text-gray-500 italic truncate ml-2 max-w-[80%]">{u.text}</span>
                    </div>
                    <textarea
                      value={u.translatedText || ''}
                      onChange={(e) => handleTextEdit(i, 'translatedText', e.target.value)}
                      className="w-full text-sm p-2 rounded border border-blue-300 focus:outline-none focus:border-blue-500 bg-blue-50 min-h-[60px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Download Audio Only */}
          {step === 4 && downloadUrl && (
            <div className="space-y-4">
              <h2 className="font-bold text-gray-800">Step 4: အသံ (Audio) ရယူရန်</h2>
              <p className="text-sm text-gray-600">မြန်မာဘာသာပြန် အသံဖိုင်ကို အောက်တွင် နားထောင်နိုင်ပြီး Download ဆွဲနိုင်ပါသည်။</p>

              <div className="bg-gray-100 p-4 rounded-xl border border-gray-200 flex flex-col items-center gap-4">
                <audio controls src={downloadUrl} className="w-full" />

                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3 bg-green-600 text-white text-center rounded-xl font-bold text-sm hover:bg-green-700 transition shadow-md flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download Audio (အသံဖိုင် ရယူရန်)
                </a>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setStep(5)}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition shadow-md flex items-center justify-center gap-2"
                >
                  Next: ဗီဒီယိုနှင့် အသံ ချိန်ညှိရန် <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 5: CapCut Style Sync Player */}
          {step === 5 && downloadUrl && file && (
            <div className="space-y-4">
              <h2 className="font-bold text-gray-800">Step 5: ဗီဒီယိုနှင့် အသံ ချိန်ညှိရန်</h2>

              <div className="bg-black rounded-xl overflow-hidden relative group">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full max-h-[60vh] object-contain mx-auto"
                  muted // Original video MUST be muted
                  playsInline
                  controls={true}
                  onLoadedMetadata={(e) => setDuration(e.target.duration)}
                  onTimeUpdate={(e) => {
                    const vTime = e.target.currentTime;
                    setCurrentTime(vTime);
                    
                    if (isPlaying && audioRef.current) {
                      const targetAudioTime = (vTime - offset) * audioSpeed;
                      
                      if (targetAudioTime >= 0) {
                        if (audioRef.current.paused) audioRef.current.play();
                        // Sync correction if they drift too far
                        if (Math.abs(audioRef.current.currentTime - targetAudioTime) > 0.25) {
                          audioRef.current.currentTime = targetAudioTime;
                        }
                      } else {
                        // Pause audio if playhead hasn't reached the audio track yet
                        if (!audioRef.current.paused) audioRef.current.pause();
                      }
                    }
                  }}
                  onPlay={() => {
                    setIsPlaying(true);
                    if (audioRef.current) {
                      const targetAudioTime = (videoRef.current.currentTime - offset) * audioSpeed;
                      if (targetAudioTime >= 0) {
                        audioRef.current.currentTime = targetAudioTime;
                        audioRef.current.play();
                      }
                    }
                  }}
                  onPause={() => {
                    setIsPlaying(false);
                    if (audioRef.current) audioRef.current.pause();
                  }}
                  onSeeked={() => {
                    if (audioRef.current && videoRef.current) {
                      const targetAudioTime = (videoRef.current.currentTime - offset) * audioSpeed;
                      if (targetAudioTime >= 0) {
                        audioRef.current.currentTime = targetAudioTime;
                      }
                    }
                  }}
                />
                <audio ref={audioRef} src={downloadUrl} className="hidden" />
              </div>

              {/* CapCut Style Timeline Sync UI */}
              <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-2 select-none relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-gray-300 text-sm flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-blue-400" /> Timeline Sync
                  </h3>
                  <span className="text-xs font-mono text-gray-400 bg-gray-800 px-2 py-1 rounded">
                    Offset: {offset > 0 ? `+${offset.toFixed(1)}s` : `${offset.toFixed(1)}s`}
                  </span>
                </div>
                
                <div className="relative w-full h-24 bg-gray-800 rounded-lg overflow-hidden border border-gray-700 shadow-inner">
                  {/* Playhead */}
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-white z-20 transition-all duration-75 ease-linear pointer-events-none"
                    style={{ left: `${(currentTime / Math.max(duration, 0.1)) * 100}%` }}
                  >
                     <div className="w-3 h-3 bg-white rounded-full -ml-1.5 shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                  </div>

                  {/* Video Track */}
                  <div className="absolute top-2 left-0 right-0 h-8 bg-blue-900/60 border border-blue-500/50 rounded flex items-center px-2 pointer-events-none">
                    <Video className="w-3 h-3 text-blue-300 mr-2" />
                    <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">Video Track</span>
                  </div>

                  {/* Audio Track (Visually shifts based on offset) */}
                  <div 
                    className="absolute top-12 h-8 bg-teal-900/80 border border-teal-500/60 rounded flex items-center px-2 transition-transform duration-100 pointer-events-none"
                    style={{ 
                       width: '100%',
                       transform: `translateX(${(offset / Math.max(duration, 0.1)) * 100}%)`
                    }}
                  >
                    <span className="text-[10px] font-bold text-teal-300 uppercase tracking-wider z-10 shadow-sm bg-teal-900/50 px-1 rounded">Audio (Translated)</span>
                    <div className="absolute inset-0 flex items-center justify-evenly px-1 opacity-40">
                      {[...Array(40)].map((_, i) => (
                        <div key={i} className="w-1 bg-teal-400 rounded-full" style={{ height: `${20 + Math.abs(Math.sin(i * 0.8)) * 60}%` }}></div>
                      ))}
                    </div>
                  </div>

                  {/* Invisible Range Slider controlling Offset over the Audio Track area */}
                  <input
                    type="range"
                    min={-duration} 
                    max={duration} 
                    step="0.1"
                    value={offset}
                    onChange={(e) => setOffset(parseFloat(e.target.value))}
                    className="absolute top-10 bottom-0 left-0 w-full opacity-0 cursor-ew-resize z-30"
                    title="Drag left or right to sync audio track"
                  />
                </div>
                <p className="text-[10px] text-gray-500 text-center mt-2 font-medium">Drag the audio track left or right to sync with the video timeline.</p>
                
                {/* Audio Speed Control */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800">
                   <div className="text-xs text-gray-500">Video remains 1.0x speed</div>
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-bold text-gray-400">Audio Speed:</span>
                     <select 
                       value={audioSpeed} 
                       onChange={(e) => {
                         const speed = parseFloat(e.target.value);
                         setAudioSpeed(speed);
                         if (audioRef.current) {
                           audioRef.current.playbackRate = speed;
                           // Force resync when speed changes
                           if (videoRef.current) {
                              const targetTime = (videoRef.current.currentTime - offset) * speed;
                              if (targetTime >= 0) audioRef.current.currentTime = targetTime;
                           }
                         }
                       }}
                       className="bg-gray-800 text-gray-200 text-xs font-mono border border-gray-700 rounded px-2 py-1 outline-none focus:border-blue-500 cursor-pointer"
                     >
                        <option value="0.5">0.50x</option>
                        <option value="0.75">0.75x</option>
                        <option value="1">1.00x</option>
                        <option value="1.25">1.25x</option>
                        <option value="1.5">1.50x</option>
                        <option value="1.75">1.75x</option>
                        <option value="2">2.00x</option>
                     </select>
                   </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleMerge}
                  disabled={loading}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 transition flex items-center justify-center gap-2 shadow-md"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} 
                  Download Final Video
                </button>
                <button
                  onClick={resetFlow}
                  disabled={loading}
                  className="w-1/3 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-300 transition flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> အသစ်ပြန်လုပ်မည်
                </button>
              </div>
            </div>
          )}

          {/* Status / Error */}
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
              {error}
            </div>
          )}
          {loading && loadingSteps.length > 0 && (
            <AILoadingState steps={loadingSteps} />
          )}
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 shrink-0">
          {step === 1 && (
            <button
              onClick={handleExtract}
              disabled={loading || !file}
              className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${loading || !file ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-500 text-white shadow-lg shadow-blue-200 hover:bg-blue-600'
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
            <button
              onClick={handleTranslate}
              disabled={loading}
              className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${loading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-500 text-white shadow-lg shadow-blue-200 hover:bg-blue-600'
                }`}
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
              ) : (
                <>Step 2: ဘာသာပြန်မည် <Play className="w-5 h-5 fill-current" /></>
              )}
            </button>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {/* Voice Selection */}
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3">
                <p className="font-bold text-gray-700 text-sm">အသံရွေးချယ်ရန် (Voice Selection):</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="voice" 
                      value="my-MM-NilarNeural" 
                      checked={selectedVoice === 'my-MM-NilarNeural'}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-800">နီလာ (Nilar - Female)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="voice" 
                      value="my-MM-ThihaNeural" 
                      checked={selectedVoice === 'my-MM-ThihaNeural'}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-800">သီဟ (Thiha - Male)</span>
                  </label>
                </div>
              </div>

              <button
              onClick={handleTTS}
              disabled={loading}
              className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${loading ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-500 text-white shadow-lg shadow-green-200 hover:bg-green-600'
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

      </div>
    </div>
  );
}

export default App;
