import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Upload, FileText, ChevronDown, Settings2, Loader2 } from 'lucide-react';
import { Template } from '../types';

interface NewVisitProps {
  onStartProcessing: (audioBlob: Blob, patientName: string, patientGender: string, templateId: string, context: string) => void;
  templates: Template[];
  isProcessing: boolean;
  processingStep: string;
  onCancelProcessing: () => void;
}

const NewVisit: React.FC<NewVisitProps> = ({ onStartProcessing, templates, isProcessing, processingStep, onCancelProcessing }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [patientName, setPatientName] = useState('');
  const [patientGender, setPatientGender] = useState<string>(''); // No default
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templates[0]?.id || '');
  const [context, setContext] = useState('');
  
  // Audio Devices
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (templates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates]);

  useEffect(() => {
    getAudioDevices();
    return () => {
      cleanupAudio();
    };
  }, []);

  const getAudioDevices = async () => {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAudioDevices(audioInputs);
        if (audioInputs.length > 0) {
            setSelectedDeviceId(audioInputs[0].deviceId);
        }
    } catch (err) {
        console.error("Error fetching audio devices", err);
    }
  };

  const cleanupAudio = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startVisualizer = (stream: MediaStream) => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyserRef.current = analyser;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256; 

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2;
      let barHeight;
      let x = 0;
      
      const centerY = canvas.height / 2;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 2) * 1.5; 
        
        // Voice Memos style: Red bars, mirroring from center
        ctx.fillStyle = '#ef4444'; 
        
        // Draw bars mirroring from center vertical
        ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
        
        x += barWidth + 2;
      }
    };
    draw();
  };

  const startRecording = async () => {
    try {
      const constraints = { 
          audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true 
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      startVisualizer(stream);
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      timerIntervalRef.current = window.setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access is required to record audio.");
    }
  };

  const stopRecordingAndProcess = async () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    cleanupAudio();
    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      onStartProcessing(audioBlob, patientName, patientGender || 'Unknown', selectedTemplateId, context);
      setDuration(0);
      setPatientName('');
      setPatientGender('');
      setContext('');
    };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        onStartProcessing(file, patientName, patientGender || 'Unknown', selectedTemplateId, context);
        setDuration(0);
        setPatientName('');
        setPatientGender('');
        setContext('');
    }
  };

  // Processing State View
  if (isProcessing) {
      return (
          <div className="h-full flex flex-col items-center justify-center p-8 bg-white animate-in fade-in duration-300">
              <div className="max-w-md w-full text-center space-y-8">
                  <div className="relative w-24 h-24 mx-auto">
                      <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-brand-500 rounded-full border-t-transparent animate-spin"></div>
                      <Loader2 className="absolute inset-0 m-auto w-8 h-8 text-brand-600 animate-pulse" />
                  </div>
                  
                  <div className="space-y-2">
                      <h2 className="text-2xl font-bold text-slate-800">Creating Documentation</h2>
                      <p className="text-slate-500 text-lg">{processingStep}</p>
                  </div>

                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 text-left space-y-3">
                      <div className="flex items-center gap-3 text-sm text-slate-600">
                          <div className={`w-2 h-2 rounded-full ${processingStep.includes('Transcribing') || processingStep.includes('Init') ? 'bg-brand-500 animate-pulse' : 'bg-green-500'}`}></div>
                          <span>Transcribing Audio</span>
                      </div>
                      <div className="w-px h-4 bg-slate-200 ml-1"></div>
                      <div className="flex items-center gap-3 text-sm text-slate-600">
                          <div className={`w-2 h-2 rounded-full ${processingStep.includes('Generating') ? 'bg-brand-500 animate-pulse' : processingStep.includes('Init') || processingStep.includes('Transcribing') ? 'bg-slate-300' : 'bg-green-500'}`}></div>
                          <span>Generating Notes</span>
                      </div>
                       <div className="w-px h-4 bg-slate-200 ml-1"></div>
                      <div className="flex items-center gap-3 text-sm text-slate-600">
                          <div className={`w-2 h-2 rounded-full ${processingStep.includes('Extracting') ? 'bg-brand-500 animate-pulse' : 'bg-slate-300'}`}></div>
                          <span>Extracting Actions</span>
                      </div>
                  </div>

                  <button 
                    onClick={onCancelProcessing}
                    className="text-slate-400 hover:text-slate-600 text-sm font-medium"
                  >
                      Cancel Processing (Note: this stops generation)
                  </button>
              </div>
          </div>
      )
  }

  return (
    <div className="flex flex-col lg:flex-row h-full gap-8 bg-white p-4 lg:p-6 overflow-y-auto">
      <div className="flex-1 flex flex-col gap-6">
        <header className="flex justify-between items-center pb-4 border-b border-slate-100">
          <h1 className="text-2xl font-bold text-slate-800">New Visit</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Status:</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isRecording ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-slate-50 text-slate-600'}`}>
              {isRecording ? 'Recording Live' : 'Ready'}
            </span>
          </div>
        </header>

        {/* Configurations - Cleaner, lighter look */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
               <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient Details</label>
                  <input 
                    type="text" 
                    className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-400 focus:border-brand-400 outline-none transition-all placeholder:text-slate-300"
                    placeholder="Patient Name (Optional)"
                    value={patientName}
                    onChange={e => setPatientName(e.target.value)}
                  />
                  <div className="flex gap-2 pt-2">
                    {(['Male', 'Female', 'Other'] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => setPatientGender(g)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                          patientGender === g ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
               </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Documentation Template</label>
                    <div className="relative">
                    <select 
                        className="w-full p-3 bg-white border border-slate-200 rounded-lg appearance-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400 outline-none transition-all"
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                    >
                        {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>
            </div>
        </div>

        {/* Main Recording Interface - Minimalist */}
        <div className="flex-1 flex flex-col items-center justify-center relative min-h-[300px] border border-slate-100 rounded-2xl bg-slate-50/30">
            <>
              {isRecording && (
                <div className="w-full h-full absolute inset-0 pointer-events-none flex items-center justify-center bg-white/50 backdrop-blur-[2px]">
                    <canvas ref={canvasRef} width="600" height="200" className="w-full h-full object-cover"></canvas>
                </div>
              )}

              <div className="flex flex-col items-center gap-8 z-10">
                {!isRecording && (
                   <div className="text-slate-300">
                       <Mic className="w-12 h-12" />
                   </div>
                )}

                <div className={`text-6xl font-extralight font-mono tracking-wider transition-colors ${isRecording ? 'text-red-500 drop-shadow-sm' : 'text-slate-400'}`}>
                  {formatTime(duration)}
                </div>
                
                {!isRecording ? (
                  <div className="flex flex-col items-center gap-4">
                     {/* Mic Selector */}
                     {audioDevices.length > 0 && (
                        <div className="flex items-center gap-2 mb-2">
                             <Settings2 className="w-3 h-3 text-slate-400" />
                             <select 
                                value={selectedDeviceId}
                                onChange={(e) => setSelectedDeviceId(e.target.value)}
                                className="text-xs text-slate-500 bg-transparent border-none focus:ring-0 cursor-pointer max-w-[200px] truncate"
                             >
                                 {audioDevices.map(device => (
                                     <option key={device.deviceId} value={device.deviceId}>
                                         {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                     </option>
                                 ))}
                             </select>
                        </div>
                     )}

                    <button 
                        onClick={startRecording}
                        className="flex items-center gap-3 bg-brand-600 hover:bg-brand-700 text-white px-8 py-4 rounded-full font-medium text-lg shadow-xl shadow-brand-100 transition-all transform hover:scale-105 active:scale-95"
                    >
                        <Mic className="w-5 h-5" />
                        Start Session
                    </button>
                    
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="text-sm text-slate-400 hover:text-brand-600 flex items-center gap-2 transition-colors mt-2"
                    >
                        <Upload className="w-4 h-4" />
                        or upload an audio file
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef}
                        className="hidden" 
                        accept="audio/*,video/*"
                        onChange={handleFileUpload}
                    />
                  </div>
                ) : (
                  <div className="flex gap-4">
                    <button 
                      onClick={stopRecordingAndProcess}
                      className="flex items-center gap-3 bg-white border border-red-100 text-red-600 hover:bg-red-50 px-8 py-4 rounded-full font-medium text-lg shadow-sm transition-all transform hover:scale-105 active:scale-95"
                    >
                      <Square className="w-5 h-5 fill-current" />
                      End Session
                    </button>
                  </div>
                )}
              </div>
            </>
        </div>
      </div>

      {/* Right Context Panel - Simplified */}
      <div className="w-full lg:w-80 flex flex-col lg:border-l border-slate-100 lg:pl-8 pt-6 lg:pt-0 border-t lg:border-t-0">
         <div className="h-full flex flex-col">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                <FileText className="w-4 h-4 text-brand-400" />
                Clinical Context
            </h3>
            <p className="text-xs text-slate-400 mb-4">
                Input any specific instructions or history for this session.
            </p>
            <textarea 
                className="flex-1 w-full min-h-[150px] p-4 bg-slate-50/50 border border-slate-200 rounded-xl resize-none text-sm focus:outline-none focus:border-brand-400 focus:bg-white transition-all placeholder:text-slate-300 leading-relaxed"
                placeholder="E.g. Follow-up for hypertension, patient is non-compliant with meds..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
            />
         </div>
      </div>
    </div>
  );
};

export default NewVisit;