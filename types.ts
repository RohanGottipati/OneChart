export interface Template {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

export interface Document {
  id: string;
  title: string;
  type: string;
  content: string;
  createdAt: Date;
}

export interface Task {
  id: string;
  content: string;
  status: 'pending' | 'completed';
  tag: string; // e.g. 'Referral', 'Lab', 'Admin'
  sessionId: string;
}

export interface Addendum {
  id: string;
  timestamp: Date;
  content: string;
}

export interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  practice: string;
  speciality: string;
  phoneNumber: string;
  practiceName: string;
}

export interface Session {
  id: string;
  patientId?: string;
  userId?: string;
  patientName: string;
  patientGender: string; // Changed from strict union to string to allow "Unknown" or edits
  date: Date;
  templateId: string;
  templateName: string;
  transcript: string;
  documents: Document[]; 
  context: string;
  status: 'processing' | 'completed' | 'draft';
  tasks: Task[];
  addendums: Addendum[];
}

export type ViewState = 'new-visit' | 'tasks' | 'settings' | 'voice-suite' | 'session-detail';
