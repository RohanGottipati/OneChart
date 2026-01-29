import React from 'react';
import { PlusCircle, History, Mic2, Settings, Users, CheckSquare, Menu, LogOut } from 'lucide-react';
import { ViewState } from '../types';

interface SidebarProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  onToggleHistory: () => void;
  isHistoryOpen: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  userEmail?: string;
  onSignOut: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onChangeView,
  onToggleHistory,
  isHistoryOpen,
  isOpenMobile,
  onCloseMobile,
  userEmail,
  onSignOut
}) => {
  const navItemClass = (isActive: boolean) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 cursor-pointer ${isActive
      ? 'bg-brand-100 text-brand-700 font-semibold shadow-sm'
      : 'text-slate-600 hover:bg-slate-50'
    }`;

  const handleNavClick = (view: ViewState) => {
    onChangeView(view);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 bg-white border-r border-slate-200 w-64 z-50 transform transition-transform duration-200 ease-in-out
        ${isOpenMobile ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:flex md:flex-col
      `}>
        <div className="p-6 flex items-center gap-2 border-b border-slate-100">
          <span className="text-2xl font-bold tracking-tight">
            <span className="text-brand-600">One</span><span className="text-slate-900">Chart</span>
          </span>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <div
            className={navItemClass(currentView === 'new-visit')}
            onClick={() => handleNavClick('new-visit')}
          >
            <PlusCircle className="w-5 h-5" />
            <span>New Visit</span>
          </div>

          {/* Toggle History Sidebar */}
          <div
            className={navItemClass(isHistoryOpen)}
            onClick={() => {
              onToggleHistory();
              onCloseMobile(); // Close sidebar on mobile when opening history
            }}
          >
            <History className="w-5 h-5" />
            <span>Past Visits</span>
          </div>

          <div
            className={navItemClass(currentView === 'tasks')}
            onClick={() => handleNavClick('tasks')}
          >
            <CheckSquare className="w-5 h-5" />
            <span>Actions</span>
          </div>

          <div
            className={navItemClass(currentView === 'voice-suite')}
            onClick={() => handleNavClick('voice-suite')}
          >
            <Mic2 className="w-5 h-5" />
            <span>Voice Agent Suite</span>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-2">
          <div
            className={navItemClass(currentView === 'settings')}
            onClick={() => handleNavClick('settings')}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
            <Users className="w-5 h-5" />
            <span>Partners</span>
          </div>

          <div className="mt-4 px-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-200 flex items-center justify-center text-brand-700 font-bold text-xs">
                DR
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">{userEmail?.split('@')[0] || 'User'}</p>
                <p className="text-xs text-slate-500 overflow-hidden text-ellipsis w-32">{userEmail}</p>
              </div>
              <button
                onClick={onSignOut}
                className="ml-auto p-2 text-slate-400 hover:text-red-600 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;