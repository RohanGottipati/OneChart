import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import SessionListSidebar from './components/SessionListSidebar';
import NewVisit from './components/NewVisit';
import TasksView from './components/TasksView';
import SessionDetail from './components/SessionDetail';
import { ViewState, Session, Template, Task, Profile } from './types';
import { Plus, Trash2, Menu } from 'lucide-react';
import { transcribeAudio, generateDocument, extractTasks, generateSessionTitle } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import { Session as SupabaseSession } from '@supabase/supabase-js';
import Auth from './components/Auth';
import {
  fetchSessionsForUser,
  createSessionWithPatient,
  updatePatient,
  updateSessionRecord,
  upsertSessionTranscript,
  upsertSessionContext,
  upsertSessionNotes,
  deleteSessionById,
  fetchProfile,
  upsertProfile,
} from './services/sessionService';

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 't1',
    name: 'SOAP Note',
    description: 'Standard Subjective, Objective, Assessment, Plan format.',
    systemPrompt: 'Create a standard SOAP note. Structure: Subjective, Objective, Assessment, Plan.'
  },
  {
    id: 't2',
    name: 'Progress Note',
    description: 'For daily rounds or follow-up visits.',
    systemPrompt: 'Create a hospital Progress Note. Structure: Interval History, Exam, Labs/Imaging, Assessment/Plan.'
  },
  {
    id: 't3',
    name: 'Discharge Summary',
    description: 'Summary of hospital stay and discharge instructions.',
    systemPrompt: 'Create a Discharge Summary. Structure: Admission Diagnosis, Discharge Diagnosis, Hospital Course, Discharge Medications, Follow-up.'
  },
  {
    id: 't4',
    name: 'Psychiatric Evaluation',
    description: 'Mental status exam and history.',
    systemPrompt: 'Create a Psychiatric Evaluation. Structure: History of Present Illness, Past Psych History, Mental Status Exam, Risk Assessment, Plan.'
  }
];


const App: React.FC = () => {
  const [session, setSession] = useState<SupabaseSession | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadSessions = async () => {
      if (!session?.user?.id) return;
      try {
        const data = await fetchSessionsForUser(session.user.id);
        setSessions(data);
      } catch (error) {
        console.error('Failed to load sessions', error);
      }
    };

    loadSessions();
  }, [session?.user?.id]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!session?.user?.id) return;
      setProfileLoading(true);
      setProfileError(null);
      try {
        const data = await fetchProfile(session.user.id, session.user.email || '');
        setProfile(data);
      } catch (error: any) {
        console.error('Failed to load profile', error);
        setProfileError(error?.message || 'Failed to load profile');
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [session?.user?.id, session?.user?.email]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSessions([]);
    setProfile(null);
  };

  const [currentView, setCurrentView] = useState<ViewState>('new-visit');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Settings
  const [autoDeleteDays, setAutoDeleteDays] = useState(30);
  const [practiceInfo, setPracticeInfo] = useState('City Cardiology Clinic\n123 Main St, Springfield');

  // Template State
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState<Partial<Template>>({});

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  if (!session) {
    return <Auth />;
  }

  const handleProcessSession = async (audioBlob: Blob, patientName: string, patientGender: string, templateId: string, context: string) => {
    setIsProcessing(true);
    setProcessingStep('Initializing...');

    // 1. Create Placeholder Session
    const template = templates.find(t => t.id === templateId) || templates[0];

    const displayPatientName = patientName || 'Processing Session...';
    const displayGender = patientGender || 'Unknown';

    let createdSessionId = '';
    let createdPatientId = '';

    try {
      if (!session?.user?.id) throw new Error('Missing authenticated user');
      const { session: createdSession, patient } = await createSessionWithPatient({
        userId: session.user.id,
        patientName: displayPatientName,
        patientGender: displayGender,
        templateId: template.id,
        templateName: template.name,
        title: displayPatientName,
        status: 'processing',
      });

      createdSessionId = createdSession.id;
      createdPatientId = patient.id;

      const newSession: Session = {
        id: createdSession.id,
        patientId: patient.id,
        userId: session.user.id,
        patientName: displayPatientName,
        patientGender: displayGender,
        date: new Date(createdSession.created_at),
        templateId: template.id,
        templateName: template.name,
        transcript: 'Processing audio...',
        documents: [],
        context,
        status: 'processing',
        tasks: [],
        addendums: [],
      };

      setSessions(prev => [newSession, ...prev]);
    } catch (error) {
      console.error('Failed to create session', error);
      setIsProcessing(false);
      setProcessingStep('');
      return;
    }

    try {
      setProcessingStep('Uploading & Transcribing...');
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        const transcript = await transcribeAudio(base64String, audioBlob.type || 'audio/webm');

        let finalPatientName = patientName;
        if (!finalPatientName.trim()) {
          setProcessingStep('Generating session name...');
          finalPatientName = await generateSessionTitle(transcript);
        }

        setProcessingStep('Generating clinical notes...');
        const patientInfoString = `${finalPatientName} (${patientGender || 'Unknown'})`;
        const noteContent = await generateDocument(transcript, context, template.systemPrompt, patientInfoString, practiceInfo);

        setProcessingStep('Extracting actions...');
        const rawTasks = await extractTasks(noteContent);

        const tasks: Task[] = rawTasks.map((t, i) => ({
          id: `${createdSessionId}-task-${i}`,
          content: t.content,
          tag: t.tag,
          status: 'pending',
          sessionId: createdSessionId
        }));

        try {
          await updateSessionRecord(createdSessionId, {
            title: finalPatientName,
            status: 'completed',
          });
          if (createdPatientId) {
            await updatePatient(createdPatientId, {
              full_name: finalPatientName,
              gender: patientGender || 'Unknown',
            });
          }
          await upsertSessionTranscript(createdSessionId, transcript);
          await upsertSessionContext(createdSessionId, context);
          await upsertSessionNotes(createdSessionId, [{
            id: crypto.randomUUID(),
            title: template.name,
            type: template.name,
            content: noteContent,
            createdAt: new Date(),
          }]);
        } catch (error) {
          console.error('Failed to persist session data', error);
        }

        setSessions(prev => prev.map(s => {
          if (s.id === createdSessionId) {
            return {
              ...s,
              patientName: finalPatientName,
              transcript,
              documents: [{
                id: crypto.randomUUID(),
                title: template.name,
                type: template.name,
                content: noteContent,
                createdAt: new Date()
              }],
              status: 'completed',
              tasks
            };
          }
          return s;
        }));

        setIsProcessing(false);
        setProcessingStep('');
      };
    } catch (e) {
      console.error("Processing failed", e);
      setProcessingStep('Error occurred.');
      setIsProcessing(false);
      // Mark session as draft/error so it doesn't spin forever in sidebar
      setSessions(prev => prev.map(s => s.id === createdSessionId ? { ...s, status: 'draft', transcript: "Processing failed. Please check your network and try again." } : s));
    }
  };

  const handleUpdateSession = async (id: string, updates: Partial<Session>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    if (selectedSession && selectedSession.id === id) {
      setSelectedSession(prev => prev ? { ...prev, ...updates } : null);
    }

    try {
      const payload: Record<string, any> = {};
      if (typeof updates.patientName !== 'undefined') payload.patient_name = updates.patientName;
      if (typeof updates.patientGender !== 'undefined') payload.patient_gender = updates.patientGender;
      if (typeof updates.status !== 'undefined') payload.status = updates.status;
      if (Object.keys(payload).length) {
        await updateSessionRecord(id, payload);
      }

      if (updates.patientName || updates.patientGender) {
        const sessionToUpdate = sessions.find(s => s.id === id);
        if (sessionToUpdate?.patientId) {
          await updatePatient(sessionToUpdate.patientId, {
            full_name: updates.patientName,
            gender: updates.patientGender,
          });
        }
      }

      if (typeof updates.transcript !== 'undefined') {
        await upsertSessionTranscript(id, updates.transcript || '');
      }

      if (typeof updates.context !== 'undefined') {
        await upsertSessionContext(id, updates.context || '');
      }

      if (typeof updates.documents !== 'undefined') {
        await upsertSessionNotes(id, updates.documents || []);
      }
    } catch (error) {
      console.error('Failed to update session', error);
    }
  };

  const handleDeleteSession = async (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (selectedSession?.id === id) setSelectedSession(null);
    try {
      await deleteSessionById(id);
    } catch (error) {
      console.error('Failed to delete session', error);
    }
  };

  const handleAddTemplate = () => {
    if (!newTemplate.name || !newTemplate.systemPrompt) return;
    const template: Template = {
      id: Date.now().toString(),
      name: newTemplate.name,
      description: newTemplate.description || '',
      systemPrompt: newTemplate.systemPrompt
    };
    setTemplates(prev => [...prev, template]);
    setIsCreatingTemplate(false);
    setNewTemplate({});
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const handleProfileChange = (field: keyof Profile, value: string) => {
    setProfile(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      await upsertProfile(profile);
    } catch (error: any) {
      console.error('Failed to save profile', error);
      setProfileError(error?.message || 'Failed to save profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleTaskStatusUpdate = (sessionId: string, taskId: string, status: 'completed' | 'pending') => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const updatedTasks = session.tasks.map(t => t.id === taskId ? { ...t, status } : t);
    handleUpdateSession(sessionId, { tasks: updatedTasks });
  };

  const handleDeleteTask = (sessionId: string, taskId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const updatedTasks = session.tasks.filter(t => t.id !== taskId);
    handleUpdateSession(sessionId, { tasks: updatedTasks });
  };

  const handleResumeSession = (session: Session) => {
    // Logic handled in SessionDetail now
  };

  const renderContent = () => {
    if (selectedSession) {
      return (
        <SessionDetail
          session={selectedSession}
          onBack={() => setSelectedSession(null)}
          onUpdateSession={handleUpdateSession}
          onDeleteSession={handleDeleteSession}
          onResumeSession={handleResumeSession}
          templates={templates}
          practiceInfo={practiceInfo}
        />
      );
    }

    switch (currentView) {
      case 'new-visit':
        return (
          <div className="h-full bg-white">
            <NewVisit
              onStartProcessing={handleProcessSession}
              templates={templates}
              isProcessing={isProcessing}
              processingStep={processingStep}
              onCancelProcessing={() => {
                setIsProcessing(false);
                setProcessingStep('');
              }}
            />
          </div>
        );
      case 'tasks':
        return (
          <TasksView
            sessions={sessions}
            onUpdateTaskStatus={handleTaskStatusUpdate}
            onDeleteTask={handleDeleteTask}
            onNavigateToSession={(s) => {
              setSelectedSession(s);
              setCurrentView('session-detail');
            }}
          />
        );
      case 'settings':
        return (
          <div className="p-8 overflow-y-auto h-full bg-white">
            <h1 className="text-2xl font-bold text-slate-800 mb-8">Settings</h1>

            <div className="grid gap-8 max-w-4xl">
              {/* Account Info */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-800">Account Information</h2>
                  <button
                    onClick={handleSaveProfile}
                    disabled={profileLoading || !profile}
                    className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                  >
                    {profileLoading ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>

                {profileError && (
                  <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                    {profileError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-500">Full Name</label>
                    <input
                      className="mt-1 w-full p-2 border border-slate-200 rounded-lg text-sm"
                      value={profile?.fullName || ''}
                      onChange={(e) => handleProfileChange('fullName', e.target.value)}
                      placeholder="Dr. Jane Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-500">Email</label>
                    <input
                      className="mt-1 w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50"
                      value={profile?.email || session?.user?.email || ''}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-500">Practice</label>
                    <input
                      className="mt-1 w-full p-2 border border-slate-200 rounded-lg text-sm"
                      value={profile?.practice || ''}
                      onChange={(e) => handleProfileChange('practice', e.target.value)}
                      placeholder="Cardiology"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-500">Speciality</label>
                    <input
                      className="mt-1 w-full p-2 border border-slate-200 rounded-lg text-sm"
                      value={profile?.speciality || ''}
                      onChange={(e) => handleProfileChange('speciality', e.target.value)}
                      placeholder="Interventional Cardiology"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-500">Phone Number</label>
                    <input
                      className="mt-1 w-full p-2 border border-slate-200 rounded-lg text-sm"
                      value={profile?.phoneNumber || ''}
                      onChange={(e) => handleProfileChange('phoneNumber', e.target.value)}
                      placeholder="(555) 555-1234"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-500">Practice Name</label>
                    <input
                      className="mt-1 w-full p-2 border border-slate-200 rounded-lg text-sm"
                      value={profile?.practiceName || ''}
                      onChange={(e) => handleProfileChange('practiceName', e.target.value)}
                      placeholder="OneChart Medical"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-500 mb-1">Practice Information / Location</label>
                    <textarea
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50"
                      value={practiceInfo}
                      onChange={(e) => setPracticeInfo(e.target.value)}
                      rows={2}
                      placeholder="Clinic Name, Address, Phone..."
                    />
                    <p className="text-xs text-slate-400 mt-1">This information will be used to prefill generated documents.</p>
                  </div>
                </div>
              </div>

              {/* Data Retention */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Data Retention & Privacy</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block font-medium text-slate-900">Auto-delete Notes</label>
                      <p className="text-sm text-slate-500">Automatically delete patient notes after a set period.</p>
                    </div>
                    <select
                      value={autoDeleteDays}
                      onChange={(e) => setAutoDeleteDays(Number(e.target.value))}
                      className="p-2 border border-slate-200 rounded-lg text-sm bg-slate-50"
                    >
                      <option value={7}>After 7 days</option>
                      <option value={30}>After 30 days</option>
                      <option value={90}>After 90 days</option>
                      <option value={365}>After 1 year</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Template Manager */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">Note Templates</h2>
                    <p className="text-sm text-slate-500">Manage custom templates for your scribes.</p>
                  </div>
                  <button
                    onClick={() => setIsCreatingTemplate(true)}
                    className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Create Template
                  </button>
                </div>

                {/* Create Template Form */}
                {isCreatingTemplate && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 mb-6 animate-fade-in">
                    <h3 className="font-semibold text-slate-800 mb-4">New Template</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Template Name</label>
                        <input
                          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                          placeholder="e.g. Pediatric Checkup"
                          value={newTemplate.name || ''}
                          onChange={e => setNewTemplate({ ...newTemplate, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                        <input
                          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                          placeholder="Short description for the dropdown"
                          value={newTemplate.description || ''}
                          onChange={e => setNewTemplate({ ...newTemplate, description: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">System Prompt / Instructions</label>
                        <textarea
                          className="w-full p-2 border border-slate-200 rounded-lg text-sm h-32"
                          placeholder={`# Structure\n- Heading 1\n- Heading 2`}
                          value={newTemplate.systemPrompt || ''}
                          onChange={e => setNewTemplate({ ...newTemplate, systemPrompt: e.target.value })}
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => setIsCreatingTemplate(false)}
                          className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddTemplate}
                          disabled={!newTemplate.name || !newTemplate.systemPrompt}
                          className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                        >
                          Save Template
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* List */}
                <div className="space-y-3">
                  {templates.map(template => (
                    <div key={template.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                      <div>
                        <h4 className="font-medium text-slate-800">{template.name}</h4>
                        <p className="text-sm text-slate-500">{template.description}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                        title="Delete Template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 'voice-suite':
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <p className="text-lg font-medium">Voice Agent Suite</p>
            <p className="text-sm">Coming Soon</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-white font-sans text-slate-900">
      <Sidebar
        currentView={selectedSession ? 'session-detail' : currentView}
        onChangeView={(view) => {
          setCurrentView(view);
          setSelectedSession(null);
        }}
        onToggleHistory={() => setIsHistoryOpen(!isHistoryOpen)}
        isHistoryOpen={isHistoryOpen}
        isOpenMobile={isOpenMobile}
        onCloseMobile={() => setIsOpenMobile(false)}
        userEmail={session?.user?.email}
        onSignOut={handleSignOut}
      />

      {/* Collapsible Session List Sidebar */}
      {isHistoryOpen && (
        <SessionListSidebar
          sessions={sessions}
          onSelectSession={(s) => {
            setSelectedSession(s);
            setCurrentView('session-detail');
            if (window.innerWidth < 768) setIsHistoryOpen(false);
          }}
          selectedSessionId={selectedSession?.id}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        {/* Mobile Header Toggle */}
        <div className="md:hidden p-4 border-b border-slate-100 flex items-center gap-3">
          <button onClick={() => setIsOpenMobile(true)}>
            <Menu className="w-6 h-6 text-slate-700" />
          </button>
          <span className="font-bold text-lg"><span className="text-brand-600">One</span>Chart</span>
        </div>
        <main className="flex-1 overflow-hidden relative">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;