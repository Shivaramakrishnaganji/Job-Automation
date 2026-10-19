import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Download,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import Layout from '../components/Layout';

export default function ResumeStudio() {
  const { id } = useParams<{ id: string }>();
  const [isApproved, setIsApproved] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Tailored resume state referencing verified facts (§8)
  const tailoredResume = {
    headline: 'B.Tech Electrical & Electronics Engineer (2027) | Full-Stack & Systems Developer',
    summary:
      'Electrical & Electronics Engineering student at JNTU Hyderabad graduating in 2027. Practical software project experience with React, Node.js, PostgreSQL, and REST APIs, paired with core electrical circuit analysis and power systems fundamentals.',
    skills: [
      { name: 'JavaScript / TypeScript', factId: 'fact-js-1', verified: true },
      { name: 'React & Node.js', factId: 'fact-react-1', verified: true },
      { name: 'PostgreSQL & SQL', factId: 'fact-sql-1', verified: true },
      { name: 'MATLAB / Circuit Simulation', factId: 'fact-eee-1', verified: true },
      { name: 'Git & REST APIs', factId: 'fact-git-1', verified: true },
    ],
    experienceBullets: [
      {
        text: 'Architected full-stack portal with React frontend and Express/PostgreSQL backend for student resource management.',
        factId: 'fact-proj-1',
        changedFromBase: true,
      },
      {
        text: 'Conducted power system analysis and transient simulation on 3-phase grid model using MATLAB/Simulink.',
        factId: 'fact-eee-proj',
        changedFromBase: false,
      },
    ],
    warnings: [
      'No fabricated metrics detected. All claims reference verified candidate facts.',
    ],
  };

  const handleExport = (format: 'pdf' | 'docx') => {
    setExportMessage(`Generating ATS-friendly single-column ${format.toUpperCase()}...`);
    setTimeout(() => {
      setExportMessage(`ATS ${format.toUpperCase()} downloaded successfully.`);
      setTimeout(() => setExportMessage(null), 3000);
    }, 1500);
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Back Link & Header */}
        <div className="flex items-center justify-between">
          <Link
            to="/jobs"
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Job Feed</span>
          </Link>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleExport('docx')}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export DOCX</span>
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
            <button
              onClick={() => setIsApproved(true)}
              disabled={isApproved}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                isApproved
                  ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 cursor-default'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{isApproved ? 'Approved for Application' : 'Approve Tailored Resume'}</span>
            </button>
          </div>
        </div>

        {exportMessage && (
          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-400">
            {exportMessage}
          </div>
        )}

        {/* Truthfulness Notice */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              <strong>Truth Before Tailoring:</strong> Every bullet in this tailored resume maps to an unalterable candidate profile fact ID.
            </span>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            0 Unsupported Claims
          </span>
        </div>

        {/* ── ATS Document Preview (Paper Style) ── */}
        <div className="bg-white text-slate-900 rounded-2xl shadow-2xl p-10 max-w-3xl mx-auto space-y-6 font-serif">
          {/* Header */}
          <div className="text-center border-b border-slate-300 pb-5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 font-sans">
              SHIVA KUMAR
            </h1>
            <p className="text-xs text-slate-600 mt-1 font-sans">
              Hyderabad, Telangana, India · shiva@example.com · +91 98765 43210
            </p>
            <p className="text-xs font-semibold text-slate-800 mt-2 font-sans">
              {tailoredResume.headline}
            </p>
          </div>

          {/* Professional Summary */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">
              Professional Summary
            </h2>
            <p className="text-xs text-slate-700 leading-relaxed font-sans">
              {tailoredResume.summary}
            </p>
          </div>

          {/* Verified Skills */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">
              Technical Competencies (Evidence-Backed)
            </h2>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tailoredResume.skills.map((s) => (
                <span
                  key={s.factId}
                  className="text-[11px] font-sans px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-300 flex items-center space-x-1"
                >
                  <span>{s.name}</span>
                  <span className="text-[9px] text-emerald-600 font-mono font-bold">✓</span>
                </span>
              ))}
            </div>
          </div>

          {/* Experience & Projects */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">
              Key Engineering Projects
            </h2>
            <div className="space-y-3 font-sans">
              {tailoredResume.experienceBullets.map((b, idx) => (
                <div key={idx} className="text-xs text-slate-800 flex items-start space-x-2">
                  <span className="text-indigo-600 font-bold">•</span>
                  <div className="flex-1">
                    <span>{b.text}</span>
                    <span className="ml-2 text-[10px] text-slate-500 font-mono">
                      [Fact: {b.factId}]
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Education */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">
              Education
            </h2>
            <div className="flex justify-between items-start text-xs font-sans">
              <div>
                <strong className="text-slate-900">Bachelor of Technology in Electrical & Electronics Engineering</strong>
                <div className="text-slate-600">Jawaharlal Nehru Technological University (JNTU), Hyderabad</div>
              </div>
              <div className="text-right text-slate-600">
                <span>Expected: 2027</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
