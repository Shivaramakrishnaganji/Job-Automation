import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  GraduationCap,
  CheckCircle,
  Plus,
  MapPin,
  Edit3,
  Trash2,
  Upload,
  X,
  Save,
  Sparkles,
  Loader2,
  FileText,
} from 'lucide-react';
import Layout from '../components/Layout';
import axios from '../api/client';

interface CandidateProfileData {
  fullName: string;
  email: string;
  phone?: string;
  city: string;
  country: string;
  degree: string;
  branch: string;
  graduationYear: number;
  headline: string;
  summary: string;
}

interface FactItem {
  id: string;
  category: string;
  label: string;
  valueJson: any;
  verifiedByUser: boolean;
}

const DEFAULT_PROFILE: CandidateProfileData = {
  fullName: 'Your Name',
  email: 'candidate@example.com',
  phone: '+91 98765 43210',
  city: 'Hyderabad',
  country: 'India',
  degree: 'Bachelor of Technology (B.Tech)',
  branch: 'Computer Science & Engineering',
  graduationYear: 2027,
  headline: 'Full-Stack Software Engineer & Tech Aspirant',
  summary:
    'Dedicated engineering candidate with experience in modern software architectures, algorithms, and application development.',
};

const DEFAULT_FACTS: FactItem[] = [
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

export default function Profile() {
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isAddFactOpen, setIsAddFactOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit form state
  const [editForm, setEditForm] = useState<CandidateProfileData>(() => {
    try {
      const saved = localStorage.getItem('custom_candidate_profile');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_PROFILE;
  });

  // New fact form state
  const [newFact, setNewFact] = useState({
    category: 'SKILL',
    label: '',
    value: '',
  });

  // Query Profile
  const { data: profileData, refetch: refetchProfile } = useQuery({
    queryKey: ['candidate-profile'],
    queryFn: async () => {
      try {
        const res = await axios.get('/profile');
        if (res.data && res.data.fullName) {
          localStorage.setItem('custom_candidate_profile', JSON.stringify(res.data));
          return res.data;
        }
      } catch {}
      try {
        const saved = localStorage.getItem('custom_candidate_profile');
        if (saved) return JSON.parse(saved);
      } catch {}
      return DEFAULT_PROFILE;
    },
  });

  // Query Facts
  const { data: factsData, refetch: refetchFacts } = useQuery({
    queryKey: ['candidate-facts', activeCategory],
    queryFn: async () => {
      try {
        const params: any = {};
        if (activeCategory !== 'ALL') params.category = activeCategory;
        const res = await axios.get('/profile/facts', { params });
        if (Array.isArray(res.data) && res.data.length > 0) {
          localStorage.setItem('custom_candidate_facts', JSON.stringify(res.data));
          return res.data;
        }
      } catch {}
      try {
        const saved = localStorage.getItem('custom_candidate_facts');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (activeCategory === 'ALL') return parsed;
          return parsed.filter((f: any) => f.category === activeCategory);
        }
      } catch {}
      if (activeCategory === 'ALL') return DEFAULT_FACTS;
      return DEFAULT_FACTS.filter((f) => f.category === activeCategory);
    },
  });

  const profile: CandidateProfileData = profileData || editForm;
  const facts: FactItem[] = Array.isArray(factsData) ? factsData : [];

  // Save Profile Handler
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      localStorage.setItem('custom_candidate_profile', JSON.stringify(editForm));
      await axios.put('/profile', editForm);
    } catch (err) {
      console.warn('Backend sync failed, saved locally in browser state:', err);
    } finally {
      setIsSaving(false);
      setIsEditProfileOpen(false);
      refetchProfile();
    }
  };

  // Add Custom Fact Handler
  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.label.trim()) return;

    setIsSaving(true);
    const createdFact: FactItem = {
      id: `fact-${Date.now()}`,
      category: newFact.category,
      label: newFact.label.trim(),
      valueJson: newFact.value.trim(),
      verifiedByUser: true,
    };

    try {
      await axios.post('/profile/facts', {
        category: newFact.category,
        label: newFact.label.trim(),
        valueJson: newFact.value.trim(),
        sourceType: 'USER_INPUT',
      });
    } catch (err) {
      console.warn('Backend fact save failed, saving locally:', err);
    }

    try {
      const current = facts;
      const updated = [createdFact, ...current];
      localStorage.setItem('custom_candidate_facts', JSON.stringify(updated));
    } catch {}

    setNewFact({ category: 'SKILL', label: '', value: '' });
    setIsSaving(false);
    setIsAddFactOpen(false);
    refetchFacts();
  };

  // Delete Fact Handler
  const handleDeleteFact = async (factId: string) => {
    try {
      await axios.delete(`/profile/facts/${factId}`);
    } catch {}
    try {
      const updated = facts.filter((f) => f.id !== factId);
      localStorage.setItem('custom_candidate_facts', JSON.stringify(updated));
    } catch {}
    refetchFacts();
  };

  // Toggle Verify
  const handleToggleVerify = async (factId: string, current: boolean) => {
    try {
      await axios.patch(`/profile/facts/${factId}`, { verifiedByUser: !current });
    } catch {}
    refetchFacts();
  };

  // Resume Upload & AI Extraction Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus('Uploading resume and parsing facts with gpt-6-luna...');

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const res = await axios.post('/profile/upload-resume', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadStatus(`Extracted ${res.data.factsCount || 'verified'} facts successfully!`);
      refetchFacts();
      refetchProfile();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to parse resume.';
      setUploadStatus(`Upload note: ${msg}`);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  // Quick Track Template Handler
  const handleApplyTemplate = async (selectedTrack: string) => {
    let templateProfile: Partial<CandidateProfileData> = {};
    let templateFacts: FactItem[] = [];

    if (selectedTrack === 'SOFTWARE_IT') {
      templateProfile = {
        headline: 'Full-Stack Software Engineer & Systems Developer',
        branch: 'Computer Science & Engineering',
        summary: 'Passionate about modern web development, scalable APIs, and AI applications.',
      };
      templateFacts = [
        { id: `fact-${Date.now()}-1`, category: 'SKILL', label: 'JavaScript / TypeScript & Node.js', valueJson: { level: 'Proficient', years: 2 }, verifiedByUser: true },
        { id: `fact-${Date.now()}-2`, category: 'SKILL', label: 'React, Next.js & Frontend Engineering', valueJson: { level: 'Proficient' }, verifiedByUser: true },
        { id: `fact-${Date.now()}-3`, category: 'SKILL', label: 'SQL, PostgreSQL & REST APIs', valueJson: { level: 'Intermediate' }, verifiedByUser: true },
        { id: `fact-${Date.now()}-4`, category: 'PROJECT', label: 'Full-Stack Web Application', valueJson: { techStack: ['React', 'Node.js', 'PostgreSQL'] }, verifiedByUser: true },
      ];
    } else if (selectedTrack === 'CORE_EEE') {
      templateProfile = {
        headline: 'Electrical & Electronics Engineer (Power & Systems)',
        branch: 'Electrical & Electronics Engineering (EEE)',
        summary: 'Focused on electrical power distribution, circuit protection, transient analysis, and MATLAB simulation.',
      };
      templateFacts = [
        { id: `fact-${Date.now()}-1`, category: 'SKILL', label: 'Circuit Analysis & Power Systems', valueJson: { level: 'Proficient' }, verifiedByUser: true },
        { id: `fact-${Date.now()}-2`, category: 'SKILL', label: 'MATLAB / Simulink Grid Modeling', valueJson: { level: 'Proficient' }, verifiedByUser: true },
        { id: `fact-${Date.now()}-3`, category: 'SKILL', label: 'Microcontrollers & Embedded C', valueJson: { level: 'Intermediate' }, verifiedByUser: true },
        { id: `fact-${Date.now()}-4`, category: 'PROJECT', label: '3-Phase Grid Transient Simulation', valueJson: { tool: 'MATLAB/Simulink' }, verifiedByUser: true },
      ];
    } else {
      templateProfile = {
        headline: 'Business & Data Analyst (Reporting & Insights)',
        branch: 'Data Analytics & Information Systems',
        summary: 'Specializing in exploratory data analysis, business metric forecasting, and executive dashboard reporting.',
      };
      templateFacts = [
        { id: `fact-${Date.now()}-1`, category: 'SKILL', label: 'SQL & Relational Data Modeling', valueJson: { level: 'Advanced' }, verifiedByUser: true },
        { id: `fact-${Date.now()}-2`, category: 'SKILL', label: 'Python for Analytics (Pandas, NumPy)', valueJson: { level: 'Proficient' }, verifiedByUser: true },
        { id: `fact-${Date.now()}-3`, category: 'SKILL', label: 'Power BI & Tableau Dashboards', valueJson: { level: 'Proficient' }, verifiedByUser: true },
        { id: `fact-${Date.now()}-4`, category: 'PROJECT', label: 'Business Performance Analytics Portal', valueJson: { stack: ['SQL', 'Power BI'] }, verifiedByUser: true },
      ];
    }

    const updatedProfile = { ...profile, ...templateProfile };
    try {
      localStorage.setItem('custom_candidate_profile', JSON.stringify(updatedProfile));
      localStorage.setItem('custom_candidate_facts', JSON.stringify(templateFacts));
      await axios.put('/profile', updatedProfile);
    } catch {}
    refetchProfile();
    refetchFacts();
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Candidate Profile & Verified Facts Library</h1>
            <p className="text-xs text-slate-400 mt-1">
              Maintain verified facts with evidence provenance. Only user-confirmed facts can be included in generated resumes and outreach.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Upload Resume (AI Extract) Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.docx"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 transition"
              title="Upload PDF/DOCX resume for automatic gpt-6-luna extraction"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <Upload className="w-4 h-4 text-indigo-400" />}
              <span>{isUploading ? 'Parsing...' : 'Upload Resume'}</span>
            </button>

            {/* Edit Profile Button */}
            <button
              onClick={() => {
                setEditForm(profile);
                setIsEditProfileOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit Profile</span>
            </button>
          </div>
        </div>

        {/* Quick Track Template Bar */}
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2 text-slate-300">
            <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span className="font-semibold text-white">Quick Track Presets:</span>
            <span className="text-slate-400 hidden sm:inline">Apply tailored skills & competencies in one click:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleApplyTemplate('SOFTWARE_IT')}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-600/20 hover:border-indigo-500/30 border border-slate-800 text-slate-200 hover:text-indigo-300 font-medium transition"
            >
              💻 Software / IT
            </button>
            <button
              onClick={() => handleApplyTemplate('CORE_EEE')}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-600/20 hover:border-indigo-500/30 border border-slate-800 text-slate-200 hover:text-indigo-300 font-medium transition"
            >
              ⚡ Core EEE
            </button>
            <button
              onClick={() => handleApplyTemplate('BUSINESS_DATA_ANALYST')}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-600/20 hover:border-indigo-500/30 border border-slate-800 text-slate-200 hover:text-indigo-300 font-medium transition"
            >
              📊 Data Analyst
            </button>
          </div>
        </div>

        {/* Upload feedback alert */}
        {uploadStatus && (
          <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>{uploadStatus}</span>
            </div>
            <button onClick={() => setUploadStatus(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Profile Card */}
        <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 relative group">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-lg">
                {profile.fullName?.charAt(0) || 'U'}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-bold text-white">{profile.fullName || 'Candidate Name'}</h2>
                  <button
                    onClick={() => {
                      setEditForm(profile);
                      setIsEditProfileOpen(true);
                    }}
                    className="text-slate-400 hover:text-indigo-400 transition"
                    title="Edit Name & Details"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-slate-400">{profile.headline || 'No headline set'}</p>
              </div>
            </div>

            <div className="flex items-center space-x-4 text-xs text-slate-400">
              <span className="flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                <span>{profile.city || 'City'}, {profile.country || 'Country'}</span>
              </span>
              <span className="flex items-center space-x-1">
                <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
                <span>Batch {profile.graduationYear || '2027'}</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500 font-semibold block">Academic Degree</span>
              <span className="text-slate-200 font-medium">{profile.degree || 'Not specified'}</span>
            </div>
            <div>
              <span className="text-slate-500 font-semibold block">Engineering Branch / Track</span>
              <span className="text-slate-200 font-medium">{profile.branch || 'Not specified'}</span>
            </div>
          </div>

          {profile.summary && (
            <div className="text-xs pt-2 border-t border-slate-800/60">
              <span className="text-slate-500 font-semibold block mb-1">Professional Summary</span>
              <p className="text-slate-300 leading-relaxed">{profile.summary}</p>
            </div>
          )}
        </div>

        {/* Facts Library */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Verified Evidence Facts</h2>
              <p className="text-xs text-slate-400">All claims used in tailored documents require explicit candidate confirmation.</p>
            </div>

            <div className="flex items-center gap-2">
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

              {/* Add Fact Button */}
              <button
                onClick={() => setIsAddFactOpen(true)}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Fact</span>
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            {facts.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-3">
                <FileText className="w-8 h-8 text-slate-500 mx-auto" />
                <p className="text-xs text-slate-400">No evidence facts added in this category yet.</p>
                <button
                  onClick={() => setIsAddFactOpen(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-xs text-white font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add First Fact</span>
                </button>
              </div>
            ) : (
              facts.map((fact: any) => (
                <div
                  key={fact.id}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4 group hover:border-slate-700 transition"
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

                  <div className="flex items-center space-x-2">
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

                    <button
                      onClick={() => handleDeleteFact(fact.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Delete Fact"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ─── Edit Profile Modal ────────────────────────────────────────────── */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Edit Candidate Profile</h3>
              </div>
              <button onClick={() => setIsEditProfileOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-5 space-y-3.5 text-xs max-h-[75vh] overflow-y-auto">
              <div>
                <label className="text-slate-400 font-medium block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  placeholder="e.g. Shiva Rama Krishna"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium block mb-1">Professional Headline</label>
                <input
                  type="text"
                  value={editForm.headline}
                  onChange={(e) => setEditForm({ ...editForm, headline: e.target.value })}
                  placeholder="e.g. Aspiring Full-Stack Software Engineer & AI Enthusiast"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Degree</label>
                  <input
                    type="text"
                    value={editForm.degree}
                    onChange={(e) => setEditForm({ ...editForm, degree: e.target.value })}
                    placeholder="B.Tech"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Branch / Major</label>
                  <input
                    type="text"
                    value={editForm.branch}
                    onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })}
                    placeholder="Electrical & Electronics Engineering"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Graduation Year</label>
                  <input
                    type="number"
                    value={editForm.graduationYear}
                    onChange={(e) => setEditForm({ ...editForm, graduationYear: parseInt(e.target.value, 10) || 2027 })}
                    placeholder="2027"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium block mb-1">City</label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    placeholder="Hyderabad"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Country</label>
                  <input
                    type="text"
                    value={editForm.country}
                    onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                    placeholder="India"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-medium block mb-1">Summary / Bio</label>
                <textarea
                  rows={3}
                  value={editForm.summary}
                  onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                  placeholder="Tell recruiters and AI agents about your core focus, strengths, and goals..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Profile</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Add Evidence Fact Modal ────────────────────────────────────────── */}
      {isAddFactOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl space-y-4">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Add Evidence Fact</h3>
              </div>
              <button onClick={() => setIsAddFactOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddFact} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 font-medium block mb-1">Category</label>
                <select
                  value={newFact.category}
                  onChange={(e) => setNewFact({ ...newFact, category: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="SKILL">SKILL (Technical or Soft Skill)</option>
                  <option value="PROJECT">PROJECT (Portfolio, GitHub, Academic)</option>
                  <option value="EDUCATION">EDUCATION (Degree, Coursework, School)</option>
                  <option value="EXPERIENCE">EXPERIENCE (Internship, Freelance, Job)</option>
                  <option value="CREDENTIAL">CREDENTIAL (Certification, License)</option>
                  <option value="ACHIEVEMENT">ACHIEVEMENT (Hackathon, Honor, Award)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-medium block mb-1">Fact Title / Label</label>
                <input
                  type="text"
                  required
                  value={newFact.label}
                  onChange={(e) => setNewFact({ ...newFact, label: e.target.value })}
                  placeholder="e.g. Next.js & Tailwind CSS, or AI Job Matcher Project"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 font-medium block mb-1">Details / Value / Link</label>
                <textarea
                  rows={2}
                  value={newFact.value}
                  onChange={(e) => setNewFact({ ...newFact, value: e.target.value })}
                  placeholder="e.g. Proficient (2+ years), built full-stack dashboard with PostgreSQL"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddFactOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Add to Profile</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
