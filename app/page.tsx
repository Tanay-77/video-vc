'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Film, Trash2 } from 'lucide-react';
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
          author: 'Alex (Lead)',
          message: 'Initial cut',
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
    <div className="min-h-screen flex flex-col bg-[#000000] text-[#ffffff]">
      <Header />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 sm:px-6 space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-3 py-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[#1c1c20] text-[#8e8e93] border border-[#222226] mb-2">
            <span>Next-Gen Collaborative Video VCS</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#ffffff]">
            video-vc
          </h1>
          <p className="max-w-2xl mx-auto text-sm sm:text-base text-[#8e8e93]">
            Git-style version control for multi-track video editing. Create snapshots, variations,
            drop .mp4/.mp3/.wav files, and preview playback seamlessly across browser tabs.
          </p>
        </div>

        {/* Action Cards: Create New or Load Sample */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Project Card */}
          <div className="bg-[#121214] border border-[#222226] rounded-2xl p-6 hover:border-[#2c2c30] transition flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#1c1c20] text-[#8e8e93] flex items-center justify-center font-bold mb-4 border border-[#222226]">
                <Plus className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-[#ffffff] mb-1">Create New Project</h2>
              <p className="text-xs text-[#8e8e93] mb-4">
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
                className="w-full bg-[#000000] border border-[#222226] rounded-xl px-3.5 py-2.5 text-sm text-[#ffffff] placeholder-[#8e8e93]/60 focus:outline-none focus:border-[#5b8def]"
              />
              <button
                type="submit"
                className="w-full py-2.5 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] text-xs sm:text-sm font-semibold rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <span>Create Project &amp; Open Lead</span>
                <span>&rarr;</span>
              </button>
            </form>
          </div>

          {/* Load Sample Card */}
          <div className="bg-[#121214] border border-[#222226] rounded-2xl p-6 hover:border-[#2c2c30] transition flex flex-col justify-between space-y-4">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#1c1c20] text-[#8e8e93] flex items-center justify-center font-bold mb-4 border border-[#222226]">
                <Film className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-[#ffffff] mb-1">Load Demo Project</h2>
              <p className="text-xs text-[#8e8e93]">
                Instantly load <strong>Summer Reel 2026</strong> — pre-configured with snapshots, variations, multi-track cuts, and an open review request to test collaborative VCS.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] text-[#8e8e93] space-y-1 font-mono bg-[#000000] p-2.5 rounded-xl border border-[#222226]">
                <div>&bull; Multi-track cut: Drone, Sunset &amp; Synthwave</div>
                <div>&bull; Includes Jordan&apos;s Surfing Cut variation &amp; review diff</div>
              </div>
              <button
                type="button"
                onClick={handleLoadSummerReel}
                className="w-full py-2.5 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] text-xs sm:text-sm font-semibold rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <Film className="w-3.5 h-3.5" />
                <span>Load Summer Reel 2026 (Demo Project) &rarr;</span>
              </button>
            </div>
          </div>
        </div>

        {/* Existing Projects List */}
        <div className="bg-[#121214] border border-[#222226] rounded-2xl p-6">
          <div className="flex items-center justify-between pb-4 border-b border-[#222226] mb-4">
            <h2 className="text-base font-bold text-[#ffffff] flex items-center gap-2">
              <span>Saved Projects</span>
              <span className="text-xs bg-[#1c1c20] text-[#8e8e93] px-2.5 py-0.5 rounded-full font-mono border border-[#222226]">
                {mounted ? projects.length : 0}
              </span>
            </h2>
            <button
              onClick={refreshList}
              className="text-xs text-[#8e8e93] hover:text-[#ffffff] transition"
            >
              Refresh
            </button>
          </div>

          {!mounted || projects.length === 0 ? (
            <div className="text-center py-8 text-[#8e8e93] text-xs">
              No projects found in localStorage yet. Create a new one or click &quot;Load Sample Project&quot; above!
            </div>
          ) : (
            <div className="divide-y divide-[#222226]">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#1a1a1e]/40 -mx-2 px-3 rounded-xl transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#ffffff] text-sm">{proj.name}</span>
                      <span className="text-[10px] text-[#8e8e93] font-mono">id: {proj.id}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#8e8e93]">
                      <span>{proj.snapshots?.length || 0} {proj.snapshots?.length === 1 ? 'snapshot' : 'snapshots'}</span>
                      <span>&bull;</span>
                      <span>{proj.variations?.length || 0} {proj.variations?.length === 1 ? 'variation' : 'variations'}</span>
                      <span>&bull;</span>
                      <span>{proj.media?.length || 0} media</span>
                      {proj.reviews?.some((r) => r.status === 'open') && (
                        <span className="text-[#c9973a] font-medium">
                          &bull; {proj.reviews.filter((r) => r.status === 'open').length} open {proj.reviews.filter((r) => r.status === 'open').length === 1 ? 'review' : 'reviews'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <Link
                      href={`/lead/${proj.id}`}
                      className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] border border-[#222226] transition"
                    >
                      Open as Lead &rarr;
                    </Link>
                    <Link
                      href={`/join/${proj.id}${proj.variations?.length === 0 ? '?new=1' : ''}`}
                      className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] border border-[#222226] transition"
                    >
                      Open as Collaborator &rarr;
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(proj.id, proj.name)}
                      className="p-1.5 text-[#8e8e93] hover:text-[#c9605f] rounded-full hover:bg-[#1a1a1e] transition"
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
