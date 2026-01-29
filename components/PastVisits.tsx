import React, { useState } from 'react';
import { Search, Filter, Calendar, FileText, ChevronRight } from 'lucide-react';
import { Session } from '../types';

interface PastVisitsProps {
  sessions: Session[];
  onSelectSession: (session: Session) => void;
}

const PastVisits: React.FC<PastVisitsProps> = ({ sessions, onSelectSession }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSessions = sessions.filter(s => 
    s.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.templateName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-brand-50/30">
      {/* Header */}
      <header className="px-8 py-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">Session Library</h1>
        
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by patient name, note type..." 
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors shadow-sm font-medium">
            <Filter className="w-5 h-5" />
            Filter
          </button>
        </div>
      </header>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
            <Calendar className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">No sessions found</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredSessions.map((session) => (
              <div 
                key={session.id}
                onClick={() => onSelectSession(session)}
                className="group bg-white p-5 rounded-xl border border-slate-200 hover:border-brand-300 hover:shadow-md transition-all cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 font-bold text-lg">
                    {session.patientName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 group-hover:text-brand-600 transition-colors text-lg">
                        {session.patientName}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {session.date.toLocaleDateString()}
                      </span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                      <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-xs font-medium text-slate-600">
                        <FileText className="w-3 h-3" />
                        {session.templateName}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider group-hover:text-brand-500">View Details</span>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-brand-500 transform group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PastVisits;