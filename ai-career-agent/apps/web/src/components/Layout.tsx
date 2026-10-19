import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  CheckSquare,
  Send,
  FolderArchive,
  User,
  Settings as SettingsIcon,
  Play,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import AgentRunnerModal from './AgentRunnerModal';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [isRunnerOpen, setIsRunnerOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<string>('all');

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Job Feed', href: '/jobs', icon: Briefcase },
    { name: 'Resource Library', href: '/resources', icon: FolderArchive },
    { name: 'Applications', href: '/applications', icon: CheckSquare },
    { name: 'Hiring Outreach', href: '/outreach', icon: Send },
    { name: 'Profile & Evidence', href: '/profile', icon: User },
    { name: 'Settings & AI Cost', href: '/settings', icon: SettingsIcon },
  ];

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      {/* ── Sidebar ── */}
      <aside className="w-64 flex-shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col justify-between">
        <div>
          {/* Logo / Header */}
          <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-bold text-base tracking-tight text-white block">AI Career Agent</span>
                <span className="text-xs text-indigo-400 font-medium">Tsenta-Inspired MVP</span>
              </div>
            </div>
          </div>

          {/* Run Agent Hero Button */}
          <div className="p-4">
            <button
              onClick={() => setIsRunnerOpen(true)}
              className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 text-white font-semibold shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Run Agent</span>
            </button>
          </div>

          {/* Career Track Pill Filter */}
          <div className="px-4 py-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold px-2 mb-1.5">
              Active Career Track
            </div>
            <select
              value={selectedTrack}
              onChange={(e) => setSelectedTrack(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">⚡ All Tracks (Unified)</option>
              <option value="software_it">💻 Software & IT (2027)</option>
              <option value="core_eee">⚡ Core EEE / Electrical</option>
              <option value="business_data_analyst">📊 Business / Data Analyst</option>
            </select>
          </div>

          {/* Navigation Links */}
          <nav className="px-3 py-4 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Safety & Compliance Badge */}
        <div className="p-4 border-t border-slate-800/80">
          <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="leading-tight text-[11px]">Human-in-the-loop approvals active. No bot scraping.</span>
          </div>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-14 border-b border-slate-800 bg-slate-950/60 backdrop-blur px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3 text-xs text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Orchestrator: <strong className="text-slate-200">LangGraph.js v1.5</strong></span>
            <span className="text-slate-600">|</span>
            <span>Checkpointer: <strong className="text-slate-200">PostgreSQL</strong></span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-xs text-slate-400">
              Candidate: <span className="text-slate-200 font-medium">B.Tech EEE (2027)</span>
            </div>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-900">
          {children}
        </main>
      </div>

      {/* ── One-Click Agent Runner Modal ── */}
      {isRunnerOpen && (
        <AgentRunnerModal
          isOpen={isRunnerOpen}
          onClose={() => setIsRunnerOpen(false)}
          defaultTrack={selectedTrack}
        />
      )}
    </div>
  );
}
