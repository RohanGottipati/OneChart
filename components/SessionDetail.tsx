import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Save, CheckCircle2, Copy, Trash2, Pencil, Check, X, Plus, Mic, Loader2, FileText, CheckSquare, MessageSquare, BookOpen, StopCircle, Download, ChevronRight, ChevronLeft, ArrowRight } from 'lucide-react';
import { Session, Document, Template, Task } from '../types';
import OpalChat from './OpalChat';
import ReactMarkdown from 'react-markdown';
import { generateDocument, extractTasks, transcribeAudio } from '../services/geminiService';

interface SessionDetailProps {
  session: Session;
  onBack: () => void;
  onUpdateSession: (id: string, updates: Partial<Session>) => void;
  onDeleteSession: (id: string) => void;
  onResumeSession: (session: Session) => void;
  templates: Template[];
  practiceInfo: string;
}

const SessionDetail: React.FC<SessionDetailProps> = ({ session, onBack, onUpdateSession, onDeleteSession, templates, practiceInfo }) => {
  const [activeDocId, setActiveDocId] = useState<string>(session.documents.length > 0 ? session.documents[0].id : '');
  const [activeView, setActiveView] = useState<'doc' | 'transcript' | 'tasks' | 'context'>('doc');
  
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editedNoteContent, setEditedNoteContent] = useState('');
  
  // Renaming & Gender
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(session.patientName);
  const [newGender, setNewGender] = useState(session.patientGender);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const [showToast, setShowToast] = useState(false);
  const [isOpalOpen, setIsOpalOpen] = useState(true);

  // New Doc Creation
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  const [newDocType, setNewDocType] = useState('Referral Letter');
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);

  // Resume Session / Recording State
  const [isResuming, setIsResuming] = useState(false);
  const [isUpdatingResume, setIsUpdatingResume] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  React.useEffect(() => {
    const doc = session.documents.find(d => d.id === activeDocId);
    if (doc) setEditedNoteContent(doc.content);
  }, [activeDocId, session.documents]);

  // Clean up visualizer on unmount
  useEffect(() => {
      return () => {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          if (audioContextRef.current) {
              audioContextRef.current.close();
          }
      }
  }, []);

  const activeDoc = session.documents.find(d => d.id === activeDocId);

  // --- Resume Visualizer ---
  const startVisualizer = (stream: MediaStream) => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
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
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;
      const centerY = canvas.height / 2;
      ctx.fillStyle = '#ef4444'; // Red
      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 2) * 1.5; 
        ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
        x += barWidth + 2;
      }
    };
    draw();
  };

  const handleStartResume = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          startVisualizer(stream);
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (event) => {
             if (event.data.size > 0) audioChunksRef.current.push(event.data);
          };

          mediaRecorder.start();
          setIsResuming(true);
          setDuration(0);

          timerIntervalRef.current = window.setInterval(() => {
            setDuration(prev => prev + 1);
          }, 1000);

      } catch (e) {
          console.error("Failed to start recording", e);
          alert("Could not access microphone.");
      }
  };

  const handleStopResume = async () => {
      if (!mediaRecorderRef.current) return;
      mediaRecorderRef.current.stop();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

      setIsResuming(false);
      setIsUpdatingResume(true); 
      // Set status to processing so sidebar shows spinner
      onUpdateSession(session.id, { status: 'processing' });

      mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
               try {
                   const base64 = (reader.result as string).split(',')[1];
                   const newTranscriptChunk = await transcribeAudio(base64, audioBlob.type);
                   const fullTranscript = session.transcript + "\n\n[RESUMED SESSION]: " + newTranscriptChunk;
                   
                   const template = templates.find(t => t.id === session.templateId) || templates[0];
                   const patientInfo = `${session.patientName} (${session.patientGender})`;
                   
                   const newNoteContent = await generateDocument(
                       fullTranscript, 
                       session.context, 
                       template.systemPrompt, 
                       patientInfo,
                       practiceInfo
                   );

                   const rawTasks = await extractTasks(newNoteContent);
                   const newTasks: Task[] = rawTasks.map((t, i) => ({
                        id: `${Date.now()}-task-${i}`,
                        content: t.content,
                        tag: t.tag,
                        status: 'pending' as const,
                        sessionId: session.id
                   }));

                   onUpdateSession(session.id, {
                       transcript: fullTranscript,
                       documents: session.documents.map(d => 
                           d.id === activeDocId ? { ...d, content: newNoteContent } : d
                       ),
                       tasks: newTasks,
                       status: 'completed' // Restore status
                   });
                   
                   setEditedNoteContent(newNoteContent);
               } catch (error) {
                   console.error("Resume failed", error);
                   alert("Failed to update session. Restoring previous state.");
                   onUpdateSession(session.id, { status: 'completed' });
               } finally {
                   setIsUpdatingResume(false);
               }
          };
      };
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSaveNote = () => {
    const updatedDocs = session.documents.map(d => 
        d.id === activeDocId ? { ...d, content: editedNoteContent } : d
    );
    onUpdateSession(session.id, { documents: updatedDocs });
    setIsEditingNote(false);
  };

  const handleRename = () => {
    onUpdateSession(session.id, { patientName: newName, patientGender: newGender });
    setIsRenaming(false);
    
    if (newGender !== session.patientGender) {
        if (confirm("Gender updated. Regenerate note to reflect changes?")) {
            handleRegenerateNote(newName, newGender);
        }
    }
  };

  const handleRegenerateNote = async (pName: string, pGender: string) => {
      setIsRegenerating(true);
      try {
          const template = templates.find(t => t.id === session.templateId) || templates[0];
          const patientInfo = `${pName} (${pGender})`;
          const newNoteContent = await generateDocument(
              session.transcript, 
              session.context, 
              template.systemPrompt, 
              patientInfo,
              practiceInfo
          );
          
          const updatedDocs = session.documents.map(d => 
            d.id === activeDocId ? { ...d, content: newNoteContent } : d
          );
          onUpdateSession(session.id, { documents: updatedDocs });
          setEditedNoteContent(newNoteContent);
      } catch (e) {
          alert("Failed to regenerate note.");
      } finally {
          setIsRegenerating(false);
      }
  }

  const handleDelete = () => {
      if(window.confirm("Are you sure you want to delete this session? This action cannot be undone.")) {
          onDeleteSession(session.id);
          onBack();
      }
  }

  const copyToClipboard = () => {
    if (activeView === 'doc') {
        navigator.clipboard.writeText(editedNoteContent);
    } else {
        navigator.clipboard.writeText(session.transcript);
    }
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const downloadPDF = () => {
    window.print();
  };

  const handleCreateDocument = async () => {
      setIsGeneratingDoc(true);
      try {
        const patientInfo = `${session.patientName} (${session.patientGender})`;
        const content = await generateDocument(
            session.transcript, 
            session.context, 
            `Create a ${newDocType}.`, 
            patientInfo,
            practiceInfo
        );

        const newDoc: Document = {
            id: crypto.randomUUID(),
            title: newDocType,
            type: newDocType,
            content: content,
            createdAt: new Date()
        };

        onUpdateSession(session.id, { documents: [...session.documents, newDoc] });
        setActiveDocId(newDoc.id);
        setActiveView('doc');
        setIsCreatingDoc(false);
      } catch (e) {
          console.error(e);
          alert("Failed to generate document");
      } finally {
          setIsGeneratingDoc(false);
      }
  }

  const handleOpalAddToNote = (text: string) => {
     if (activeView !== 'doc') {
         alert("Please select a document tab to add text.");
         return;
     }
     const newContent = editedNoteContent + '\n\n' + text;
     setEditedNoteContent(newContent);
     setIsEditingNote(true);
  };

  const handleOpalCreateDocFromChat = (content: string) => {
      const type = "Generated Doc"; 
      const newDoc: Document = {
          id: crypto.randomUUID(),
          title: "New Document", 
          type: "Supplemental",
          content: content,
          createdAt: new Date()
      };
      onUpdateSession(session.id, { documents: [...session.documents, newDoc] });
      setActiveDocId(newDoc.id);
      setActiveView('doc');
  };

  const handleToggleTask = (taskId: string, currentStatus: 'pending' | 'completed') => {
      const newStatus = currentStatus === 'pending' ? 'completed' : 'pending';
      const updatedTasks = session.tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t);
      onUpdateSession(session.id, { tasks: updatedTasks });
  }

  const pendingTasksCount = session.tasks?.filter(t => t.status === 'pending').length || 0;

  return (
    <div className="flex flex-col lg:flex-row h-full gap-0 bg-white relative">
      {/* Toast */}
      {showToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 animate-fade-in-down">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <span className="font-medium">Copied to clipboard</span>
        </div>
      )}

      {/* Resume Session Overlay (Non-blocking) */}
      {isResuming && (
          <div className="fixed bottom-6 right-6 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300 overflow-hidden">
             <div className="bg-slate-900 p-4 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                     <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                     <span className="text-white font-medium text-sm">Resuming Session</span>
                 </div>
                 <span className="text-white font-mono text-lg">{formatTime(duration)}</span>
             </div>
             
             <div className="h-24 bg-slate-50 relative">
                 <canvas ref={canvasRef} width="384" height="96" className="w-full h-full object-cover"></canvas>
             </div>

             <div className="p-4 flex gap-3">
                 <button 
                   onClick={() => {
                       if(mediaRecorderRef.current) mediaRecorderRef.current.stop();
                       setIsResuming(false); 
                   }}
                   className="flex-1 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200"
                 >
                     Cancel
                 </button>
                 <button 
                    onClick={handleStopResume}
                    className="flex-[2] py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center justify-center gap-2"
                 >
                     <StopCircle className="w-4 h-4" /> Complete & Update
                 </button>
             </div>
          </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Header */}
        <header className="bg-white border-b border-slate-100 px-6 py-4 flex flex-col lg:flex-row items-start lg:items-center justify-between sticky top-0 z-10 gap-4">
          <div className="flex items-center gap-4 w-full lg:w-auto">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400 hover:text-slate-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 lg:flex-none">
              {isRenaming ? (
                  <div className="flex items-center gap-2 flex-wrap">
                      <input 
                        className="text-xl font-bold text-slate-800 border-b-2 border-brand-500 focus:outline-none bg-transparent"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Patient Name"
                        autoFocus
                      />
                       <input 
                        className="text-sm text-slate-600 border-b-2 border-slate-200 focus:border-brand-500 focus:outline-none bg-transparent w-24"
                        value={newGender}
                        onChange={(e) => setNewGender(e.target.value)}
                        placeholder="Gender"
                      />
                      <button onClick={handleRename} className="p-1 hover:bg-green-50 text-green-600 rounded"><Check className="w-4 h-4"/></button>
                      <button onClick={() => setIsRenaming(false)} className="p-1 hover:bg-red-50 text-red-600 rounded"><X className="w-4 h-4"/></button>
                  </div>
              ) : (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setIsRenaming(true); setNewName(session.patientName); setNewGender(session.patientGender); }}>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            {session.patientName}
                            <Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            {isRegenerating && <Loader2 className="w-4 h-4 animate-spin text-brand-500" />}
                        </h1>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                             <span>{session.patientGender}</span>
                             <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                             <span>{session.date.toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto">
             <button 
                onClick={handleStartResume}
                disabled={isUpdatingResume}
                className="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-2 rounded-lg hover:bg-red-100 text-xs font-medium transition-colors disabled:opacity-50"
            >
                <Mic className="w-3 h-3" /> Resume
            </button>

            {activeView === 'doc' && (
                isEditingNote ? (
                <button 
                    onClick={handleSaveNote}
                    className="flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-lg hover:bg-slate-800 text-xs font-medium transition-colors shadow-sm"
                >
                    <Save className="w-3 h-3" /> Save
                </button>
                ) : (
                <button 
                    onClick={() => setIsEditingNote(true)}
                    className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 text-xs font-medium transition-colors"
                >
                    Edit
                </button>
                )
            )}
            
            <button 
                onClick={copyToClipboard}
                className="flex items-center gap-2 bg-brand-50 text-brand-700 border border-brand-200 px-3 py-2 rounded-lg hover:bg-brand-100 text-xs font-bold transition-colors"
            >
                <Copy className="w-3 h-3" /> Copy
            </button>

            <button 
                onClick={downloadPDF}
                className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50 text-xs font-medium transition-colors"
                title="Print / Save as PDF"
            >
                <Download className="w-3 h-3" /> PDF
            </button>
            
            <button 
                onClick={() => setIsOpalOpen(!isOpalOpen)}
                className={`p-2 rounded-lg transition-colors hidden lg:block ${isOpalOpen ? 'bg-brand-100 text-brand-600' : 'text-slate-400 hover:bg-slate-50'}`}
                title="Toggle Opal Assistant"
            >
                {isOpalOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1"></div>

             <button 
                onClick={handleDelete}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
                <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Status Bar if updating */}
        {isUpdatingResume && (
            <div className="bg-blue-50 px-6 py-2 text-xs font-medium text-blue-700 flex items-center justify-center gap-2 animate-in slide-in-from-top-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Updating note with resumed session content...
            </div>
        )}

        {/* Color-Coded Tabs Row */}
        <div className="px-6 pt-6 flex items-center gap-2 bg-white sticky top-[73px] z-10 overflow-x-auto border-b border-slate-100 pb-0">
          
          {/* Document Tabs (Blue Theme) */}
          {session.documents.map(doc => (
              <button
                key={doc.id}
                onClick={() => { setActiveView('doc'); setActiveDocId(doc.id); setIsEditingNote(false); }}
                className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
                    activeView === 'doc' && activeDocId === doc.id 
                    ? 'border-blue-600 text-blue-700' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-t-lg'
                }`}
              >
                  <FileText className={`w-4 h-4 ${activeView === 'doc' && activeDocId === doc.id ? 'text-blue-600' : 'text-slate-400'}`} />
                  {doc.title}
              </button>
          ))}

          {/* Add Doc - Improved UI: Center Modal */}
          <div className="relative pb-2">
             <button 
                onClick={() => setIsCreatingDoc(true)}
                className="p-1.5 text-slate-400 hover:text-brand-600 transition-colors rounded-lg hover:bg-slate-50"
                title="Add new document type"
              >
                  <Plus className="w-5 h-5" />
              </button>
          </div>

          <div className="w-px h-6 bg-slate-200 mx-2 mb-2"></div>

          {/* Actions Tab (Purple Theme) */}
          <button
             onClick={() => setActiveView('tasks')}
             className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                 activeView === 'tasks' 
                 ? 'border-purple-500 text-purple-700' 
                 : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-t-lg'
             }`}
           >
              <CheckSquare className={`w-4 h-4 ${activeView === 'tasks' ? 'text-purple-600' : 'text-slate-400'}`} />
              Actions
              {pendingTasksCount > 0 && (
                  <span className="ml-1 bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full text-[10px]">{pendingTasksCount}</span>
              )}
           </button>

           {/* Transcript Tab (Orange Theme) */}
           <button
             onClick={() => setActiveView('transcript')}
             className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                 activeView === 'transcript' 
                 ? 'border-orange-500 text-orange-700' 
                 : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-t-lg'
             }`}
           >
              <MessageSquare className={`w-4 h-4 ${activeView === 'transcript' ? 'text-orange-600' : 'text-slate-400'}`} />
              Transcript
           </button>

           {/* Context Tab (Teal Theme) */}
           <button
             onClick={() => setActiveView('context')}
             className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                 activeView === 'context' 
                 ? 'border-teal-500 text-teal-700' 
                 : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-t-lg'
             }`}
           >
              <BookOpen className={`w-4 h-4 ${activeView === 'context' ? 'text-teal-600' : 'text-slate-400'}`} />
              Context
           </button>
        </div>

        {/* Content Area - Clean White BG */}
        <div className="flex-1 overflow-y-auto bg-white p-6 lg:p-10 scroll-smooth">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Note/Doc View */}
            {activeView === 'doc' && activeDoc && (
                <div className="bg-white rounded-xl min-h-[600px] relative animate-in fade-in duration-300 print:shadow-none">
                    {activeDoc.type !== 'Note' && (
                        <div className="mb-6 pb-2 border-b border-slate-50 print:hidden">
                             <h2 className="text-2xl font-bold text-slate-800">{activeDoc.title}</h2>
                        </div>
                    )}

                    {isEditingNote ? (
                        <textarea 
                        className="w-full h-[600px] p-4 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-100 focus:border-brand-300 resize-none font-mono text-sm text-slate-800 leading-relaxed"
                        value={editedNoteContent}
                        onChange={(e) => setEditedNoteContent(e.target.value)}
                        autoFocus
                        />
                    ) : (
                        <article className="prose prose-sm prose-slate max-w-none prose-headings:text-slate-900 prose-headings:font-bold prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900 print:prose-headings:text-black print:prose-p:text-black">
                        <ReactMarkdown>{editedNoteContent}</ReactMarkdown>
                        </article>
                    )}
                </div>
            )}

            {/* Actions View */}
            {activeView === 'tasks' && (
                 <div className="bg-white rounded-xl min-h-[400px] animate-in fade-in duration-300">
                     <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                         <div className="p-2 bg-purple-50 rounded-lg">
                             <CheckSquare className="w-6 h-6 text-purple-600" />
                         </div>
                         <h3 className="text-xl font-bold text-slate-800">Physician Action Items</h3>
                     </div>
                     
                    {session.tasks && session.tasks.length > 0 ? (
                        <div className="grid gap-3">
                            {session.tasks.map((task) => (
                                <div key={task.id} className={`flex items-start gap-3 p-5 rounded-xl border transition-all hover:shadow-sm ${task.status === 'completed' ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200'}`}>
                                    <button onClick={() => handleToggleTask(task.id, task.status)}>
                                        <CheckCircle2 className={`w-5 h-5 mt-0.5 flex-shrink-0 cursor-pointer hover:scale-110 transition-transform ${task.status === 'completed' ? 'text-green-500' : 'text-slate-300 hover:text-green-500'}`} />
                                    </button>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{task.content}</p>
                                        </div>
                                        <div className="mt-2">
                                            <span className={`inline-block text-[10px] px-2 py-1 rounded-md font-semibold tracking-wide
                                                ${task.tag.toLowerCase().includes('presc') ? 'bg-green-100 text-green-700' : 
                                                  task.tag.toLowerCase().includes('ref') ? 'bg-amber-100 text-amber-700' : 
                                                  task.tag.toLowerCase().includes('lab') ? 'bg-indigo-100 text-indigo-700' : 
                                                  task.tag.toLowerCase().includes('follow') ? 'bg-blue-100 text-blue-700' :
                                                  'bg-slate-100 text-slate-600'}
                                            `}>
                                                {task.tag}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                            <p className="italic">No pending actions detected for this session.</p>
                        </div>
                    )}
                 </div>
            )}

            {/* Transcript View */}
            {activeView === 'transcript' && (
                 <div className="bg-white rounded-xl min-h-[500px] animate-in fade-in duration-300">
                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                        <MessageSquare className="w-5 h-5 text-orange-500" />
                        <h3 className="text-lg font-bold text-slate-800">Verbatim Transcript</h3>
                    </div>
                    <div className="text-slate-600 leading-8 whitespace-pre-wrap font-serif text-lg p-4 bg-slate-50/50 rounded-xl border border-slate-100">
                        {session.transcript}
                    </div>
                 </div>
            )}

            {/* Context View */}
            {activeView === 'context' && (
                 <div className="bg-white rounded-xl min-h-[400px] animate-in fade-in duration-300">
                     <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
                         <BookOpen className="w-5 h-5 text-teal-500" />
                         <h3 className="text-lg font-bold text-slate-800">Patient Context</h3>
                     </div>
                     <div className="bg-teal-50/30 p-8 rounded-xl border border-teal-100 text-slate-800">
                         {session.context ? (
                            <p className="whitespace-pre-wrap leading-relaxed">{session.context}</p>
                         ) : (
                            <p className="italic opacity-50 text-slate-400">No additional context was provided for this session.</p>
                         )}
                     </div>
                 </div>
            )}

          </div>
        </div>
      </div>

      {/* Right Panel (Opal) - Collapsible */}
      {isOpalOpen && (
        <div className="hidden lg:flex w-[400px] border-l border-slate-200 bg-white h-full flex-col p-4 z-20 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.02)] animate-in slide-in-from-right duration-300">
          <OpalChat 
            transcript={session.transcript} 
            currentNote={editedNoteContent} 
            onUpdateNote={handleOpalAddToNote}
            onCreateDocument={handleOpalCreateDocFromChat}
          />
        </div>
      )}

      {/* Add Document Modal */}
      {isCreatingDoc && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
             <div className="bg-white w-96 rounded-2xl shadow-2xl p-6 animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-slate-800">Add New Document</h3>
                      <button onClick={() => setIsCreatingDoc(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                  </div>
                  <p className="text-sm text-slate-500 mb-4">Select a document type to generate based on the current session context.</p>
                  
                  <div className="space-y-3 mb-6">
                      <input 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                        placeholder="e.g. Referral to Dermatology"
                        value={newDocType}
                        onChange={(e) => setNewDocType(e.target.value)}
                        autoFocus
                      />
                      <div className="flex flex-wrap gap-2">
                          {['Referral Letter', 'Patient Instructions', 'Work Note', 'Prescription List'].map(t => (
                              <button 
                                key={t} 
                                onClick={() => setNewDocType(t)} 
                                className="text-xs bg-white border border-slate-200 hover:border-brand-300 hover:text-brand-600 px-3 py-1.5 rounded-full transition-colors text-slate-600"
                              >
                                  {t}
                              </button>
                          ))}
                      </div>
                  </div>

                  <button 
                    onClick={handleCreateDocument}
                    disabled={isGeneratingDoc || !newDocType.trim()}
                    className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                      {isGeneratingDoc ? (
                          <>
                             <Loader2 className="w-5 h-5 animate-spin" /> Generating...
                          </>
                      ) : (
                          <>
                             Generate Document <ArrowRight className="w-4 h-4" />
                          </>
                      )}
                  </button>
             </div>
         </div>
      )}
    </div>
  );
};

export default SessionDetail;