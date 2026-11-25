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
import { Clip, MediaItem, ReviewRequest, Timeline, Variation } from '@/lib/types';
import { buildTimeline, buildPlaceholderSampleTimeline } from '@/lib/buildTimeline';

export default function CollaboratorPage() {
  const params = useParams();
  const projectId = (params?.id as string) || '';

  const { project, setProject, isLoading } = useProject(projectId);

  // Active variation selection
  const [selectedVariationId, setSelectedVariationId] = useState<string | null>(null);

  // Playhead scrubber time
  const [playerTime, setPlayerTime] = useState<number>(0);

  // New variation form state
  const [isCreatingVariation, setIsCreatingVariation] = useState(false);
  const [varName, setVarName] = useState('');
  const [varAuthor, setVarAuthor] = useState('Jordan (Collaborator)');
  const [varBaseSnapshotId, setVarBaseSnapshotId] = useState('');

  // Submit review form state
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');

  const latestSnapshot = project && project.snapshots.length > 0
    ? project.snapshots[project.snapshots.length - 1]
    : null;

  // Active variation: selected one or default to the first one available
  const activeVariation =
    project?.variations.find((v) => v.id === selectedVariationId) ||
    project?.variations[0] ||
    null;

  // Associated review request if any
  const currentReview = activeVariation
    ? [...(project?.reviews || [])].reverse().find((r) => r.variationId === activeVariation.id)
    : null;

  // Base snapshot for this variation
  const baseSnapshot = activeVariation
    ? project?.snapshots.find((s) => s.id === activeVariation.baseSnapshotId) || latestSnapshot
    : latestSnapshot;

  // Handler to update the active variation timeline
  const handleUpdateVariationTimeline = useCallback((updatedTimeline: Timeline) => {
    if (!activeVariation) return;

    setProject((prev) => {
      if (!prev) return prev;
      const updatedVariations = prev.variations.map((v) => {
        if (v.id === activeVariation.id) {
          return {
            ...v,
            timeline: updatedTimeline,
            status: v.status === 'combined' ? v.status : ('editing' as const),
          };
        }
        return v;
      });

      return {
        ...prev,
        variations: updatedVariations,
      };
    });
  }, [activeVariation, setProject]);

  // Auto-build timeline from uploaded media items
  const handleAutoBuildTimeline = useCallback((items: MediaItem[]) => {
    const mediaToBuild = items && items.length > 0 ? items : (project?.media || []);
    const generatedTimeline = buildTimeline(mediaToBuild);
    handleUpdateVariationTimeline(generatedTimeline);
    setPlayerTime(0);
  }, [handleUpdateVariationTimeline, project?.media]);

  // If active variation has no clips yet but project has media, auto-populate the variation timeline
  useEffect(() => {
    if (activeVariation && activeVariation.timeline.clips.length === 0 && project && project.media.length > 0) {
      handleAutoBuildTimeline(project.media);
    }
  }, [activeVariation, project, handleAutoBuildTimeline]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading project...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Header role="Collaborator" />
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

  // Handler to create a new variation
  const handleCreateVariation = (e: React.FormEvent) => {
    e.preventDefault();
    const name = varName.trim();
    if (!name) return;

    const baseSnapId = varBaseSnapshotId || (latestSnapshot ? latestSnapshot.id : '');
    const baseSnap = project.snapshots.find((s) => s.id === baseSnapId) || latestSnapshot;

    const newVarId = `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const clonedTimeline: Timeline = {
      clips: baseSnap ? JSON.parse(JSON.stringify(baseSnap.timeline.clips)) : [],
    };

    const newVariation: Variation = {
      id: newVarId,
      name,
      author: varAuthor.trim() || 'Collaborator',
      baseSnapshotId: baseSnapId,
      timeline: clonedTimeline,
      status: 'editing',
    };

    setProject({
      ...project,
      variations: [...project.variations, newVariation],
    });

    setSelectedVariationId(newVarId);
    setVarName('');
    setIsCreatingVariation(false);
  };

  // 'Load sample project' button: loads 6 placeholder clips into this variation
  const handleLoadPlaceholderSample = () => {
    const placeholderTimeline = buildPlaceholderSampleTimeline();
    handleUpdateVariationTimeline(placeholderTimeline);
    setPlayerTime(0);
  };

  // Handler to submit Review Request to Lead
  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVariation) return;
    const msg = reviewMessage.trim();
    if (!msg) return;

    const newReview: ReviewRequest = {
      id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      variationId: activeVariation.id,
      baseSnapshotId: activeVariation.baseSnapshotId,
      message: msg,
      status: 'open',
    };

    setProject((prev) => {
      if (!prev) return prev;
      const updatedVariations = prev.variations.map((v) =>
        v.id === activeVariation.id ? { ...v, status: 'in-review' as const } : v
      );
      return {
        ...prev,
        variations: updatedVariations,
        reviews: [...prev.reviews, newReview],
      };
    });

    setReviewMessage('');
    setIsSubmittingReview(false);
  };

  // Handler for media added — adds media AND sequences onto variation timeline
  const handleMediaAdded = (newItems: MediaItem[]) => {
    setProject((prev) => {
      if (!prev) return prev;
      const allMedia = [...prev.media, ...newItems];
      const generatedTimeline = buildTimeline(allMedia);

      let updatedVariations = [...prev.variations];
      if (activeVariation) {
        updatedVariations = updatedVariations.map((v) =>
          v.id === activeVariation.id
            ? { ...v, timeline: generatedTimeline, status: v.status === 'combined' ? v.status : ('editing' as const) }
            : v
        );
      }

      return {
        ...prev,
        media: allMedia,
        variations: updatedVariations,
      };
    });
    setPlayerTime(0);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header projectId={project.id} projectName={project.name} role="Collaborator" />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 space-y-6">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">{project.name}</h1>
              <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-mono">
                Collaborator Workspace
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Branch off base snapshots, experiment with edits, and submit review requests for Lead approval.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={handleLoadPlaceholderSample}
              className="px-3 py-1.5 bg-purple-900/80 hover:bg-purple-800 text-purple-200 text-xs font-semibold rounded-lg transition border border-purple-700/60 shadow-sm flex items-center gap-1.5"
              title="Load 6 placeholder clips with no media (colored boxes only)"
            >
              <span>★ Load 6-Clip Sample</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCreatingVariation(!isCreatingVariation)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition shadow-sm flex items-center gap-1.5"
            >
              <span>+ Branch New Variation</span>
            </button>

            <Link
              href={`/lead/${project.id}`}
              target="_blank"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition border border-slate-700 flex items-center gap-1.5"
              title="Open Lead Editor view in a new tab"
            >
              <span>Open Lead Editor in New Tab &#8599;</span>
            </Link>
          </div>
        </div>

        {/* Create Variation Form */}
        {isCreatingVariation && (
          <form
            onSubmit={handleCreateVariation}
            className="p-4 bg-slate-900 border border-emerald-700/60 rounded-xl space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-semibold text-emerald-300">Create New Variation Branch</span>
              <button
                type="button"
                onClick={() => setIsCreatingVariation(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕ Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Variation Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dynamic B-roll on V2"
                  value={varName}
                  onChange={(e) => setVarName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Author Name</label>
                <input
                  type="text"
                  value={varAuthor}
                  onChange={(e) => setVarAuthor(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Base Snapshot</label>
                <select
                  value={varBaseSnapshotId || latestSnapshot?.id || ''}
                  onChange={(e) => setVarBaseSnapshotId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                >
                  {project.snapshots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.message} ({s.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition"
            >
              Start Editing Variation
            </button>
          </form>
        )}

        {/* Variation Selector Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3 overflow-x-auto py-1">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider shrink-0">
              Variations:
            </span>
            {project.variations.length === 0 ? (
              <span className="text-xs text-slate-500 italic">No variations created yet</span>
            ) : (
              project.variations.map((v) => {
                const isActive = activeVariation?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariationId(v.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-2 shrink-0 ${isActive
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-600 shadow-sm'
                      : 'bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800'
                      }`}
                  >
                    <span>{v.name}</span>
                    <span
                      className={`text-[9px] uppercase px-1.5 py-0.2 rounded-full font-bold ${v.status === 'combined'
                        ? 'bg-purple-900 text-purple-200'
                        : v.status === 'in-review'
                          ? 'bg-amber-900 text-amber-200'
                          : 'bg-emerald-900 text-emerald-200'
                        }`}
                    >
                      {v.status}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {activeVariation && (
            <div className="flex items-center space-x-2 shrink-0">
              {activeVariation.status === 'combined' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-950 text-purple-300 border border-purple-800">
                  <span>✓</span> Combined into Master Timeline
                </span>
              ) : activeVariation.status === 'in-review' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  In Review with Lead
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSubmittingReview(!isSubmittingReview)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition shadow-sm flex items-center gap-1.5"
                >
                  <span>Submit for Review &rarr;</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Change Request Banner if Lead requested changes */}
        {currentReview && currentReview.status === 'changes-requested' && (
          <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wider">
              <span>⚠ Changes Requested by Lead</span>
            </div>
            <p className="text-xs text-rose-200">
              <strong>Lead note:</strong> {currentReview.note || 'Please refine the edits and re-submit.'}
            </p>
            <p className="text-[11px] text-slate-400">
              You can make edits to your timeline below, then click &quot;Submit for Review&quot; once ready.
            </p>
          </div>
        )}

        {/* Submit Review Drawer */}
        {isSubmittingReview && activeVariation && (
          <form
            onSubmit={handleSubmitReview}
            className="p-4 bg-slate-900 border border-amber-700/60 rounded-xl space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-semibold text-amber-300">
                Submit &quot;{activeVariation.name}&quot; for Review
              </span>
              <button
                type="button"
                onClick={() => setIsSubmittingReview(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕ Cancel
              </button>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Summary of changes for Lead Editor
              </label>
              <textarea
                value={reviewMessage}
                onChange={(e) => setReviewMessage(e.target.value)}
                placeholder="e.g. Replaced slow intro with fast-paced cuts, synchronized audio on A1"
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                required
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition"
            >
              Send Review Request to Lead
            </button>
          </form>
        )}

        {/* Variation Preview Player & Timeline */}
        {activeVariation ? (
          <section className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span>Variation Preview Player:</span>
                  <span className="text-emerald-400">{activeVariation.name}</span>
                </h2>
                <span className="text-xs text-slate-500">
                  Status: <strong className="uppercase">{activeVariation.status}</strong>
                </span>
              </div>

              <PlayerView
                timeline={activeVariation.timeline}
                time={playerTime}
                onTime={setPlayerTime}
              />
            </div>

            <div className="space-y-2">
              <TimelineView
                timeline={activeVariation.timeline}
                mediaList={project.media}
                editable={activeVariation.status !== 'combined'}
                onUpdateTimeline={handleUpdateVariationTimeline}
                title={`Variation Timeline (${activeVariation.status})`}
              />
            </div>

            {/* Diff against base snapshot */}
            {baseSnapshot && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Changes compared to base snapshot ({baseSnapshot.message})
                </h3>
                <DiffViewer
                  baseTimeline={baseSnapshot.timeline}
                  variationTimeline={activeVariation.timeline}
                />
              </div>
            )}
          </section>
        ) : (
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-3">
            <h3 className="font-bold text-white text-base">No Active Variation</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              You haven&apos;t created or selected a variation branch yet. Click &quot;Branch New Variation&quot; above to clone the latest base snapshot and start editing!
            </p>
            <button
              type="button"
              onClick={() => setIsCreatingVariation(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition"
            >
              + Create First Variation
            </button>
          </div>
        )}

        {/* Dropzone & Media Bin */}
        <section>
          <Dropzone
            mediaItems={project.media}
            onMediaAdded={handleMediaAdded}
            onBuildTimeline={handleAutoBuildTimeline}
          />
        </section>
      </main>
    </div>
  );
}
