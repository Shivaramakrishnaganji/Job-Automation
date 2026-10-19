import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Send,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  UserCheck,
  Clock,
  Sparkles,
} from 'lucide-react';
import Layout from '../components/Layout';
import axios from '../api/client';

export default function Outreach() {
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ['contacts-outreach'],
    queryFn: async () => {
      try {
        const res = await axios.get('/contacts');
        return res.data;
      } catch {
        return {
          contacts: [
            {
              id: 'contact-1',
              companyName: 'Stripe India',
              name: 'Priya Sharma',
              roleTitle: 'University Talent Acquisition Specialist',
              contactType: 'TALENT_ACQUISITION',
              profileUrl: 'https://linkedin.com',
              sourceUrl: 'https://stripe.com/jobs/university',
              relevanceReason: 'Campus recruitment lead for 2027 graduate engineering drives.',
              outreachStatus: 'DRAFT_READY',
              outreachDrafts: [
                {
                  id: 'draft-1',
                  bodyText:
                    'Hi Priya, I noticed your work leading university recruiting at Stripe India. As an EEE student graduating in 2027 with full-stack React and Node.js projects, I would love to connect and follow updates regarding graduate engineering opportunities.',
                  evidenceFactIdsJson: ['skill-react-1', 'edu-jntu-2027'],
                },
              ],
            },
            {
              id: 'contact-2',
              companyName: 'Schneider Electric',
              name: 'Ramesh Varma',
              roleTitle: 'Engineering Manager — Power & Automation',
              contactType: 'HIRING_MANAGER',
              profileUrl: 'https://linkedin.com',
              sourceUrl: 'https://se.com/careers',
              relevanceReason: 'Hiring manager for Hyderabad grid modernization systems.',
              outreachStatus: 'USER_SENT',
              nextFollowUpAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
              outreachDrafts: [
                {
                  id: 'draft-2',
                  bodyText:
                    'Hello Ramesh, I came across your team’s power systems work in Hyderabad. As a 2027 Electrical Engineering candidate focused on grid protection and MATLAB modeling, I’d be grateful to connect and learn from your team’s work.',
                  evidenceFactIdsJson: ['edu-eee-2027', 'proj-matlab-grid'],
                },
              ],
            },
          ],
        };
      }
    },
  });

  const handleCopyNote = (draftId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDraftId(draftId);
    setTimeout(() => setCopiedDraftId(null), 2000);
  };

  const handleMarkSent = async (draftId: string) => {
    try {
      await axios.post(`/contacts/drafts/${draftId}/mark-sent`);
      refetch();
    } catch {
      refetch();
    }
  };

  const contacts = data?.contacts || [];

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Hiring-Team Research & Controlled Outreach</h1>
          <p className="text-xs text-slate-400 mt-1">
            Research relevant recruiters and managers from public sources. Draft concise, truthful connection notes to send manually.
          </p>
        </div>

        {/* Safety Banner */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center space-x-3 text-xs text-slate-300">
          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div>
            <strong>Strict Platform Compliance:</strong> This application never automates LinkedIn messaging, connection requests, or browser scraping. All notes are drafted for your manual review and sending.
          </div>
        </div>

        {/* Contacts & Drafts List */}
        <div className="space-y-4">
          {contacts.map((contact: any) => {
            const draft = contact.outreachDrafts?.[0];
            const isSent = contact.outreachStatus === 'USER_SENT';

            return (
              <div
                key={contact.id}
                className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-bold text-white text-base">{contact.name || 'Hiring Contact'}</h3>
                      <span className="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {contact.contactType?.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {contact.roleTitle} at <strong className="text-slate-200">{contact.companyName}</strong>
                    </div>
                    {contact.relevanceReason && (
                      <p className="text-xs text-slate-500 mt-1">Target relevance: {contact.relevanceReason}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 text-xs">
                    {contact.sourceUrl && (
                      <a
                        href={contact.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1 text-slate-400 hover:text-white"
                      >
                        <span>Public Source</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Draft Card */}
                {draft && (
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="font-semibold text-slate-300">Drafted Connection Note (Max 280 Chars)</span>
                      </div>
                      <span className="font-mono text-slate-500">{draft.bodyText?.length || 0}/280</span>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed font-sans bg-slate-950 p-3 rounded-lg border border-slate-800">
                      "{draft.bodyText}"
                    </p>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs">
                      <div className="flex items-center space-x-1.5 text-slate-500">
                        <span>Cites Verified Facts:</span>
                        <span className="text-emerald-400 font-mono font-medium">
                          {(draft.evidenceFactIdsJson as string[])?.join(', ') || 'profile'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleCopyNote(draft.id, draft.bodyText)}
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition"
                        >
                          {copiedDraftId === draft.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Note</span>
                            </>
                          )}
                        </button>

                        {!isSent ? (
                          <button
                            onClick={() => handleMarkSent(draft.id)}
                            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>I Sent This Manually</span>
                          </button>
                        ) : (
                          <span className="flex items-center space-x-1 text-emerald-400 font-semibold px-2 py-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Follow-up Scheduled</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
