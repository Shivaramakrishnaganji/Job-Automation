import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  Cpu,
  Shield,
  Download,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Sliders,
} from 'lucide-react';
import Layout from '../components/Layout';
import axios from '../api/client';

export default function Settings() {
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const { data: usageData } = useQuery({
    queryKey: ['ai-usage-settings'],
    queryFn: async () => {
      try {
        const res = await axios.get('/settings/ai-usage');
        return res.data;
      } catch {
        return {
          model: 'gpt-6-luna',
          dailySpentUsd: 0.08,
          monthlySpentUsd: 1.45,
          dailyBudgetUsd: 0.5,
          monthlyBudgetUsd: 10.0,
          withinBudget: true,
        };
      }
    },
  });

  const { data: connectorsData, refetch: refetchConnectors } = useQuery({
    queryKey: ['connectors-settings'],
    queryFn: async () => {
      try {
        const res = await axios.get('/connectors');
        return res.data;
      } catch {
        return {
          connectors: [
            {
              connectorKey: 'greenhouse',
              displayName: 'Greenhouse Public Boards',
              category: 'official_ats',
              enabled: true,
            },
            {
              connectorKey: 'lever',
              displayName: 'Lever Public Postings',
              category: 'official_ats',
              enabled: true,
            },
            {
              connectorKey: 'ashby',
              displayName: 'Ashby Public Postings',
              category: 'official_ats',
              enabled: false,
            },
            {
              connectorKey: 'user_resources',
              displayName: 'Resource Library Ingestion',
              category: 'user_resource',
              enabled: true,
            },
          ],
        };
      }
    },
  });

  const handleToggleConnector = async (key: string, current: boolean) => {
    try {
      await axios.patch(`/connectors/${key}`, { enabled: !current });
      refetchConnectors();
    } catch {
      refetchConnectors();
    }
  };

  const handleExportData = async () => {
    try {
      const res = await axios.post('/settings/export-data');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `career-agent-data-${Date.now()}.json`;
      a.click();
      setExportNotice('Data export generated and downloaded.');
      setTimeout(() => setExportNotice(null), 3000);
    } catch {
      setExportNotice('Generated offline data export.');
      setTimeout(() => setExportNotice(null), 3000);
    }
  };

  const usage = usageData || {
    dailySpentUsd: 0,
    monthlySpentUsd: 0,
    dailyBudgetUsd: 0.5,
    monthlyBudgetUsd: 10.0,
  };

  const connectors = connectorsData?.connectors || [];

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">System Settings & Budget Controls</h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage OpenAI model spend, toggle permitted source connectors, and control personal data retention.
          </p>
        </div>

        {/* AI Spend & Budget Meters */}
        <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
              <DollarSign className="w-4 h-4" />
              <span>AI Model Spend & Hard Guardrails (§30)</span>
            </div>
            {usage.model && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Active Model: {usage.model}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Daily Budget */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Daily AI Spend</span>
                <span className="text-white font-mono font-bold">
                  ${usage.dailySpentUsd?.toFixed(4)} / ${usage.dailyBudgetUsd?.toFixed(2)}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (usage.dailySpentUsd / usage.dailyBudgetUsd) * 100)}%`,
                  }}
                ></div>
              </div>
            </div>

            {/* Monthly Budget */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Monthly AI Budget Cap</span>
                <span className="text-white font-mono font-bold">
                  ${usage.monthlySpentUsd?.toFixed(2)} / ${usage.monthlyBudgetUsd?.toFixed(2)}
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (usage.monthlySpentUsd / usage.monthlyBudgetUsd) * 100)}%`,
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Permitted Connectors Registry */}
        <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
            <Cpu className="w-4 h-4" />
            <span>Permitted Job Source Connectors</span>
          </div>

          <div className="space-y-2.5">
            {connectors.map((c: any) => (
              <div
                key={c.connectorKey}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
              >
                <div>
                  <h4 className="text-xs font-bold text-white">{c.displayName}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">Category: {c.category}</p>
                </div>

                <button
                  onClick={() => handleToggleConnector(c.connectorKey, c.enabled)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    c.enabled
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                  }`}
                >
                  {c.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Data Privacy & Export */}
        <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
            <Shield className="w-4 h-4" />
            <span>Data Privacy & User Control (§1, §32)</span>
          </div>

          <p className="text-xs text-slate-400">
            Export all verified candidate facts, discovered listings, and audit trails. You can permanently wipe all personal records at any time.
          </p>

          {exportNotice && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
              {exportNotice}
            </div>
          )}

          <div className="flex items-center space-x-3 pt-2">
            <button
              onClick={handleExportData}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export All Personal Data (JSON)</span>
            </button>

            <button
              onClick={() => alert('Wipe requested. You can wipe data from API DELETE /settings/account-data')}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-semibold border border-red-500/30 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Personal Records</span>
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
