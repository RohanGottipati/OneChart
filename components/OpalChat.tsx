import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Copy, FilePlus } from 'lucide-react';
import { Message } from '../types';
import { chatWithOpal } from '../services/geminiService';

interface OpalChatProps {
  transcript: string;
  currentNote: string;
  onUpdateNote: (newNote: string) => void;
  onCreateDocument: (content: string) => void;
}

const OpalChat: React.FC<OpalChatProps> = ({ transcript, currentNote, onUpdateNote, onCreateDocument }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: "Hi, I'm Opal. I can help you refine this note, draft referrals, or answer clinical questions based on the transcript.", timestamp: new Date() }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Prepare history for API
    const historyPayload = messages.concat(userMsg).map(m => ({ role: m.role, content: m.content }));

    const responseText = await chatWithOpal(historyPayload, currentNote, transcript);

    const modelMsg: Message = { role: 'model', content: responseText, timestamp: new Date() };
    setMessages(prev => [...prev, modelMsg]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-brand-50 p-4 border-b border-brand-100 flex items-center gap-2">
        <div className="bg-white p-1.5 rounded-full shadow-sm">
            <Sparkles className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">Speak to Opal</h3>
          <p className="text-xs text-slate-500">AI Assistant</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-brand-600 text-white rounded-br-none' 
                  : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'
              }`}
            >
              {msg.content}
              {msg.role === 'model' && (
                <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
                    <button 
                        onClick={() => navigator.clipboard.writeText(msg.content)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-brand-600 transition-colors"
                    >
                        <Copy className="w-3 h-3" /> Copy
                    </button>
                    <button 
                         onClick={() => onCreateDocument(msg.content)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-brand-600 transition-colors"
                    >
                        <FilePlus className="w-3 h-3" /> Save as New Tab
                    </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
            <div className="flex justify-start">
                <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-none shadow-sm border border-slate-100">
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce delay-75"></div>
                        <div className="w-2 h-2 bg-brand-400 rounded-full animate-bounce delay-150"></div>
                    </div>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-100">
        <div className="relative">
          <input
            type="text"
            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-sm placeholder:text-slate-400"
            placeholder="Ask Opal to draft a referral..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OpalChat;