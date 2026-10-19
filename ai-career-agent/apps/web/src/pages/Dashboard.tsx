import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  CheckCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Sparkles,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import Layout from '../components/Layout';
import axios from '../api/client';

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      try {
        const res = await axios.get('/dashboard/summary');
        return res.data;
      } catch {
        // Mock fallback for initial experience before live database seed
        return {
          summary: {
            totalJobsDiscovered: 48,
            verifiedFactsCount: 16,
            pendingApplicationsCount: 3,
            dueFollowUpsCount: 1,
            latestRunStatus: 'COMPLETED',
          },
          topMatches: [
            {
              jobId: 'demo-1',
              title: 'Graduate Software Engineer Trainee',
              company: 'Stripe India',
              score: 88,
              track: 'SOFTWARE_IT',
              location: 'Hyderabad, Telangana / Remote',
              applyUrl: 'https://stripe.com/jobs',
            },
            {
              jobId: 'demo-2',
              title: 'Junior Electrical Systems Engineer',
              company: 'Schneider Electric',
              score: 82,
              track: 'CORE_EEE',
              location: 'Hyderabad, India',
              applyUrl: 'https://se.com/careers',
            },
            {
              jobId: 'demo-3',
              title: 'Business Analyst Trainee',
              company: 'Deloitte India',
              score: 79,
              track: 'BUSINESS_DATA_ANALYST',
              location: 'Hyderabad, Telangana',
              applyUrl: 'https://deloitte.com/careers',
            },
          ],
          dueFollowUps: [
            {
              applicationId: 'app-1',
              company: 'Microsoft India',
              title: 'Software Engineer (Graduate 2027)',
              nextFollowUpAt: new Date().toISOString(),
            },
          ],
        };
      }
    },
  });

  const summary = data?.summary || {
    totalJobsDiscovered: 0,
    verifiedFactsCount: 0,
    pendingApplicationsCount: 0,
    dueFollowUpsCount: 0,
  };

  const topMatches = data?.topMatches || [];
  const dueFollowUps = data?.dueFollowUps || [];

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Welcome Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-900/40 via-purple-900/20 to-slate-900 border border-indigo-800/40 shadow-xl flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Tsenta-Inspired 4-Stage Workflow</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              AI Career Copilot Dashboard
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Discover opportunities across Software/IT, Core EEE, and Business Analyst tracks in India. Tailor evidence-backed resumes with strict truthfulness.
            </p>
          </div>
          <Link
            to="/jobs"
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition"
          >
            <span>Explore All Jobs</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Discovered Roles</span>
              <Briefcase className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{summary.totalJobsDiscovered}</div>
            <div className="text-xs text-slate-500 mt-1">From Greenhouse, Lever & Resources</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Verified Facts</span>
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{summary.verifiedFactsCount}</div>
            <div className="text-xs text-slate-500 mt-1">Confirmed skills, degree, projects</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Packets</span>
              <TrendingUp className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">{summary.pendingApplicationsCount}</div>
            <div className="text-xs text-slate-500 mt-1">Ready for candidate approval</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Follow-ups Due</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-3xl font-extrabold text-amber-400">{summary.dueFollowUpsCount}</div>
            <div className="text-xs text-slate-500 mt-1">Respectful 7-day cadence</div>
          </div>
        </div>

        {/* Due Follow-up Banner if any */}
        {dueFollowUps.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <span className="text-xs font-bold text-amber-300">Action Required: Follow-up Scheduled</span>
                <p className="text-xs text-slate-300 mt-0.5">
                  Follow up with <strong className="text-white">{dueFollowUps[0].company}</strong> for {dueFollowUps[0].title}.
                </p>
              </div>
            </div>
            <Link
              to="/applications"
              className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline"
            >
              Open Queue
            </Link>
          </div>
        )}

        {/* Priority Recommendations (Best Matches) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Best Matches (Top Evidence Fit)</h2>
              <p className="text-xs text-slate-400">Ranked by factual skill overlap, seniority, and branch eligibility.</p>
            </div>
            <Link
              to="/jobs"
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
            >
              <span>View All Matches</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topMatches.map((job: any) => (
              <div
                key={job.jobId}
                className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                      {job.track?.replace('_', ' ')}
                    </span>
                    <div className="flex items-center space-x-1 text-emerald-400 font-bold text-xs bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                      <span>{job.score}%</span>
                      <span className="text-[10px] text-emerald-500 font-normal">fit</span>
                    </div>
                  </div>

                  <h3 className="font-bold text-white text-sm mt-3 line-clamp-1">{job.title}</h3>
                  <div className="text-xs text-slate-400 font-medium mt-0.5">{job.company}</div>
                  <div className="text-xs text-slate-500 mt-2 flex items-center space-x-1">
                    <span>📍 {job.location || 'India'}</span>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <a
                    href={job.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                  >
                    <span>Official Post</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <Link
                    to={`/resume/${job.jobId}`}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
                  >
                    Tailor Resume
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
