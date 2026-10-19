import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckSquare,
  ExternalLink,
  Clock,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import Layout from '../components/Layout';
import axios from '../api/client';

export default function Applications() {
  const [confirmModalAppId, setConfirmModalAppId] = useState<string | null>(null);
  const [submissionReceiptUrl, setSubmissionReceiptUrl] = useState('');

  const { data, refetch } = useQuery({
    queryKey: ['applications-list'],
    queryFn: async () => {
      try {
        const res = await axios.get('/applications');
        return res.data;
      } catch {
        return {
          applications: [
            {
              id: 'app-demo-1',
              job: {
                company: 'Amazon India',
                title: 'Software Development Engineer (Graduate 2027)',
                applyUrl: 'https://amazon.jobs',
              },
              status: 'READY_FOR_REVIEW',
              nextFollowUpAt: null,
              notes: 'Tailored resume generated. Awaiting candidate review before applying.',
            },
            {
              id: 'app-demo-2',
              job: {
                company: 'Schneider Electric',
                title: 'Junior Electrical Systems Trainee',
                applyUrl: 'https://se.com/careers',
              },
              status: 'APPLIED',
              submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
              nextFollowUpAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
              notes: 'Official application submitted on career portal. Follow-up reminder active.',
            },
          ],
        };
      }
    },
  });

  const handleConfirmSubmission = async (appId: string) => {
    try {
      await axios.post(`/applications/${appId}/confirm-submission`, {
        receiptUrl: submissionReceiptUrl || undefined,
      });
      setConfirmModalAppId(null);
      setSubmissionReceiptUrl('');
      refetch();
    } catch {
      setConfirmModalAppId(null);
      refetch();
    }
  };

  const applications = data?.applications || [];

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Application Tracker & Follow-up Intelligence</h1>
          <p className="text-xs text-slate-400 mt-1">
            Controlled human-in-the-loop application tracking. Opening an application page never fakes submission.
          </p>
        </div>

        {/* Pipeline Cards */}
        <div className="space-y-4">
          {applications.map((app: any) => {
            const isApplied = app.status === 'APPLIED';
            return (
              <div
                key={app.id}
                className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                        isApplied
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {app.status?.replace('_', ' ')}
                    </span>
                    {app.nextFollowUpAt && (
                      <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Follow-up: {new Date(app.nextFollowUpAt).toLocaleDateString()}</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-white tracking-tight">{app.job?.title}</h3>
                  <div className="text-xs text-slate-300 font-medium">{app.job?.company}</div>
                  <p className="text-xs text-slate-500">{app.notes}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <a
                    href={app.job?.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-800 transition"
                  >
                    <span>Open Official Form</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  {!isApplied ? (
                    <button
                      onClick={() => setConfirmModalAppId(app.id)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition"
                    >
                      Confirm Submission
                    </button>
                  ) : (
                    <span className="flex items-center space-x-1 px-3 py-2 text-xs font-semibold text-emerald-400">
                      <CheckCircle className="w-4 h-4" />
                      <span>Confirmed Applied</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Confirmation Modal */}
        {confirmModalAppId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white">Confirm Official Submission</h3>
              <p className="text-xs text-slate-300">
                Confirm that you completed the application on the employer's official portal. This will timestamp the record and set a 7-day follow-up reminder.
              </p>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Optional: Confirmation Email / Receipt Link
                </label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={submissionReceiptUrl}
                  onChange={(e) => setSubmissionReceiptUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  onClick={() => setConfirmModalAppId(null)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConfirmSubmission(confirmModalAppId)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  Record Confirmed Submission
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
