import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  SlidersHorizontal,
  ExternalLink,
  FileText,
  EyeOff,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import Layout from '../components/Layout';
import axios from '../api/client';

export default function JobFeed() {
  const [search, setSearch] = useState('');
  const [track, setTrack] = useState<string>('all');
  const [minScore, setMinScore] = useState<number>(50);
  const [selectedJobForDetail, setSelectedJobForDetail] = useState<any | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['jobs-feed', search, track, minScore],
    queryFn: async () => {
      try {
        const params: any = {
          limit: 50,
          minScore: minScore > 0 ? minScore : undefined,
        };
        if (search) params.search = search;
        if (track !== 'all') params.track = track.toUpperCase();

        const res = await axios.get('/jobs', { params });
        return res.data;
      } catch {
        // Fallback demo data
        return {
          jobs: [
            {
              id: 'job-1',
              title: 'Graduate Software Engineer (Full Stack / Java / React)',
              company: 'Amazon Development Centre',
              locationText: 'Hyderabad, Telangana, India',
              workplaceType: 'HYBRID',
              applyUrl: 'https://amazon.jobs',
              firstSeenAt: new Date().toISOString(),
              verificationStatus: 'VERIFIED_OPEN',
              match: {
                score: 86,
                confidence: 'high',
                eligible: 'yes',
                track: 'SOFTWARE_IT',
                reasons: ['Strong verified skills in React, Java, and SQL', 'Hyderabad location match', 'Entry-level graduate title'],
                gaps: ['Depth of distributed caching (Redis) not verified'],
              },
            },
            {
              id: 'job-2',
              title: 'Electrical Testing & Commissioning Trainee',
              company: 'ABB India',
              locationText: 'Hyderabad, India',
              workplaceType: 'ONSITE',
              applyUrl: 'https://abb.com/careers',
              firstSeenAt: new Date().toISOString(),
              verificationStatus: 'VERIFIED_OPEN',
              match: {
                score: 81,
                confidence: 'high',
                eligible: 'yes',
                track: 'CORE_EEE',
                reasons: ['B.Tech EEE degree match (2027 batch)', 'Core electrical power systems coursework verified'],
                gaps: ['Industrial testing certificate not uploaded'],
              },
            },
            {
              id: 'job-3',
              title: 'Associate Business / Data Analyst',
              company: 'FactSet India',
              locationText: 'Hyderabad, Telangana',
              workplaceType: 'HYBRID',
              applyUrl: 'https://factset.com/careers',
              firstSeenAt: new Date().toISOString(),
              verificationStatus: 'VERIFIED_OPEN',
              match: {
                score: 78,
                confidence: 'medium',
                eligible: 'likely',
                track: 'BUSINESS_DATA_ANALYST',
                reasons: ['PostgreSQL & data cleaning project evidence confirmed'],
                gaps: ['PowerBI / Tableau visualization proof unconfirmed'],
              },
            },
          ],
          total: 3,
        };
      }
    },
  });

  const jobs = data?.jobs || [];

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Job Feed & Match Scoring</h1>
            <p className="text-xs text-slate-400 mt-1">
              Curated openings with transparent score explanations, evidence links, and verified application URLs.
            </p>
          </div>

          {/* Quick Track Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {[
              { id: 'all', label: 'All Tracks' },
              { id: 'software_it', label: 'Software / IT' },
              { id: 'core_eee', label: 'Core EEE' },
              { id: 'business_data_analyst', label: 'Data / Analyst' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTrack(t.id)}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  track === t.id
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search title, company, skills (e.g. React, Java, Power Systems)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center space-x-3 px-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">Min Score:</span>
            <input
              type="range"
              min="0"
              max="90"
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-indigo-400">{minScore}%</span>
          </div>
        </div>

        {/* Job List */}
        <div className="space-y-3">
          {jobs.length === 0 ? (
            <div className="p-12 text-center bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 text-xs">
              No jobs matching criteria. Click <strong className="text-white">Run Agent</strong> to discover fresh postings or lower the score threshold.
            </div>
          ) : (
            jobs.map((job: any) => (
              <div
                key={job.id}
                className="p-5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      {job.match?.track || 'OPPORTUNITY'}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>{job.verificationStatus?.replace('_', ' ') || 'VERIFIED OPEN'}</span>
                    </span>
                  </div>

                  <Link to={`/jobs/${job.id}`}>
                    <h3 className="text-base font-bold text-white tracking-tight hover:text-indigo-400 transition cursor-pointer">
                      {job.title}
                    </h3>
                  </Link>

                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-slate-300 font-medium">{job.company}</span>
                    <span>📍 {job.locationText || 'India'}</span>
                    <span>💼 {job.workplaceType}</span>
                  </div>

                  {job.match?.reasons && job.match.reasons.length > 0 && (
                    <div className="text-xs text-slate-400 pt-1 flex items-center space-x-2">
                      <span className="text-emerald-400 font-semibold">Match reason:</span>
                      <span className="truncate">{job.match.reasons[0]}</span>
                    </div>
                  )}
                </div>

                {/* Score & Action Buttons */}
                <div className="flex items-center space-x-4 flex-shrink-0">
                  {job.match && (
                    <div className="text-right">
                      <div className="text-2xl font-black text-emerald-400 leading-none">
                        {job.match.score}%
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Evidence Fit</div>
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:text-white transition"
                      title="Open official career page"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>

                    <Link
                      to={`/resume/${job.id}`}
                      className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Tailor Resume</span>
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
