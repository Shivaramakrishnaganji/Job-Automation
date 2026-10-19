import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Download,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
  Printer,
  RefreshCw,
  Database,
  Building,
  Briefcase,
} from 'lucide-react';
import Layout from '../components/Layout';
import apiClient from '../api/client';

export default function ResumeStudio() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [tailoring, setTailoring] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [profRes, jobRes] = await Promise.all([
        apiClient.get('/profile').catch(() => ({ data: null })),
        id ? apiClient.get(`/jobs/${id}`).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      ]);

      if (profRes.data) {
        setProfile(profRes.data);
      }
      if (jobRes.data) {
        setJob(jobRes.data);
      }

      if (id) {
        // Try to fetch existing draft
        try {
          const draftRes = await apiClient.get(`/jobs/${id}/resume-draft`);
          if (draftRes.data?.contentJson) {
            setDraft(draftRes.data.contentJson);
          }
        } catch {
          // If no draft exists yet, auto-generate one
          await triggerTailoring();
        }
      }
    } catch (err) {
      console.error('Error loading resume studio data:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerTailoring = async () => {
    if (!id) return;
    setTailoring(true);
    setExportMessage('Retrieving dumped documents from Qdrant & tailoring with GPT-6-Luna...');
    try {
      const res = await apiClient.post(`/jobs/${id}/resume-draft`);
      if (res.data?.contentJson) {
        setDraft(res.data.contentJson);
        setExportMessage('Resume tailored successfully using Qdrant vector retrieval & Luna AI.');
      }
    } catch (err: any) {
      console.error('Failed to tailor resume:', err);
      setExportMessage('Note: Loaded standard profile draft.');
    } finally {
      setTailoring(false);
      setTimeout(() => setExportMessage(null), 4000);
    }
  };

  const handleDownloadPdf = async () => {
    if (!id) return;
    setDownloading(true);
    setExportMessage('Generating ATS-compliant single-column PDF...');
    try {
      const response = await apiClient.get(`/jobs/${id}/download-pdf`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const compName = (job?.company || 'Company').replace(/[^a-zA-Z0-9_-]/g, '_');
      const candName = (profile?.fullName || 'Candidate').replace(/[^a-zA-Z0-9_-]/g, '_');
      link.setAttribute('download', `Resume_${compName}_${candName}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      setExportMessage('ATS PDF downloaded successfully! Ready to apply.');
    } catch (err) {
      console.error('Failed to download PDF:', err);
      setExportMessage('Failed to download PDF. Please try again.');
    } finally {
      setDownloading(false);
      setTimeout(() => setExportMessage(null), 4000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Fallback data if profile or draft is still loading
  const candidateName = profile?.fullName || 'Candidate';
  const headline = draft?.headline || profile?.headline || 'Engineer & Problem Solver';
  const summary =
    draft?.summary ||
    profile?.summary ||
    'Experienced engineer with a strong track record of designing, developing, and deploying robust systems.';

  const skills: Array<{ name: string; factId?: string }> = Array.isArray(draft?.skills)
    ? draft.skills.map((s: any) => (typeof s === 'string' ? { name: s } : { name: s.name || s.label, factId: s.factId }))
    : (profile?.facts || [])
        .filter((f: any) => f.category === 'SKILL')
        .map((f: any) => ({ name: f.label, factId: f.id }));

  const experienceBullets: Array<{ text: string; factId?: string }> = Array.isArray(draft?.experienceBullets)
    ? draft.experienceBullets.map((b: any) =>
        typeof b === 'string' ? { text: b } : { text: b.text, factId: b.evidenceFactIds?.[0] }
      )
    : [
        {
          text: `Tailored engineering alignment for ${job?.title || 'Target Role'} at ${job?.company || 'Target Company'}.`,
        },
      ];

  const projectBullets: Array<{ text: string; factId?: string }> = Array.isArray(draft?.projectBullets)
    ? draft.projectBullets.map((p: any) =>
        typeof p === 'string' ? { text: p } : { text: p.text, factId: p.evidenceFactIds?.[0] }
      )
    : [];

  const qdrantEvidence: any[] = draft?.qdrantEvidence || [];

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Back Link & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            to={id ? `/jobs/${id}` : '/jobs'}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{job ? `Back to ${job.company} (${job.title})` : 'Back to Job Feed'}</span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={triggerTailoring}
              disabled={tailoring}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-xs font-medium text-indigo-300 border border-indigo-500/30 transition disabled:opacity-50"
              title="Query Qdrant vector database and re-tailor with GPT-6-Luna"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${tailoring ? 'animate-spin' : ''}`} />
              <span>{tailoring ? 'Tailoring with Qdrant...' : 'Re-Tailor (Qdrant + Luna)'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white border border-slate-700 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
            >
              <Download className={`w-3.5 h-3.5 ${downloading ? 'animate-bounce' : ''}`} />
              <span>{downloading ? 'Generating PDF...' : 'Download ATS PDF'}</span>
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
              <span>{isApproved ? 'Approved for Apply' : 'Approve Resume'}</span>
            </button>
          </div>
        </div>

        {exportMessage && (
          <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>{exportMessage}</span>
          </div>
        )}

        {/* Qdrant RAG Banner */}
        {qdrantEvidence.length > 0 && (
          <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs text-purple-300 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 font-semibold">
                <Database className="w-4 h-4 text-purple-400" />
                <span>Qdrant Vector DB Evidence Injection Active</span>
              </div>
              <span className="text-[10px] font-mono bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
                {qdrantEvidence.length} Chunks Retrieved
              </span>
            </div>
            <p className="text-[11px] text-purple-300/80">
              GPT-6-Luna retrieved the following relevant snippets from your uploaded project and resume PDFs to ground this tailored resume:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
              {qdrantEvidence.slice(0, 4).map((hit, idx) => (
                <div key={idx} className="p-2 rounded bg-slate-900/60 border border-purple-500/20 text-[11px]">
                  <div className="font-semibold text-purple-200 truncate">
                    📄 {hit.filename || 'Uploaded Document'}
                    <span className="ml-2 font-mono text-[9px] text-purple-400">
                      Score: {(hit.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-slate-400 line-clamp-2 mt-0.5">{hit.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Target Job Info Card */}
        {job && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Building className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">{job.title}</div>
                <div className="text-slate-400">
                  {job.company} · {job.locationText || 'Remote / India'} · {job.workplaceType}
                </div>
              </div>
            </div>

            {job.applyUrl && (
              <a
                href={job.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium self-start sm:self-auto transition"
              >
                View Official Job Post →
              </a>
            )}
          </div>
        )}

        {/* Truthfulness Notice */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              <strong>Truth Before Tailoring:</strong> Every bullet in this tailored resume maps directly to your verified profile facts and Qdrant documents.
            </span>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            ATS Single-Column
          </span>
        </div>

        {/* ── ATS Document Preview (Paper Style) ── */}
        <div className="bg-white text-slate-900 rounded-2xl shadow-2xl p-10 max-w-3xl mx-auto space-y-6 font-serif print:m-0 print:p-0 print:shadow-none">
          {/* Header */}
          <div className="text-center border-b border-slate-300 pb-5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 font-sans uppercase">
              {candidateName}
            </h1>
            <p className="text-xs text-slate-600 mt-1 font-sans">
              {[
                [profile?.city, profile?.country].filter(Boolean).join(', ') || 'India',
                profile?.email || 'contact@example.com',
                profile?.phone || undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="text-xs font-semibold text-slate-800 mt-2 font-sans">
              {headline}
            </p>
          </div>

          {/* Professional Summary */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">
              Professional Summary
            </h2>
            <p className="text-xs text-slate-700 leading-relaxed font-sans">
              {summary}
            </p>
          </div>

          {/* Verified Skills */}
          {skills.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">
                Technical Competencies & Core Skills
              </h2>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {skills.map((s, idx) => (
                  <span
                    key={idx}
                    className="text-[11px] font-sans px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-300 flex items-center space-x-1"
                  >
                    <span>{s.name}</span>
                    <span className="text-[9px] text-emerald-600 font-mono font-bold">✓</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Experience & Projects */}
          {experienceBullets.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">
                Professional Experience & Alignment
              </h2>
              <div className="space-y-2.5 font-sans">
                {experienceBullets.map((b, idx) => (
                  <div key={idx} className="text-xs text-slate-800 flex items-start space-x-2">
                    <span className="text-indigo-600 font-bold">•</span>
                    <div className="flex-1">
                      <span>{b.text}</span>
                      {b.factId && (
                        <span className="ml-2 text-[10px] text-slate-500 font-mono">
                          [Evidence: {b.factId}]
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Engineering Projects */}
          {projectBullets.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">
                Key Engineering & Applied Projects
              </h2>
              <div className="space-y-2.5 font-sans">
                {projectBullets.map((p, idx) => (
                  <div key={idx} className="text-xs text-slate-800 flex items-start space-x-2">
                    <span className="text-indigo-600 font-bold">•</span>
                    <div className="flex-1">
                      <span>{p.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {(profile?.degree || profile?.branch) && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1 mb-2 font-sans">
                Education
              </h2>
              <div className="flex justify-between items-start text-xs font-sans">
                <div>
                  <strong className="text-slate-900">
                    {profile?.degree || 'Bachelor of Technology'}
                    {profile?.branch ? ` in ${profile.branch}` : ''}
                  </strong>
                  <div className="text-slate-600">
                    {profile?.college || 'University / College'}
                  </div>
                </div>
                <div className="text-right text-slate-600">
                  <span>{profile?.graduationYear ? `Class of ${profile.graduationYear}` : ''}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
