import React, { useState } from 'react';
import { Search, Calendar, FileText, ChevronRight, X, Loader2, Trash2 } from 'lucide-react';
import { Session } from '../types';

interface SessionListSidebarProps {
  sessions: Session[];
  onSelectSession: (session: Session) => void;
  selectedSessionId?: string;
  onDeleteSession?: (sessionId: string) => void;
}

const SessionListSidebar: React.FC<SessionListSidebarProps> = ({ sessions, onSelectSession, selectedSessionId, onDeleteSession }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const filteredSessions = sessions.filter(s => {
    const matchesSearch = s.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.templateName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = dateFilter ? new Date(s.date).toISOString().split('T')[0] === dateFilter : true;
    
    return matchesSearch && matchesDate;
  });

  return (
    <div className="w-80 bg-white border-r border-slate-200 h-full flex flex-col flex-shrink-0 animate-in slide-in-from-left duration-200 z-20 shadow-lg">
      <div className="p-4 border-b border-slate-100 bg-white space-y-3">
        <h2 className="font-bold text-slate-800">Session Library</h2>
        
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:ring-1 focus:ring-brand-500 outline-none transition-all placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>

        <div className="relative">
             <input 
                type="date"
                className="w-full pl-3 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:ring-1 focus:ring-brand-500 outline-none text-slate-600"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
             />
             {dateFilter && (
                 <button 
                    onClick={() => setDateFilter('')}
                    className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                 >
                     <X className="w-3 h-3" />
                 </button>
             )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filteredSessions.length === 0 ? (
           <div className="text-center p-8 text-slate-400">
             <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
             <p className="text-xs">No sessions found</p>
           </div>
        ) : (
          <div className="space-y-1">
            {filteredSessions.map(session => (
              <div 
                key={session.id}
                onClick={() => onSelectSession(session)}
                className={`group p-3 rounded-lg cursor-pointer transition-all border ${
                  selectedSessionId === session.id 
                    ? 'bg-brand-50 border-brand-200 shadow-sm' 
                    : 'border-transparent hover:bg-slate-50 hover:border-slate-100'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                   <div className={`font-semibold text-sm ${selectedSessionId === session.id ? 'text-brand-700' : 'text-slate-700'} flex items-center gap-2`}>
                      {session.patientName}
                      {session.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-brand-500" />}
                   </div>
                   <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">{session.date.toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                      {session.status === 'processing' && onDeleteSession && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete this processing session?')) {
                              onDeleteSession(session.id);
                            }
                          }}
                          className="p-1 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete processing session"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                   </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                       <FileText className="w-3 h-3" /> {session.templateName}
                    </span>
                    {session.status === 'processing' && <span className="text-brand-500 italic">Processing...</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionListSidebar;