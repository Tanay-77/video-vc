'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { TimelineView } from '@/components/TimelineView';
import { PlayerView } from '@/components/PlayerView';
import { Dropzone } from '@/components/Dropzone';
import { DiffViewer } from '@/components/DiffViewer';
import { useProject } from '@/lib/sync';
import { Clip, MediaItem, Snapshot, Timeline } from '@/lib/types';
import { buildTimeline, buildPlaceholderSampleTimeline } from '@/lib/buildTimeline';

export default function LeadEditorPage() {
  const params = useParams();
  const projectId = (params?.id as string) || '';

  const { project, setProject, isLoading } = useProject(projectId);

  // Snapshot commit form state
  const [snapshotMsg, setSnapshotMsg] = useState('');
  const [snapshotAuthor, setSnapshotAuthor] = useState('Lead Editor (Alex)');
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  // Playhead scrubber time shared between player and timeline
  const [playerTime, setPlayerTime] = useState<number>(0);

  // Selected review for diff view
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [requestChangeNote, setRequestChangeNote] = useState('');
  const [activeReviewAction, setActiveReviewAction] = useState<string | null>(null);

  const latestSnapshot = project && project.snapshots.length > 0
    ? project.snapshots[project.snapshots.length - 1]
    : null;

  // Active base timeline for lead is the latest snapshot timeline, or empty if none
  const activeTimeline = latestSnapshot?.timeline || { clips: [] };

  // Handler to update the active timeline (functional state update prevents stale closures)
  const handleUpdateActiveTimeline = useCallback((updatedTimeline: Timeline) => {
    setProject((prev) => {
      if (!prev) return prev;
      const currentLatest = prev.snapshots.length > 0
        ? prev.snapshots[prev.snapshots.length - 1]
        : null;

      if (!currentLatest) {
        const initialSnap: Snapshot = {
          id: `snap_${Date.now()}`,
          parentId: null,
          author: snapshotAuthor || 'Lead Editor',
          message: 'Initial cut',
          createdAt: new Date().toISOString(),
          timeline: updatedTimeline,
        };
        return {
          ...prev,
          snapshots: [initialSnap],
        };
      }

      const updatedSnapshots = [...prev.snapshots];
      updatedSnapshots[updatedSnapshots.length - 1] = {
        ...currentLatest,
        timeline: updatedTimeline,
      };

      return {
        ...prev,
        snapshots: updatedSnapshots,
      };
    });
  }, [setProject, snapshotAuthor]);

  // Auto-build timeline from uploaded media items (videos on V1, audio on A1)
  const handleAutoBuildTimeline = useCallback((items: MediaItem[]) => {
    const mediaToBuild = items && items.length > 0 ? items : (project?.media || []);
    const generatedTimeline = buildTimeline(mediaToBuild);
    handleUpdateActiveTimeline(generatedTimeline);
    setPlayerTime(0);
  }, [handleUpdateActiveTimeline, project?.media]);

  // If media items already exist in the project but the timeline is empty (e.g. from an earlier upload or page reload),
  // auto-build the timeline once so the clips immediately show up on screen!
  useEffect(() => {
    if (project && project.media.length > 0 && activeTimeline.clips.length === 0) {
      const generatedTimeline = buildTimeline(project.media);
      handleUpdateActiveTimeline(generatedTimeline);
    }
  }, [project, activeTimeline.clips.length, handleUpdateActiveTimeline]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading project...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Header role="Lead editor" />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <h2 className="text-xl font-bold text-white">Project Not Found</h2>
          <p className="text-sm text-slate-400">
            Could not find a project with ID &quot;{projectId}&quot; in local storage.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition"
          >
            &larr; Return to Home
          </Link>
        </main>
      </div>
    );
  }

  // 'Load sample project' button: builds a timeline of 6 placeholder clips with no media (colored boxes only)
  const handleLoadPlaceholderSample = () => {
    const placeholderTimeline = buildPlaceholderSampleTimeline();
    handleUpdateActiveTimeline(placeholderTimeline);
    setPlayerTime(0);
  };

  // Handler to create a formal new Snapshot (git commit)
  const handleCreateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = snapshotMsg.trim();
    if (!msg) return;

    const newSnapshot: Snapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      parentId: latestSnapshot ? latestSnapshot.id : null,
      author: snapshotAuthor.trim() || 'Lead Editor',
      message: msg,
      createdAt: new Date().toISOString(),
      timeline: {
        clips: latestSnapshot ? JSON.parse(JSON.stringify(latestSnapshot.timeline.clips)) : [],
      },
    };

    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        snapshots: [...prev.snapshots, newSnapshot],
      };
    });

    setSnapshotMsg('');
    setIsCreatingSnapshot(false);
  };

  // Handler to add media items to project AND auto-sequence them onto the timeline
  const handleMediaAdded = (newItems: MediaItem[]) => {
    setProject((prev) => {
      if (!prev) return prev;
      const allMedia = [...prev.media, ...newItems];
      const generatedTimeline = buildTimeline(allMedia);

      let updatedSnapshots = [...prev.snapshots];
      if (updatedSnapshots.length === 0) {
        updatedSnapshots = [{
          id: `snap_${Date.now()}`,
          parentId: null,
          author: snapshotAuthor || 'Lead Editor',
          message: 'Initial cut',
          createdAt: new Date().toISOString(),
          timeline: generatedTimeline,
        }];
      } else {
        updatedSnapshots[updatedSnapshots.length - 1] = {
          ...updatedSnapshots[updatedSnapshots.length - 1],
          timeline: generatedTimeline,
        };
      }

      return {
        ...prev,
        media: allMedia,
        snapshots: updatedSnapshots,
      };
    });
    setPlayerTime(0);
  };

  // Handler to Combine / Merge Variation
  const handleCombineVariation = (reviewId: string) => {
    const review = project.reviews.find((r) => r.id === reviewId);
    if (!review) return;

    const variation = project.variations.find((v) => v.id === review.variationId);
    if (!variation) return;

    const mergeSnapshot: Snapshot = {
      id: `snap_merge_${Date.now()}`,
      parentId: latestSnapshot ? latestSnapshot.id : null,
      author: `${project.name} Lead`,
      message: `Combined variation: "${variation.name}" (${review.message})`,
      createdAt: new Date().toISOString(),
      timeline: JSON.parse(JSON.stringify(variation.timeline)),
    };

    const updatedReviews = project.reviews.map((r) =>
      r.id === reviewId ? { ...r, status: 'combined' as const } : r
    );

    const updatedVariations = project.variations.map((v) =>
      v.id === variation.id ? { ...v, status: 'combined' as const } : v
    );

    setProject({
      ...project,
      snapshots: [...project.snapshots, mergeSnapshot],
      reviews: updatedReviews,
      variations: updatedVariations,
    });

    setSelectedReviewId(null);
  };

  // Handler to Request Changes on Review
  const handleRequestChanges = (reviewId: string) => {
    const note = requestChangeNote.trim();
    if (!note) return;

    const review = project.reviews.find((r) => r.id === reviewId);
    if (!review) return;

    const updatedReviews = project.reviews.map((r) =>
      r.id === reviewId ? { ...r, status: 'changes-requested' as const, note } : r
    );

    const updatedVariations = project.variations.map((v) =>
      v.id === review.variationId ? { ...v, status: 'editing' as const } : v
    );

    setProject({
      ...project,
      reviews: updatedReviews,
      variations: updatedVariations,
    });

    setRequestChangeNote('');
    setActiveReviewAction(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header projectId={project.id} projectName={project.name} role="Lead editor" />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 space-y-6">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">{project.name}</h1>
              <span className="text-xs bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-mono">
                Project Lead Control
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Active Head: <span className="font-mono text-slate-300">{latestSnapshot?.id || 'none'}</span> &bull;{' '}
              {latestSnapshot?.message || 'No snapshot'}
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* 'Load sample project' button: builds 6 placeholder clips with no media */}
            <button
              type="button"
              onClick={handleLoadPlaceholderSample}
              className="px-3 py-1.5 bg-purple-900/80 hover:bg-purple-800 text-purple-200 text-xs font-semibold rounded-lg transition border border-purple-700/60 shadow-sm flex items-center gap-1.5"
              title="Build a timeline of 6 placeholder clips with no media (colored boxes only)"
            >
              <span>★ Load 6-Clip Sample</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCreatingSnapshot(!isCreatingSnapshot)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition shadow-sm flex items-center gap-1.5"
            >
              <span>+ Create Snapshot (Commit)</span>
            </button>

            <Link
              href={`/join/${project.id}`}
              target="_blank"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition border border-slate-700 flex items-center gap-1.5"
              title="Open Collaborator view in a new tab to test live BroadcastChannel sync"
            >
              <span>Open Collaborator in New Tab &#8599;</span>
            </Link>
          </div>
        </div>

        {/* Create Snapshot Drawer / Panel */}
        {isCreatingSnapshot && (
          <form
            onSubmit={handleCreateSnapshot}
            className="p-4 bg-slate-900 border border-indigo-700/60 rounded-xl space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-semibold text-indigo-300">New Snapshot (Commit)</span>
              <button
                type="button"
                onClick={() => setIsCreatingSnapshot(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕ Cancel
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Author Name</label>
                <input
                  type="text"
                  value={snapshotAuthor}
                  onChange={(e) => setSnapshotAuthor(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Snapshot Message / Changelog</label>
                <input
                  type="text"
                  placeholder="e.g. Cut opening drone shot to 4s and color graded"
                  value={snapshotMsg}
                  onChange={(e) => setSnapshotMsg(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition"
            >
              Save Snapshot
            </button>
          </form>
        )}

        {/* Live Preview Player View */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span>Preview Player</span>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                V1 Video + A1 Audio + Gaps
              </span>
            </h2>
            <span className="text-xs text-slate-500">
              Plays V1 clips, A1 audio elements, and shows black frame in gaps
            </span>
          </div>

          <PlayerView
            timeline={activeTimeline}
            time={playerTime}
            onTime={setPlayerTime}
          />
        </section>

        {/* Master Timeline View */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              Lead Master Timeline (Head)
            </h2>
            <span className="text-xs text-slate-500">
              Directly editable &bull; Live synced with peer tabs
            </span>
          </div>

          <TimelineView
            timeline={activeTimeline}
            mediaList={project.media}
            editable={true}
            onUpdateTimeline={handleUpdateActiveTimeline}
            title="Active Assembly Cut"
          />
        </section>

        {/* Dropzone & Media Bin */}
        <section>
          <Dropzone
            mediaItems={project.media}
            onMediaAdded={handleMediaAdded}
            onBuildTimeline={handleAutoBuildTimeline}
          />
        </section>

        {/* Review Requests & Variations from Collaborators */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Incoming Review Requests</span>
                <span className="text-xs bg-amber-950 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded-full font-mono">
                  {project.reviews.filter((r) => r.status === 'open').length} Open
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Review, inspect timeline diffs, and combine/merge variations proposed by collaborators
              </p>
            </div>
          </div>

          {project.reviews.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs">
              No review requests submitted yet. Open the collaborator link in another tab to submit one!
            </div>
          ) : (
            <div className="space-y-4">
              {project.reviews.map((rev) => {
                const variation = project.variations.find((v) => v.id === rev.variationId);
                const baseSnap = project.snapshots.find((s) => s.id === rev.baseSnapshotId) || latestSnapshot;
                const isSelected = selectedReviewId === rev.id;

                return (
                  <div
                    key={rev.id}
                    className={`rounded-xl border p-4 transition ${rev.status === 'open'
                      ? 'bg-slate-950/90 border-amber-700/50 shadow-md'
                      : rev.status === 'combined'
                        ? 'bg-slate-950/40 border-emerald-800/40 opacity-80'
                        : 'bg-slate-950/40 border-slate-800'
                      }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200 text-sm">
                            {variation?.name || 'Variation'}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${rev.status === 'open'
                              ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                              : rev.status === 'combined'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                                : 'bg-rose-950 text-rose-300 border border-rose-700/60'
                              }`}
                          >
                            {rev.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">{rev.message}</p>
                        <div className="text-[11px] text-slate-500">
                          Author: <span className="text-slate-400">{variation?.author || 'Collaborator'}</span> &bull;{' '}
                          Base: <span className="font-mono text-slate-400">{rev.baseSnapshotId.slice(0, 10)}</span>
                        </div>
                        {rev.note && (
                          <div className="mt-1 p-2 bg-rose-950/30 border border-rose-900/50 rounded text-xs text-rose-300">
                            <strong>Feedback:</strong> {rev.note}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedReviewId(isSelected ? null : rev.id)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition"
                        >
                          {isSelected ? 'Hide Diff' : 'Inspect Diff'}
                        </button>

                        {rev.status === 'open' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCombineVariation(rev.id)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded transition shadow-sm"
                            >
                              Combine &amp; Merge
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveReviewAction(activeReviewAction === rev.id ? null : rev.id)}
                              className="px-3 py-1.5 bg-rose-900/70 hover:bg-rose-800 text-rose-200 text-xs font-semibold rounded border border-rose-700/50 transition"
                            >
                              Request Changes
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Request changes note input */}
                    {activeReviewAction === rev.id && (
                      <div className="mt-3 p-3 bg-slate-900 rounded-lg border border-rose-800/60 space-y-2">
                        <label className="block text-xs text-rose-300 font-medium">
                          Notes / Changes Required for Collaborator:
                        </label>
                        <input
                          type="text"
                          value={requestChangeNote}
                          onChange={(e) => setRequestChangeNote(e.target.value)}
                          placeholder="e.g., Shorten clip 2 by 0.5s and move to V2..."
                          className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                        />
                        <div className="flex justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => setActiveReviewAction(null)}
                            className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestChanges(rev.id)}
                            className="px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold rounded"
                          >
                            Send Feedback
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Diff Preview when opened */}
                    {isSelected && variation && baseSnap && (
                      <div className="mt-4 pt-3 border-t border-slate-800 space-y-3">
                        <DiffViewer
                          baseTimeline={baseSnap.timeline}
                          variationTimeline={variation.timeline}
                        />
                        <div className="pt-2">
                          <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                            Variation Timeline Preview ({variation.timeline.clips.length} clips):
                          </span>
                          <TimelineView
                            timeline={variation.timeline}
                            mediaList={project.media}
                            editable={false}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Snapshots Log (Commit History) */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Snapshots History</span>
              <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                {project.snapshots.length}
              </span>
            </h2>
            <span className="text-xs text-slate-500">Immutable Timeline Checkpoints</span>
          </div>

          <div className="space-y-3">
            {[...project.snapshots].reverse().map((snap, idx) => (
              <div
                key={snap.id}
                className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span className="font-semibold text-slate-200 text-xs sm:text-sm">
                      {snap.message}
                    </span>
                    {idx === 0 && (
                      <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-700/60 px-1.5 py-0.2 rounded font-mono">
                        HEAD
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-3">
                    <span>by <strong className="text-slate-400">{snap.author}</strong></span>
                    <span>&bull;</span>
                    <span className="font-mono text-slate-500">id: {snap.id.slice(0, 14)}</span>
                    <span>&bull;</span>
                    <span>{new Date(snap.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="text-xs font-mono text-slate-400 shrink-0">
                  {snap.timeline.clips.length} clip{snap.timeline.clips.length !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
