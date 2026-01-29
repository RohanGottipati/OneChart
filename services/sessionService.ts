import { supabase } from './supabaseClient';
import { Session, Document, Profile } from '../types';

const toIsoString = (value?: Date | string) => {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const mapSessionRow = (row: any): Session => {
  const notes = Array.isArray(row.session_notes) ? row.session_notes : [];
  const transcripts = Array.isArray(row.session_transcripts) ? row.session_transcripts : [];
  const contexts = Array.isArray(row.session_context) ? row.session_context : [];

  return {
    id: row.id,
    patientId: row.patient_id ?? undefined,
    userId: row.user_id ?? undefined,
    patientName: row.patient_name || row.patients?.full_name || 'Unknown',
    patientGender: row.patient_gender || row.patients?.gender || 'Unknown',
    date: new Date(row.created_at),
    templateId: row.template_id || '',
    templateName: row.template_name || 'Untitled',
    transcript: transcripts[0]?.transcript ?? '',
    documents: notes.map((note: any) => ({
      id: note.id,
      title: note.title || note.note_type || 'Note',
      type: note.note_type || 'Note',
      content: note.content || '',
      createdAt: new Date(note.created_at || row.created_at),
    })),
    context: contexts[0]?.context ?? '',
    status: row.status || 'draft',
    tasks: [],
    addendums: [],
  };
};

export const fetchSessionsForUser = async (userId: string) => {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      *,
      patients(*),
      session_notes(*),
      session_transcripts(*),
      session_context(*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapSessionRow);
};

export const createSessionWithPatient = async (params: {
  userId: string;
  patientName: string;
  patientGender: string;
  templateId: string;
  templateName: string;
  title: string;
  status: string;
}) => {
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .insert({
      user_id: params.userId,
      full_name: params.patientName,
      gender: params.patientGender,
    })
    .select()
    .single();

  if (patientError) throw patientError;

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      user_id: params.userId,
      patient_id: patient.id,
      patient_name: params.patientName,
      patient_gender: params.patientGender,
      title: params.title,
      status: params.status,
      template_id: params.templateId,
      template_name: params.templateName,
    })
    .select()
    .single();

  if (sessionError) throw sessionError;

  return { patient, session };
};

export const updatePatient = async (patientId: string, updates: { full_name?: string; gender?: string }) => {
  const { error } = await supabase
    .from('patients')
    .update(updates)
    .eq('id', patientId);

  if (error) throw error;
};

export const updateSessionRecord = async (sessionId: string, updates: Record<string, any>) => {
  const { error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', sessionId);

  if (error) throw error;
};

export const upsertSessionTranscript = async (sessionId: string, transcript: string) => {
  const { error } = await supabase
    .from('session_transcripts')
    .upsert({ session_id: sessionId, transcript }, { onConflict: 'session_id' });

  if (error) throw error;
};

export const upsertSessionContext = async (sessionId: string, context: string) => {
  const { error } = await supabase
    .from('session_context')
    .upsert({ session_id: sessionId, context }, { onConflict: 'session_id' });

  if (error) throw error;
};

export const upsertSessionNotes = async (sessionId: string, documents: Document[]) => {
  if (!documents.length) return;
  const rows = documents.map(doc => ({
    id: doc.id,
    session_id: sessionId,
    title: doc.title,
    note_type: doc.type,
    content: doc.content,
    created_at: toIsoString(doc.createdAt),
  }));

  const { error } = await supabase
    .from('session_notes')
    .upsert(rows);

  if (error) throw error;
};

export const deleteSessionById = async (sessionId: string) => {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId);

  if (error) throw error;
};

const emptyProfile = (userId: string, email: string): Profile => ({
  id: userId,
  fullName: '',
  email,
  practice: '',
  speciality: '',
  phoneNumber: '',
  practiceName: '',
});

export const fetchProfile = async (userId: string, fallbackEmail: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return emptyProfile(userId, fallbackEmail);

  return {
    id: data.id,
    fullName: data.full_name || '',
    email: data.email || fallbackEmail,
    practice: data.practice || '',
    speciality: data.speciality || '',
    phoneNumber: data.phone_number || '',
    practiceName: data.practice_name || '',
  };
};

export const upsertProfile = async (profile: Profile) => {
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: profile.id,
      full_name: profile.fullName,
      email: profile.email,
      practice: profile.practice,
      speciality: profile.speciality,
      phone_number: profile.phoneNumber,
      practice_name: profile.practiceName,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
};