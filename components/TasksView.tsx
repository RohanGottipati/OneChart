import React, { useState } from 'react';
import { CheckCircle2, Circle, Tag, Trash2, CheckSquare } from 'lucide-react';
import { Session, Task } from '../types';

interface TasksViewProps {
  sessions: Session[];
  onUpdateTaskStatus: (sessionId: string, taskId: string, status: 'completed' | 'pending') => void;
  onDeleteTask: (sessionId: string, taskId: string) => void;
  onNavigateToSession: (session: Session) => void;
}

const TasksView: React.FC<TasksViewProps> = ({ sessions, onUpdateTaskStatus, onDeleteTask, onNavigateToSession }) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const allTasks = sessions.flatMap(s => s.tasks.map(t => ({ ...t, sessionName: s.patientName, sessionDate: s.date, fullSession: s })));

  const filteredTasks = allTasks.filter(t => {
      if (filter === 'all') return true;
      return t.status === filter;
  });

  const getTagColor = (tag: string) => {
      const lower = tag.toLowerCase();
      if (lower.includes('presc')) return 'bg-green-100 text-green-700';
      if (lower.includes('ref')) return 'bg-amber-100 text-amber-700';
      if (lower.includes('lab')) return 'bg-indigo-100 text-indigo-700';
      if (lower.includes('follow')) return 'bg-blue-100 text-blue-700';
      return 'bg-slate-100 text-slate-700';
  }

  return (
    <div className="h-full flex flex-col bg-white">
        <header className="bg-white border-b border-slate-100 px-8 py-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                <CheckSquare className="w-6 h-6 text-brand-600" />
                Action Items
            </h1>
            <div className="flex bg-slate-100 p-1 rounded-lg">
                {(['all', 'pending', 'completed'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-all ${
                            filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 bg-white">
            <div className="max-w-4xl mx-auto space-y-3">
                {filteredTasks.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
                        <p className="text-lg">No tasks found</p>
                    </div>
                ) : (
                    filteredTasks.map((task) => (
                        <div key={task.id} className={`group bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-start gap-4 ${task.status === 'completed' ? 'opacity-50 bg-slate-50' : ''}`}>
                            <button 
                                onClick={() => onUpdateTaskStatus(task.sessionId, task.id, task.status === 'completed' ? 'pending' : 'completed')}
                                className="mt-1 text-slate-300 hover:text-brand-600 transition-colors"
                            >
                                {task.status === 'completed' ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                ) : (
                                    <Circle className="w-5 h-5" />
                                )}
                            </button>
                            
                            <div className="flex-1">
                                <p className={`text-slate-800 font-medium ${task.status === 'completed' ? 'line-through text-slate-500' : ''}`}>
                                    {task.content}
                                </p>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${getTagColor(task.tag)}`}>
                                        {task.tag}
                                    </span>
                                    <span className="text-slate-300">•</span>
                                    <button 
                                        onClick={() => onNavigateToSession(task.fullSession)}
                                        className="text-xs text-slate-400 hover:text-brand-600 hover:underline"
                                    >
                                        {task.sessionName} — {task.sessionDate.toLocaleDateString()}
                                    </button>
                                </div>
                            </div>

                            <button 
                                onClick={() => onDeleteTask(task.sessionId, task.id)}
                                className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    </div>
  );
};

export default TasksView;