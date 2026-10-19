import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  User,
  GraduationCap,
  Code,
  FolderGit2,
  CheckCircle,
  AlertCircle,
  Plus,
  ShieldCheck,
  Building,
  MapPin,
} from 'lucide-react';
import Layout from '../components/Layout';
import axios from '../api/client';

export default function Profile() {
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const { data: profileData, refetch: refetchProfile } = useQuery({
    queryKey: ['candidate-profile'],
    queryFn: async () => {
      try {
        const res = await axios.get('/profile');
        return res.data;
      } catch {
        return {
          fullName: 'Shiva Kumar',
          email: 'shiva@example.com',
          phone: '+91 98765 43210',
          city: 'Hyderabad',
          country: 'India',
          degree: 'Bachelor of Technology (B.Tech)',
          branch: 'Electrical & Electronics Engineering (EEE)',
          graduationYear: 2027,
          headline: 'Aspiring Software & Systems Engineer (B.Tech EEE 2027)',
          summary:
            'Electrical & Electronics Engineering student with strong full-stack skills in React, Node.js, and PostgreSQL, alongside core electrical engineering competencies in power systems and circuit analysis.',
        };
      }
    },
  });

  const { data: factsData, refetch: refetchFacts } = useQuery({
    queryKey: ['candidate-facts', activeCategory],
    queryFn: async () => {
      try {
        const params: any = {};
        if (activeCategory !== 'ALL') params.category = activeCategory;
        const res = await axios.get('/profile/facts', { params });
        return res.data;
      } catch {
        return [
          {
            id: 'fact-1',
            category: 'EDUCATION',
            label: 'Degree & Branch',
            valueJson: 'B.Tech Electrical & Electronics Engineering, JNTU Hyderabad (2027)',
            verifiedByUser: true,
          },
          {
            id: 'fact-2',
            category: 'SKILL',
            label: 'JavaScript / TypeScript & Node.js',
            valueJson: { level: 'Proficient', years: 2 },
            verifiedByUser: true,
          },
          {
            id: 'fact-3',
            category: 'SKILL',
            label: 'React & Frontend Development',
            valueJson: { level: 'Proficient', years: 2 },
            verifiedByUser: true,
          },
          {
            id: 'fact-4',
            category: 'SKILL',
            label: 'SQL & PostgreSQL Database Modeling',
            valueJson: { level: 'Intermediate' },
            verifiedByUser: true,
          },
          {
            id: 'fact-5',
            category: 'SKILL',
            label: 'MATLAB / Simulink & Electrical Power Systems',
            valueJson: { level: 'Academic Coursework' },
            verifiedByUser: true,
          },
          {
            id: 'fact-6',
            category: 'PROJECT',
            label: 'Full-Stack Student Resource Portal',
            valueJson: { techStack: ['React', 'Node.js', 'PostgreSQL'], liveUrl: 'https://github.com/example/portal' },
            verifiedByUser: true,
          },
        ];
      }
    },
  });

  const handleToggleVerify = async (factId: string, current: boolean) => {
    try {
      await axios.patch(`/profile/facts/${factId}`, { verifiedByUser: !current });
      refetchFacts();
    } catch {
      refetchFacts();
    }
  };

  const profile = profileData || {};
  const facts = Array.isArray(factsData) ? factsData : [];

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Candidate Profile & Verified Facts Library</h1>
          <p className="text-xs text-slate-400 mt-1">
            Maintain verified facts with evidence provenance. Only user-confirmed facts can be included in generated resumes and outreach.
          </p>
        </div>

        {/* Profile Card */}
        <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-lg">
                {profile.fullName?.charAt(0) || 'S'}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{profile.fullName || 'Candidate Name'}</h2>
                <p className="text-xs text-slate-400">{profile.headline}</p>
              </div>
            </div>

            <div className="flex items-center space-x-4 text-xs text-slate-400">
              <span className="flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                <span>{profile.city}, {profile.country}</span>
              </span>
              <span className="flex items-center space-x-1">
                <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
                <span>Batch {profile.graduationYear}</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500 font-semibold block">Academic Degree</span>
              <span className="text-slate-200 font-medium">{profile.degree}</span>
            </div>
            <div>
              <span className="text-slate-500 font-semibold block">Engineering Branch</span>
              <span className="text-slate-200 font-medium">{profile.branch}</span>
            </div>
          </div>
        </div>

        {/* Facts Library */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Verified Evidence Facts</h2>
              <p className="text-xs text-slate-400">All claims used in tailored documents require explicit candidate confirmation.</p>
            </div>

            {/* Category Filter */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              {['ALL', 'SKILL', 'PROJECT', 'EDUCATION'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 rounded-lg font-medium transition ${
                    activeCategory === cat
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {facts.map((fact: any) => (
              <div
                key={fact.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                      {fact.category}
                    </span>
                    <h4 className="text-xs font-bold text-white">{fact.label}</h4>
                  </div>
                  <div className="text-xs text-slate-400">
                    {typeof fact.valueJson === 'string'
                      ? fact.valueJson
                      : JSON.stringify(fact.valueJson)}
                  </div>
                </div>

                <button
                  onClick={() => handleToggleVerify(fact.id, fact.verifiedByUser)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    fact.verifiedByUser
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{fact.verifiedByUser ? 'Verified by You' : 'Unconfirmed'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
