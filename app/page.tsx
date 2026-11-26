'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { Header } from '../components/Header';
import { Project } from '../lib/types';
import { listProjects, saveProject, deleteProject } from '../lib/store';
import { createSampleProject, createPlaceholderSampleProject } from '../lib/sample';
import { CHANNEL_NAME, SyncMessage } from '../lib/sync';

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [mounted, setMounted] = useState(false);

  const refreshList = () => {
    setProjects(listProjects());
  };

  useEffect(() => {
    setMounted(true);
    refreshList();

    if (typeof window === 'undefined') return;

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = (event: MessageEvent<SyncMessage>) => {
          refreshList();
        };
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }

    const handleStorage = () => refreshList();
    window.addEventListener('storage', handleStorage);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;

    const projectId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : `proj_${Date.now()}`;

    const newProject: Project = {
      id: projectId,
      name,
      media: [],
      snapshots: [
        {
          id: `snap_init_${Date.now()}`,
          parentId: null,
          author: 'Lead Editor',
          message: 'Initial project timeline',
          createdAt: new Date().toISOString(),
          timeline: {
            clips: [],
          },
        },
      ],
      variations: [],
      reviews: [],
    };

    saveProject(newProject);
    setNewProjectName('');
    refreshList();
    router.push(`/lead/${projectId}`);
  };

  // 'Load sample project' button: builds a timeline of 6 placeholder clips with no media (colored boxes only)
  const handleLoadSampleProject = () => {
    const sample = createPlaceholderSampleProject();
    saveProject(sample);
    refreshList();
    router.push(`/lead/${sample.id}`);
  };

  const handleLoadSummerReel = () => {
    const sample = createSampleProject();
    saveProject(sample);
    refreshList();
    router.push(`/lead/${sample.id}`);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete project "${name}"?`)) {
      deleteProject(id);
      refreshList();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0d] text-zinc-100">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 sm:px-6 space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-3 py-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#6e40c9]/20 text-[#a371f7] border border-[#6e40c9]/40 mb-2">
            <span>Next-Gen Collaborative Video VCS</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            video-vc
          </h1>
          <p className="max-w-2xl mx-auto text-sm sm:text-base text-zinc-400">
            Git-style version control for multi-track video editing. Create snapshots, branch variations,
            drop .mp4/.mp3/.wav files, and preview playback seamlessly across browser tabs.
          </p>
        </div>

        {/* Action Cards: Create New or Load Sample */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Project Card */}
          <div className="bg-[#131317] border border-[#22222a] rounded-2xl p-6 shadow-xl hover:border-[#323240] transition flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#0071e3]/15 text-[#0071e3] flex items-center justify-center font-bold mb-4 border border-[#0071e3]/30">
                <Plus className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Create New Project</h2>
              <p className="text-xs text-zinc-400 mb-4">
                Start a fresh multi-track video project with an empty base timeline, dropzone for media, and live player.
              </p>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-3">
              <input
                type="text"
                placeholder="Project title (e.g. Cinematic Trailer)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                required
                className="w-full bg-[#18181f] border border-[#2a2a36] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#0071e3]"
              />
              <button
                type="submit"
                className="w-full py-2.5 bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs sm:text-sm font-medium rounded-xl transition shadow-md flex items-center justify-center gap-1.5"
              >
                <span>Create Project &amp; Open Lead</span>
                <span>&rarr;</span>
              </button>
            </form>
          </div>

          {/* Load Sample Card */}
          <div className="bg-[#131317] border border-[#22222a] rounded-2xl p-6 shadow-xl hover:border-[#323240] transition flex flex-col justify-between space-y-4">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#6e40c9]/15 text-[#a371f7] flex items-center justify-center font-bold mb-4 border border-[#6e40c9]/30">
                <Sparkles className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Load Sample Project</h2>
              <p className="text-xs text-zinc-400">
                Builds a timeline of <strong>6 placeholder clips with no media</strong> (colored boxes only: 4 video scenes on V1 + 2 audio tracks on A1).
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] text-zinc-400 space-y-1 font-mono bg-[#0d0d10] p-2.5 rounded-xl border border-[#22222a]">
                <div>&bull; 6 placeholder clips with no media (colored boxes)</div>
                <div>&bull; 4 Video clips on V1 + 2 Audio clips on A1</div>
              </div>
              <button
                type="button"
                onClick={handleLoadSampleProject}
                className="w-full py-2.5 bg-[#6e40c9] hover:bg-[#8957e5] text-white text-xs sm:text-sm font-medium rounded-xl transition shadow-md flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Load Sample Project (6 Placeholder Clips) &rarr;</span>
              </button>
              <button
                type="button"
                onClick={handleLoadSummerReel}
                className="w-full py-2 bg-[#18181f] hover:bg-[#22222a] text-zinc-300 text-xs rounded-xl transition border border-[#2a2a36]"
              >
                Or Load Summer Reel 2026 (with variations &amp; review)
              </button>
            </div>
          </div>
        </div>

        {/* Existing Projects List */}
        <div className="bg-[#131317] border border-[#22222a] rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-[#22222a] mb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Saved Projects</span>
              <span className="text-xs bg-[#1f1f28] text-zinc-400 px-2.5 py-0.5 rounded-full font-mono border border-[#2a2a36]">
                {mounted ? projects.length : 0}
              </span>
            </h2>
            <button
              onClick={refreshList}
              className="text-xs text-zinc-400 hover:text-white transition"
            >
              Refresh
            </button>
          </div>

          {!mounted || projects.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-xs">
              No projects found in localStorage yet. Create a new one or click &quot;Load Sample Project&quot; above!
            </div>
          ) : (
            <div className="divide-y divide-[#1f1f28]">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#18181f]/60 -mx-2 px-3 rounded-xl transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-100 text-sm">{proj.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">id: {proj.id}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <span>{proj.snapshots?.length || 0} snapshot(s)</span>
                      <span>&bull;</span>
                      <span>{proj.variations?.length || 0} variation(s)</span>
                      <span>&bull;</span>
                      <span>{proj.media?.length || 0} media</span>
                      {proj.reviews?.some((r) => r.status === 'open') && (
                        <span className="text-amber-400 font-medium">
                          &bull; {proj.reviews.filter((r) => r.status === 'open').length} open review
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <Link
                      href={`/lead/${proj.id}`}
                      className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#5856d6]/20 hover:bg-[#5856d6]/30 text-[#a371f7] border border-[#5856d6]/40 transition shadow-sm"
                    >
                      Open as Lead &rarr;
                    </Link>
                    <Link
                      href={`/join/${proj.id}${proj.variations?.length === 0 ? '?new=1' : ''}`}
                      className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#34c759]/20 hover:bg-[#34c759]/30 text-[#34c759] border border-[#34c759]/40 transition shadow-sm"
                    >
                      Open as Collaborator &rarr;
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(proj.id, proj.name)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 rounded-full hover:bg-red-950/30 transition"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
