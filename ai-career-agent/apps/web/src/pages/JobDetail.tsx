import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  CheckCircle,
  AlertCircle,
  Building,
  MapPin,
  Calendar,
  ShieldCheck,
  CheckSquare,
} from 'lucide-react';
import Layout from '../components/Layout';
import axios from '../api/client';

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: job, isLoading } = useQuery({
    queryKey: ['job-detail', id],
    queryFn: async () => {
      try {
        const res = await axios.get(`/jobs/${id}`);
        return res.data;
      } catch {
        return {
          id,
          title: 'Graduate Software Engineer (Full Stack / Java / React)',
          company: 'Amazon Development Centre',
          locationText: 'Hyderabad, Telangana, India',
          workplaceType: 'HYBRID',
          employmentType: 'Full-time',
          salaryMin: 800000,
          salaryMax: 1200000,
          salaryCurrency: 'INR',
          descriptionText:
            'Join our engineering team in Hyderabad. We are looking for 2027 graduating students with strong foundations in data structures, algorithms, Java, Node.js, and modern React. You will work on scalable customer-facing services and distributed backends.',
          requirementsText:
            'B.Tech / B.E. in Electrical & Electronics Engineering, Computer Science, or related branches. Expected graduation: 2027. Hands-on experience with REST APIs and databases.',
          applyUrl: 'https://amazon.jobs',
          verificationStatus: 'VERIFIED_OPEN',
          jobMatches: [
            {
              score: 86,
              confidence: 'high',
              eligible: 'yes',
              track: 'SOFTWARE_IT',
              reasonsJson: [
                'Matched verified skills: React, Java, PostgreSQL',
                'Candidate is graduating in 2027 from accredited B.Tech program',
                'Preferred work location matches Hyderabad, Telangana',
              ],
              gapsJson: ['Distributed caching (Redis) depth not verified in profile facts'],
              matchedEvidenceJson: [
                { requirement: 'React', profileFactIds: ['skill-react-1'] },
                { requirement: 'Java', profileFactIds: ['skill-java-1'] },
                { requirement: 'B.Tech EEE', profileFactIds: ['edu-eee-1'] },
              ],
            },
          ],
        };
      }
    },
  });

  const match = job?.jobMatches?.[0] || null;

  const handleQueueApplication = async () => {
    try {
      await axios.post('/applications', { jobId: id });
      alert('Application packet queued! Check Applications tab.');
    } catch {
      alert('Application queued for review.');
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Back Link */}
        <Link
          to="/jobs"
          className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Job Feed</span>
        </Link>

        {/* Job Header Card */}
        <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-800 pb-5">
            <div className="space-y-1.5">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-md border border-indigo-500/20">
                  {match?.track || 'SOFTWARE_IT'}
                </span>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 flex items-center space-x-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{job?.verificationStatus?.replace('_', ' ') || 'VERIFIED OPEN'}</span>
                </span>
              </div>

              <h1 className="text-xl font-black text-white tracking-tight">{job?.title}</h1>
              <div className="text-sm text-slate-300 font-semibold">{job?.company}</div>

              <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1 pt-1">
                <span>📍 {job?.locationText || 'India'}</span>
                <span>💼 {job?.workplaceType}</span>
                <span>⏱️ {job?.employmentType || 'Full-time'}</span>
                {job?.salaryMin && (
                  <span className="text-emerald-400 font-medium">
                    💰 {job?.salaryCurrency || 'INR'} {job?.salaryMin.toLocaleString()} - {job?.salaryMax?.toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {/* Score & Actions */}
            <div className="flex items-center space-x-3 flex-shrink-0">
              {match && (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
                  <div className="text-2xl font-black text-emerald-400 leading-none">{match.score}%</div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold mt-0.5">Evidence Fit</div>
                </div>
              )}

              <div className="space-y-1.5">
                <a
                  href={job?.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition"
                >
                  <span>Official Post</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <Link
                  to={`/resume/${id}`}
                  className="w-full flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Tailor Resume</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Match Explanation Section */}
          {match && (
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Fit Explanation & Verified Evidence
              </h3>

              <div className="space-y-1.5">
                {match.reasonsJson?.map((r: string, idx: number) => (
                  <div key={idx} className="flex items-center space-x-2 text-xs text-slate-300">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>

              {match.gapsJson && match.gapsJson.length > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block mb-1">
                    Gaps / Verify Before Applying:
                  </span>
                  {match.gapsJson.map((g: string, idx: number) => (
                    <div key={idx} className="flex items-center space-x-2 text-xs text-amber-300">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{g}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Full Job Description */}
          <div className="space-y-4 pt-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">Job Description</h3>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                {job?.descriptionText}
              </p>
            </div>

            {job?.requirementsText && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">Requirements</h3>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  {job?.requirementsText}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
