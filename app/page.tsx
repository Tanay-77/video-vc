'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '../components/Header';
import { Project } from '../lib/types';
import { listProjects, saveProject, deleteProject } from '../lib/store';
import { createSampleProject } from '../lib/sample';
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

  const handleLoadSample = () => {
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
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 sm:px-6 space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-3 py-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-700/50 mb-2">
            <span>Next-Gen Collaborative Video VCS</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            video-vc
          </h1>
          <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-400">
            Git-style version control for multi-track video editing. Create snapshots, branch variations,
            and review timeline changes in real-time across browser tabs using BroadcastChannel and IndexedDB.
          </p>
        </div>

        {/* Action Cards: Create New or Load Sample */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Project Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md hover:border-slate-700 transition flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-lg mb-4 border border-indigo-500/30">
                +
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Create New Project</h2>
              <p className="text-xs text-slate-400 mb-4">
                Start a fresh multi-track video project with an empty base timeline and your own media pool.
              </p>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-3">
              <input
                type="text"
                placeholder="Project title (e.g. Cinematic Trailer)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold rounded-lg transition shadow-md"
              >
                Create Project &amp; Open Lead &rarr;
              </button>
            </form>
          </div>

          {/* Load Sample Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md hover:border-slate-700 transition flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold text-lg mb-4 border border-purple-500/30">
                ★
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Load Sample Project</h2>
              <p className="text-xs text-slate-400 mb-4">
                Instantly load <strong>Summer Reel 2026</strong> pre-populated with 4 media assets, base snapshot,
                collaborator variation on V2 overlay, and an open review request.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] text-slate-500 space-y-1 font-mono bg-slate-950 p-2.5 rounded border border-slate-800">
                <div>&bull; Tracks: V2 (Overlay), V1 (Primary), A1 (Audio), CC</div>
                <div>&bull; Includes pending variation &amp; review request</div>
              </div>
              <button
                type="button"
                onClick={handleLoadSample}
                className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs sm:text-sm font-semibold rounded-lg transition shadow-md"
              >
                Load Sample Project &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* Existing Projects List */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Saved Projects</span>
              <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                {mounted ? projects.length : 0}
              </span>
            </h2>
            <button
              onClick={refreshList}
              className="text-xs text-slate-400 hover:text-white transition"
            >
              Refresh
            </button>
          </div>

          {!mounted || projects.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No projects found in localStorage yet. Create a new one or load the sample above!
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-850/50 -mx-2 px-2 rounded-lg transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200 text-sm">{proj.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">id: {proj.id}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
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
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-700/60 transition shadow-sm"
                    >
                      Open as Lead &rarr;
                    </Link>
                    <Link
                      href={`/join/${proj.id}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 transition shadow-sm"
                    >
                      Open as Collaborator &rarr;
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(proj.id, proj.name)}
                      className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-slate-800 transition"
                      title="Delete project"
                    >
                      ✕
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
