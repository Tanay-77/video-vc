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
import { diffTimelines } from '@/lib/diff';
import { hasTrackOverlaps, preventOverlaps, rebaseVariation } from '@/lib/vc';

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

  // The newest snapshot that contains clips (avoids diffing against empty snap_init)
  const latestWithClips = project
    ? [...project.snapshots].reverse().find((s) => s.timeline.clips.length > 0) || latestSnapshot
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

  // Check if Main has pushed new snapshot(s) since this variation was created/synced
  const isBaseSnapshotOutdated = Boolean(
    activeVariation && latestSnapshot && activeVariation.baseSnapshotId !== latestSnapshot.id
  );

  // Compute diff between base snapshot and latest pushed snapshot on Main
  const mainDiff = React.useMemo(() => {
    if (!isBaseSnapshotOutdated || !baseSnapshot || !latestSnapshot) return null;
    return diffTimelines(baseSnapshot.timeline, latestSnapshot.timeline);
  }, [isBaseSnapshotOutdated, baseSnapshot, latestSnapshot]);

  const hasMainChanges = isBaseSnapshotOutdated;

  const trimmedClipsOnMain = mainDiff
    ? mainDiff.items.filter((i) => i.flags.includes('trimmed') || i.flags.includes('moved'))
    : [];

  const addedOnMain = mainDiff
    ? mainDiff.items.filter((i) => i.status === 'added')
    : [];

  const deletedOnMain = mainDiff
    ? mainDiff.items.filter((i) => i.status === 'removed')
    : [];

  // Sync Lead's pushed snapshot into the active variation (Git pull --rebase)
  const handleSyncWithMain = useCallback(() => {
    if (!activeVariation || !latestSnapshot) return;

    setProject((prev) => {
      if (!prev) return prev;
      const currentMain = prev.snapshots.length > 0 ? prev.snapshots[prev.snapshots.length - 1] : null;
      if (!currentMain) return prev;

      const baseSnap = prev.snapshots.find((s) => s.id === activeVariation.baseSnapshotId) || prev.snapshots[0];
      const rebased = rebaseVariation(activeVariation, baseSnap, currentMain);

      const updatedVariations = prev.variations.map((v) => {
        if (v.id === activeVariation.id) {
          return rebased;
        }
        return v;
      });

      return {
        ...prev,
        variations: updatedVariations,
      };
    });
  }, [activeVariation, latestSnapshot, setProject]);

  // Reset variation completely to match Main's pushed snapshot (like git reset --hard)
  const handleResetToMain = useCallback(() => {
    if (!activeVariation || !latestSnapshot) return;
    if (!confirm('Reset this variation to match the latest pushed snapshot from Lead? This will overwrite your variation cuts.')) return;

    setProject((prev) => {
      if (!prev) return prev;
      const currentMain = prev.snapshots.length > 0 ? prev.snapshots[prev.snapshots.length - 1] : null;
      if (!currentMain) return prev;

      const updatedVariations = prev.variations.map((v) => {
        if (v.id === activeVariation.id) {
          return {
            ...v,
            baseSnapshotId: currentMain.id,
            timeline: JSON.parse(JSON.stringify(currentMain.timeline)),
            status: 'editing' as const,
          };
        }
        return v;
      });

      return {
        ...prev,
        variations: updatedVariations,
      };
    });
  }, [activeVariation, latestSnapshot, setProject]);

  // Handler to update the active variation timeline
  const handleUpdateVariationTimeline = useCallback((updatedTimeline: Timeline) => {
    if (!activeVariation) return;

    setProject((prev) => {
      if (!prev) return prev;
      const currentMain = prev.snapshots.length > 0 ? prev.snapshots[prev.snapshots.length - 1] : null;
      const updatedVariations = prev.variations.map((v) => {
        if (v.id === activeVariation.id) {
          return {
            ...v,
            timeline: updatedTimeline,
            status: 'editing' as const,
            // If variation was previously combined into Main, re-anchor new diff to current Main
            baseSnapshotId: v.status === 'combined' && currentMain ? currentMain.id : v.baseSnapshotId,
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

  // Re-open a merged variation so the collaborator can continue editing and submit a new review
  const handleReopenVariation = useCallback(() => {
    if (!activeVariation) return;
    setProject((prev) => {
      if (!prev) return prev;
      const currentMain = prev.snapshots.length > 0 ? prev.snapshots[prev.snapshots.length - 1] : null;
      const updatedVariations = prev.variations.map((v) => {
        if (v.id === activeVariation.id) {
          return {
            ...v,
            status: 'editing' as const,
            baseSnapshotId: currentMain ? currentMain.id : v.baseSnapshotId,
          };
        }
        return v;
      });
      return { ...prev, variations: updatedVariations };
    });
  }, [activeVariation, setProject]);

  // Auto-build timeline from uploaded media items
  const handleAutoBuildTimeline = useCallback((items: MediaItem[]) => {
    const mediaToBuild = items && items.length > 0 ? items : (project?.media || []);
    const generatedTimeline = buildTimeline(mediaToBuild);
    handleUpdateVariationTimeline(generatedTimeline);
    setPlayerTime(0);
  }, [handleUpdateVariationTimeline, project?.media]);

  // Directly add a single media item with its full duration to the variation timeline (no duration prompt)
  const handleAddMediaToTimeline = useCallback((item: MediaItem) => {
    if (!activeVariation) return;

    const isAudio =
      item.name.toLowerCase().endsWith('.mp3') ||
      item.name.toLowerCase().endsWith('.wav') ||
      item.name.toLowerCase().endsWith('.m4a') ||
      item.name.toLowerCase().endsWith('.aac') ||
      item.name.toLowerCase().endsWith('.flac');

    const targetTrack = isAudio ? 'A1' : 'V1';
    const trackClips = activeVariation.timeline.clips.filter((c) => c.track === targetTrack);
    const endOfTrack = trackClips.length > 0
      ? Math.max(...trackClips.map((c) => c.start + c.dur))
      : 0;

    // Check if playerTime falls inside an existing clip on this track
    let startPos = parseFloat(endOfTrack.toFixed(2));
    if (playerTime > 0) {
      const isInside = trackClips.some((c) => playerTime >= c.start && playerTime < c.start + c.dur);
      if (!isInside && playerTime >= endOfTrack) {
        startPos = parseFloat(playerTime.toFixed(2));
      }
    }

    const newClip: Clip = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `clip_${Date.now()}`,
      track: targetTrack,
      name: item.name,
      mediaId: item.id,
      start: startPos,
      dur: item.duration,
      sourceIn: 0,
      sourceOut: item.duration,
      speed: 1.0,
    };

    const resolved = preventOverlaps({
      clips: [...activeVariation.timeline.clips, newClip],
    }, newClip.id);

    handleUpdateVariationTimeline(resolved);
  }, [activeVariation, playerTime, handleUpdateVariationTimeline]);

  // Auto-untangle any overlapping clips on the variation timeline
  useEffect(() => {
    if (activeVariation && hasTrackOverlaps(activeVariation.timeline)) {
      handleUpdateVariationTimeline(preventOverlaps(activeVariation.timeline));
    }
  }, [activeVariation, handleUpdateVariationTimeline]);

  // Auto-branch initial variation if project has snapshots or media but no variations yet
  useEffect(() => {
    if (project && project.variations.length === 0) {
      const baseSnap = latestWithClips || latestSnapshot;
      const sourceClips =
        baseSnap && baseSnap.timeline.clips.length > 0
          ? baseSnap.timeline.clips
          : project.masterDraft && project.masterDraft.clips.length > 0
            ? project.masterDraft.clips
            : project.media && project.media.length > 0
              ? buildTimeline(project.media).clips
              : [];

      if (sourceClips.length > 0) {
        const initialVar: Variation = {
          id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: "Collaborator's Cut",
          author: 'Jordan (Collaborator)',
          baseSnapshotId: baseSnap ? baseSnap.id : '',
          timeline: { clips: JSON.parse(JSON.stringify(sourceClips)) },
          status: 'editing',
        };
        setProject((prev) => {
          if (!prev || prev.variations.length > 0) return prev;
          return {
            ...prev,
            variations: [initialVar],
          };
        });
        setSelectedVariationId(initialVar.id);
      }
    }
  }, [project, latestWithClips, latestSnapshot, setProject]);

  // If active variation has no clips yet but project has media or snapshot clips, populate it
  useEffect(() => {
    if (activeVariation && activeVariation.timeline.clips.length === 0 && project) {
      const baseSnap = latestWithClips || latestSnapshot;
      if (baseSnap && baseSnap.timeline.clips.length > 0) {
        handleUpdateVariationTimeline(JSON.parse(JSON.stringify(baseSnap.timeline)));
      } else if (project.media.length > 0) {
        handleAutoBuildTimeline(project.media);
      }
    }
  }, [activeVariation, project, latestWithClips, latestSnapshot, handleUpdateVariationTimeline, handleAutoBuildTimeline]);

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

    // Default to the newest snapshot with clips if available
    const baseSnapId = varBaseSnapshotId || (latestWithClips ? latestWithClips.id : latestSnapshot ? latestSnapshot.id : '');
    const baseSnap = project.snapshots.find((s) => s.id === baseSnapId) || latestWithClips || latestSnapshot;

    // Resolve source clips: from baseSnap if it has clips, else from masterDraft, else from media build
    const sourceClips = (baseSnap && baseSnap.timeline.clips.length > 0)
      ? baseSnap.timeline.clips
      : (project.masterDraft && project.masterDraft.clips.length > 0)
        ? project.masterDraft.clips
        : (latestWithClips && latestWithClips.timeline.clips.length > 0)
          ? latestWithClips.timeline.clips
          : (project.media && project.media.length > 0)
            ? buildTimeline(project.media).clips
            : [];

    const newVarId = `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const clonedTimeline: Timeline = {
      clips: JSON.parse(JSON.stringify(sourceClips)),
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

    // If activeVariation's baseSnapshotId points to an empty snapshot, re-anchor to latestWithClips
    const baseSnapObj = project.snapshots.find((s) => s.id === activeVariation.baseSnapshotId);
    const validBaseSnapId = (baseSnapObj && baseSnapObj.timeline.clips.length > 0)
      ? activeVariation.baseSnapshotId
      : (latestWithClips ? latestWithClips.id : activeVariation.baseSnapshotId);

    const newReview: ReviewRequest = {
      id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      variationId: activeVariation.id,
      baseSnapshotId: validBaseSnapId,
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
                  value={varBaseSnapshotId || (latestWithClips ? latestWithClips.id : latestSnapshot?.id || '')}
                  onChange={(e) => setVarBaseSnapshotId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                >
                  {[...project.snapshots].reverse().map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.message} ({s.timeline.clips.length} clip{s.timeline.clips.length !== 1 ? 's' : ''} • {s.id.slice(0, 8)})
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

            <button
              type="button"
              onClick={() => setIsCreatingVariation(true)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition shrink-0"
              title="Create another variation branch"
            >
              + New Variation
            </button>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {activeVariation && (
              <div className="flex items-center space-x-2">
                {activeVariation.status === 'combined' ? (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-950 text-purple-300 border border-purple-800">
                      <span>✓</span> Merged into Master
                    </span>
                    <button
                      type="button"
                      onClick={handleReopenVariation}
                      className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition shadow-sm flex items-center gap-1"
                      title="Unlock this variation to make more edits and submit another review"
                    >
                      <span>✏ Edit / Re-open</span>
                    </button>
                  </div>
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

        {/* Banner: Lead has pushed new cut to Main */}
        {isBaseSnapshotOutdated && activeVariation && (
          <div className="p-4 bg-indigo-950/40 border border-indigo-700/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-indigo-300">
                <span className="text-sm">📢 Lead Pushed New Cut to Main: &quot;{latestSnapshot?.message || 'Update'}&quot;</span>
                {trimmedClipsOnMain.length > 0 && (
                  <span className="text-[10px] bg-amber-900/80 text-amber-200 border border-amber-700/60 px-2 py-0.5 rounded-full font-mono">
                    {trimmedClipsOnMain.length} clip{trimmedClipsOnMain.length !== 1 ? 's' : ''} trimmed/moved
                  </span>
                )}
                {deletedOnMain.length > 0 && (
                  <span className="text-[10px] bg-rose-900/80 text-rose-200 border border-rose-700/60 px-2 py-0.5 rounded-full font-mono">
                    {deletedOnMain.length} clip{deletedOnMain.length !== 1 ? 's' : ''} deleted
                  </span>
                )}
                {addedOnMain.length > 0 && (
                  <span className="text-[10px] bg-emerald-900/80 text-emerald-200 border border-emerald-700/60 px-2 py-0.5 rounded-full font-mono">
                    {addedOnMain.length} clip{addedOnMain.length !== 1 ? 's' : ''} added
                  </span>
                )}
              </div>
              <p className="text-slate-300 text-xs">
                The Lead Editor pushed new changes to Main. Click <strong>↻ Sync from Main</strong> to rebase trims into this variation, or <strong>Reset to Main</strong> to match 100%.
              </p>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={handleSyncWithMain}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs transition shadow flex items-center gap-1.5"
                title="Pull Lead's latest trims and updates into this variation"
              >
                <span>↻ Sync from Main (Rebase)</span>
              </button>
              <button
                type="button"
                onClick={handleResetToMain}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700 transition"
                title="Reset this variation completely to match Master"
              >
                Reset to Main
              </button>
            </div>
          </div>
        )}

        {/* Variation Timeline & Player */}
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
                editable={true}
                onUpdateTimeline={handleUpdateVariationTimeline}
                time={playerTime}
                onTime={setPlayerTime}
                title={`Variation Timeline: ${activeVariation.name}${activeVariation.status === 'combined' ? ' (Merged — Editable)' : ''}`}
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
            onAddMediaToTimeline={handleAddMediaToTimeline}
          />
        </section>
      </main>
    </div>
  );
}
