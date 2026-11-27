'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { TimelineView } from '@/components/TimelineView';
import { PlayerView } from '@/components/PlayerView';
import { Dropzone } from '@/components/Dropzone';
import { DiffViewer } from '@/components/DiffViewer';
import { SnapshotHistoryPanel } from '@/components/SnapshotHistoryPanel';
import { useProject } from '@/lib/sync';
import { Clip, MediaItem, ReviewRequest, Timeline, Variation } from '@/lib/types';
import { buildTimeline } from '@/lib/buildTimeline';
import { diffTimelines } from '@/lib/diff';
import { hasTrackOverlaps, preventOverlaps, rebaseVariation } from '@/lib/vc';
import {
  Play,
  GitBranch,
  ExternalLink,
  Check,
  Edit3,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertCircle,
  Radio,
  X,
  Plus,
  History,
  Copy
} from 'lucide-react';

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

  // Check if URL specifies ?new=1 or ?branch=1 to open variation creation directly
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1' || params.get('branch') === '1') {
        setIsCreatingVariation(true);
      }
    }
  }, []);

  // Submit review form state
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

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

  // Whether collaborator is creating a variation or if no variations exist yet
  const shouldShowCreateVariation = Boolean(
    isCreatingVariation || !activeVariation || (project && project.variations.length === 0)
  );

  // Selected base snapshot for the new variation creation preview
  const selectedBaseSnap = React.useMemo(() => {
    if (!project || project.snapshots.length === 0) return null;
    if (varBaseSnapshotId) {
      const found = project.snapshots.find((s) => s.id === varBaseSnapshotId);
      if (found) return found;
    }
    return latestWithClips || latestSnapshot || project.snapshots[0];
  }, [project, varBaseSnapshotId, latestWithClips, latestSnapshot]);

  // Associated review request if any
  const currentReview = activeVariation
    ? [...(project?.reviews || [])].reverse().find((r) => r.variationId === activeVariation.id)
    : null;

  // Base snapshot for this variation
  const baseSnapshot = activeVariation
    ? project?.snapshots.find((s) => s.id === activeVariation.baseSnapshotId) || latestSnapshot
    : latestSnapshot;

  // Compute diff between active variation and base snapshot
  const variationToBaseDiff = React.useMemo(() => {
    if (!activeVariation || !baseSnapshot) return null;
    return diffTimelines(baseSnapshot.timeline, activeVariation.timeline);
  }, [activeVariation, baseSnapshot]);

  const hasVariationChanges = Boolean(
    variationToBaseDiff &&
    (variationToBaseDiff.addedCount > 0 ||
      variationToBaseDiff.modifiedCount > 0 ||
      variationToBaseDiff.removedCount > 0)
  );

  const totalChangesCount = variationToBaseDiff
    ? variationToBaseDiff.addedCount + variationToBaseDiff.modifiedCount + variationToBaseDiff.removedCount
    : 0;

  // Compute diff between active variation and latest snapshot on Main
  const variationToMainDiff = React.useMemo(() => {
    if (!activeVariation || !latestSnapshot) return null;
    return diffTimelines(activeVariation.timeline, latestSnapshot.timeline);
  }, [activeVariation, latestSnapshot]);

  // True only if Main has genuine differences compared to what this variation already has
  const hasActualMainDifferences = Boolean(
    variationToMainDiff &&
    (variationToMainDiff.addedCount > 0 ||
      variationToMainDiff.modifiedCount > 0 ||
      variationToMainDiff.removedCount > 0)
  );

  // Whether this variation is considered combined with NO unsubmitted changes
  // In VCS: A variation is combined only if its status is 'combined' AND there are no new local edits.
  const isVariationCombined = Boolean(
    activeVariation &&
    activeVariation.status === 'combined' &&
    !hasVariationChanges
  );

  // Check if Main has pushed genuine new updates by Lead (not just merging this variation!)
  const isBaseSnapshotOutdated = Boolean(
    activeVariation &&
    latestSnapshot &&
    activeVariation.baseSnapshotId !== latestSnapshot.id &&
    hasActualMainDifferences
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

      let rebased: Variation;
      // If variation was already combined or collaborator made no uncommitted edits:
      // Fast-forward directly to match latest Main cut!
      if (!hasVariationChanges || activeVariation.status === 'combined') {
        rebased = {
          ...activeVariation,
          baseSnapshotId: currentMain.id,
          timeline: JSON.parse(JSON.stringify(currentMain.timeline)),
          status: activeVariation.status === 'combined' ? 'combined' : 'editing',
        };
      } else {
        const baseSnap =
          prev.snapshots.find((s) => s.id === activeVariation.baseSnapshotId) ||
          (prev.snapshots.length > 1 ? prev.snapshots[prev.snapshots.length - 2] : prev.snapshots[0]);
        rebased = rebaseVariation(activeVariation, baseSnap, currentMain);
      }

      const updatedVariations = prev.variations.map((v) => {
        if (v.id === activeVariation.id) {
          return rebased;
        }
        return v;
      });

      // Also update open reviews for this variation so the clash on Lead is resolved!
      const updatedReviews = prev.reviews.map((r) => {
        if (r.variationId === activeVariation.id && r.status === 'open') {
          return {
            ...r,
            baseSnapshotId: currentMain.id,
          };
        }
        return r;
      });

      return {
        ...prev,
        variations: updatedVariations,
        reviews: updatedReviews,
      };
    });

    setSyncSuccessMsg(`Synced variation "${activeVariation.name}" with Main! Your timeline is updated to Lead's latest cut, and any open review clash has been resolved.`);
  }, [activeVariation, latestSnapshot, setProject, hasVariationChanges]);

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

      const updatedReviews = prev.reviews.map((r) => {
        if (r.variationId === activeVariation.id && r.status === 'open') {
          return {
            ...r,
            baseSnapshotId: currentMain.id,
          };
        }
        return r;
      });

      return {
        ...prev,
        variations: updatedVariations,
        reviews: updatedReviews,
      };
    });

    setSyncSuccessMsg(`Reset variation "${activeVariation.name}" to match Lead's latest Main cut 100%.`);
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
            timeline: currentMain ? JSON.parse(JSON.stringify(currentMain.timeline)) : v.timeline,
          };
        }
        return v;
      });
      return { ...prev, variations: updatedVariations };
    });
    setIsSubmittingReview(true);
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
      <div className="min-h-screen bg-[#000000] flex items-center justify-center text-[#8e8e93]">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-[#5b8def] border-t-transparent rounded-full animate-spin"></div>
          <span>Loading project...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#000000] text-[#ffffff]">
        <Header role="Collaborator" />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <h2 className="text-xl font-bold text-[#ffffff]">Project Not Found</h2>
          <p className="text-sm text-[#8e8e93]">
            Could not find a project with ID &quot;{projectId}&quot; in local storage.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] rounded-full text-sm font-semibold transition"
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
    const name = varName.trim() || `${varAuthor.trim() || 'Collaborator'}'s Variation`;

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

  // Handler to submit Review Request to Lead
  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVariation) return;
    const msg = reviewMessage.trim() || `Refined and updated variation "${activeVariation.name}" (${totalChangesCount > 0 ? `${totalChangesCount} clip changes` : 'edits ready for review'})`;

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

    setReviewSuccessMsg(`Review request sent to Lead Editor for "${activeVariation.name}"! Lead can now review your ghost timeline diffs and combine your cuts into Main.`);
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
            ? { ...v, timeline: generatedTimeline, status: 'editing' as const }
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
    <div className="min-h-screen flex flex-col bg-[#000000] text-[#ffffff]">
      <Header projectId={project.id} projectName={project.name} role="Collaborator" />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 space-y-6">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121214] border border-[#222226] rounded-2xl p-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[#ffffff]">{project.name}</h1>
              <span className="text-xs bg-[#1c1c20] text-[#8e8e93] border border-[#222226] px-2.5 py-0.5 rounded-full font-mono">
                Collaborator Workspace
              </span>
            </div>
            <p className="text-xs text-[#8e8e93] mt-1">
              Create variations from snapshots, experiment with edits, and send for review.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <Link
              href={`/lead/${project.id}`}
              target="_blank"
              className="px-3.5 py-1.5 bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] text-xs font-medium rounded-full transition border border-[#222226] flex items-center gap-1.5"
              title="Open Lead Editor view in a new tab"
            >
              <span>Open Lead Editor in New Tab</span>
              <ExternalLink className="w-3 h-3 text-[#8e8e93]" />
            </Link>
          </div>
        </div>

        {/* Variation Selector Bar */}
        <div className="bg-[#121214] border border-[#222226] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3 overflow-x-auto py-1">
            <span className="text-xs text-[#8e8e93] font-semibold uppercase tracking-wider shrink-0">
              Variations:
            </span>

            {project.variations.length === 0 ? (
              <span className="text-xs text-[#8e8e93] italic">No variations created yet</span>
            ) : (
              project.variations.map((v) => {
                const isActive = activeVariation?.id === v.id && !isCreatingVariation;
                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedVariationId(v.id);
                      setIsCreatingVariation(false);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center space-x-2 shrink-0 ${isActive
                      ? 'bg-[#5b8def]/15 text-[#5b8def] border border-[#5b8def]/50'
                      : 'bg-transparent text-[#8e8e93] hover:text-[#ffffff] border border-[#222226] hover:bg-[#1a1a1e]'
                      }`}
                  >
                    <span>{v.name}</span>
                    <span
                      className="text-[9px] uppercase px-2 py-0.5 rounded-full font-medium bg-[#1c1c20] text-[#8e8e93] border border-[#222226]"
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
              className={`px-3 py-1 text-xs rounded-full border transition shrink-0 flex items-center gap-1 ${
                isCreatingVariation
                  ? 'bg-[#5b8def]/15 text-[#5b8def] border-[#5b8def]/50 font-semibold'
                  : 'bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] border-[#222226]'
              }`}
              title="Create a new variation"
            >
              <Plus className="w-3 h-3" />
              <span>New variation</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {activeVariation && !isCreatingVariation && (
              <div className="flex items-center space-x-2">
                {isVariationCombined ? (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#1c1c20] text-[#8e8e93] border border-[#222226]">
                      <Check className="w-3.5 h-3.5" />
                      <span>Combined</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleReopenVariation}
                      className="px-3 py-1 bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] text-xs font-medium rounded-full transition border border-[#222226] flex items-center gap-1.5"
                      title="Continue editing this variation"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Continue editing</span>
                    </button>
                  </div>
                ) : activeVariation.status === 'in-review' ? (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#1c1c20] text-[#8e8e93] border border-[#222226]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8e8e93]"></span>
                      In Review
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsSubmittingReview(true)}
                      className="px-3.5 py-1.5 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] text-xs font-semibold rounded-full transition flex items-center gap-1.5"
                      title="Update review request with newest edits"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Send for review</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsSubmittingReview(true)}
                    className="px-4 py-1.5 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] text-xs font-semibold rounded-full transition flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send for review</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Success Banner when Review is Submitted */}
        {reviewSuccessMsg && (
          <div className="p-4 bg-[#121214] border border-[#222226] rounded-xl flex items-center justify-between text-xs text-[#ffffff]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#4aa56b] shrink-0" />
              <span>{reviewSuccessMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setReviewSuccessMsg(null)}
              className="text-[#8e8e93] hover:text-[#ffffff]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Success Banner when Variation is Synced with Main */}
        {syncSuccessMsg && (
          <div className="p-4 bg-[#121214] border border-[#222226] rounded-xl flex items-center justify-between text-xs text-[#ffffff]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#4aa56b] shrink-0" />
              <span>{syncSuccessMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSyncSuccessMsg(null)}
              className="text-[#8e8e93] hover:text-[#ffffff]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Change Request Banner if Lead requested changes */}
        {currentReview && currentReview.status === 'changes-requested' && (
          <div className="p-4 bg-[#121214] border border-[#222226] rounded-xl space-y-2 text-xs text-[#ffffff]">
            <div className="flex items-center gap-2 text-[#c9605f] font-bold text-xs uppercase tracking-wider">
              <AlertCircle className="w-4 h-4 text-[#c9605f] shrink-0" />
              <span>Changes Requested by Lead</span>
            </div>
            <p className="text-xs text-[#ffffff]">
              <strong>Lead note:</strong> {currentReview.note || 'Please refine the edits and re-submit.'}
            </p>
            <p className="text-[11px] text-[#8e8e93]">
              You can make edits to your timeline below, then click &quot;Send for review&quot; once ready.
            </p>
          </div>
        )}

        {/* Submit Review Drawer */}
        {isSubmittingReview && activeVariation && (
          <form
            onSubmit={handleSubmitReview}
            className="p-4 bg-[#121214] border border-[#222226] rounded-xl space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#222226] pb-2">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-[#8e8e93] shrink-0" />
                <span className="font-semibold text-[#ffffff]">
                  Send &quot;{activeVariation.name}&quot; for review
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsSubmittingReview(false)}
                className="text-[#8e8e93] hover:text-[#ffffff] flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[#8e8e93]">
                  Summary of changes for Alex (Lead)
                </label>
                {totalChangesCount > 0 && (
                  <span className="text-[10px] text-[#8e8e93] font-mono">
                    {totalChangesCount} {totalChangesCount === 1 ? 'change' : 'changes'} detected
                  </span>
                )}
              </div>
              <textarea
                value={reviewMessage}
                onChange={(e) => setReviewMessage(e.target.value)}
                placeholder={
                  totalChangesCount > 0
                    ? `e.g. Trimmed and refined ${totalChangesCount} ${totalChangesCount === 1 ? 'clip' : 'clips'} on ${activeVariation.name}`
                    : "e.g. Replaced slow intro with fast-paced cuts, synchronized audio on A1"
                }
                rows={2}
                className="w-full bg-[#000000] border border-[#222226] rounded px-2.5 py-1.5 text-[#ffffff] placeholder-[#8e8e93]/60 focus:outline-none focus:border-[#5b8def]"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-[#8e8e93]">
                Alex (Lead) will receive the review request and can inspect changes to combine.
              </span>
              <button
                type="submit"
                className="px-4 py-2 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] font-semibold rounded-lg transition flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send for review &rarr;</span>
              </button>
            </div>
          </form>
        )}

        {/* Banner: Variation was combined into timeline */}
        {activeVariation && isVariationCombined && !isBaseSnapshotOutdated && (
          <div className="p-4 bg-[#121214] border border-[#222226] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#ffffff]">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold text-[#ffffff]">
                <CheckCircle2 className="w-4 h-4 text-[#8b7fc7] shrink-0" />
                <span>Combined: &quot;{activeVariation.name}&quot; has been combined into the timeline.</span>
              </div>
              <p className="text-[#8e8e93] text-xs">
                Your variation was combined by Alex (Lead). You can create a new variation or continue editing.
              </p>
            </div>
          </div>
        )}

        {/* Banner: Lead has pushed new cut to Main */}
        {isBaseSnapshotOutdated && activeVariation && (
          <div className="p-4 bg-[#121214] border border-[#222226] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#ffffff]">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold text-[#ffffff]">
                <Radio className="w-4 h-4 text-[#5b8def] shrink-0" />
                <span className="text-sm">Alex (Lead) Pushed New Snapshot: &quot;{latestSnapshot?.message || 'Update'}&quot;</span>
                {trimmedClipsOnMain.length > 0 && (
                  <span className="text-[10px] bg-[#c9973a]/12 text-[#c9973a] px-2 py-0.5 rounded-full font-mono">
                    {trimmedClipsOnMain.length} clip{trimmedClipsOnMain.length !== 1 ? 's' : ''} trimmed/moved
                  </span>
                )}
                {deletedOnMain.length > 0 && (
                  <span className="text-[10px] bg-[#c9605f]/12 text-[#c9605f] px-2 py-0.5 rounded-full font-mono">
                    {deletedOnMain.length} clip{deletedOnMain.length !== 1 ? 's' : ''} deleted
                  </span>
                )}
                {addedOnMain.length > 0 && (
                  <span className="text-[10px] bg-[#4aa56b]/12 text-[#4aa56b] px-2 py-0.5 rounded-full font-mono">
                    {addedOnMain.length} clip{addedOnMain.length !== 1 ? 's' : ''} added
                  </span>
                )}
              </div>
              <p className="text-[#8e8e93] text-xs">
                The Lead Editor pushed new changes to Main. Click <strong>Sync from Main</strong> to rebase trims into this variation, or <strong>Reset to Main</strong> to match 100%.
              </p>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={handleSyncWithMain}
                className="px-3.5 py-1.5 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] font-semibold rounded-full text-xs transition flex items-center gap-1.5"
                title="Pull Lead's latest trims and updates into this variation"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync from Main</span>
              </button>
              <button
                type="button"
                onClick={handleResetToMain}
                className="px-3 py-1.5 bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] rounded-full text-xs border border-[#222226] transition"
                title="Reset this variation completely to match Master"
              >
                Reset to Main
              </button>
            </div>
          </div>
        )}

        {/* Create Variation Screen (when creating new variation or when no variations exist yet) */}
        {shouldShowCreateVariation ? (
          <section className="space-y-6">
            <div className="bg-[#121214] border border-[#222226] rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222226] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-[#1c1c20] text-[#8e8e93] border border-[#222226] px-2.5 py-0.5 rounded-full font-mono font-medium flex items-center gap-1">
                      <GitBranch className="w-3.5 h-3.5 text-[#8e8e93]" />
                      <span>Variation</span>
                    </span>
                    <h2 className="text-xl font-bold text-[#ffffff]">New Variation</h2>
                  </div>
                  <p className="text-xs text-[#8e8e93] mt-1">
                    Create a variation from a snapshot to edit cuts and send for review.
                  </p>
                </div>

                {activeVariation && (
                  <button
                    type="button"
                    onClick={() => setIsCreatingVariation(false)}
                    className="text-xs px-3.5 py-1.5 bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] rounded-full border border-[#222226] transition"
                  >
                    ← Back to &quot;{activeVariation.name}&quot;
                  </button>
                )}
              </div>

              <form onSubmit={handleCreateVariation} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#8e8e93] mb-1.5">
                      Author / Collaborator Name <span className="text-[#c9605f]">*</span>
                    </label>
                    <input
                      type="text"
                      value={varAuthor}
                      onChange={(e) => setVarAuthor(e.target.value)}
                      className="w-full bg-[#000000] border border-[#222226] focus:border-[#5b8def] rounded-xl px-3 py-2 text-sm text-[#ffffff] placeholder-[#8e8e93]/60 focus:outline-none"
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#8e8e93] mb-1.5">
                      Variation Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dynamic B-roll, Fast Intro Cut"
                      value={varName}
                      onChange={(e) => setVarName(e.target.value)}
                      className="w-full bg-[#000000] border border-[#222226] focus:border-[#5b8def] rounded-xl px-3 py-2 text-sm text-[#ffffff] placeholder-[#8e8e93]/60 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#8e8e93] mb-1.5">
                      Base Snapshot
                    </label>
                    <select
                      value={varBaseSnapshotId || (selectedBaseSnap ? selectedBaseSnap.id : '')}
                      onChange={(e) => setVarBaseSnapshotId(e.target.value)}
                      className="w-full bg-[#000000] border border-[#222226] focus:border-[#5b8def] rounded-xl px-3 py-2 text-sm text-[#ffffff] focus:outline-none cursor-pointer"
                    >
                      {[...project.snapshots].reverse().map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.message} ({s.timeline.clips.length} clip{s.timeline.clips.length !== 1 ? 's' : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-[#8e8e93]">
                    Clones all tracks and clips from the selected milestone into your private variation.
                  </span>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] font-semibold rounded-full text-sm transition flex items-center justify-center gap-2 shrink-0"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start Editing Variation &rarr;</span>
                  </button>
                </div>
              </form>
            </div>
          </section>
        ) : activeVariation ? (
          <section className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#ffffff] flex items-center gap-2">
                  <span>Variation Preview Player:</span>
                  <span className="text-[#ffffff] font-semibold">{activeVariation.name}</span>
                </h2>
                <span className="text-xs text-[#8e8e93]">
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
              <div className="flex items-center justify-between bg-[#121214] border border-[#222226] rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-[#8e8e93]"></span>
                  <span className="text-xs font-semibold text-[#ffffff]">
                    Variation: {activeVariation.name}
                  </span>
                  <span
                    className="text-[9px] uppercase px-2 py-0.5 rounded-full font-medium bg-[#1c1c20] text-[#8e8e93] border border-[#222226]"
                  >
                    {activeVariation.status}
                  </span>
                  {totalChangesCount > 0 && (
                    <span className="text-[10px] bg-[#c9973a]/12 text-[#c9973a] px-2.5 py-0.5 rounded-full font-mono">
                      {totalChangesCount} {totalChangesCount === 1 ? 'change' : 'changes'} ready
                    </span>
                  )}
                </div>
              </div>

              <TimelineView
                timeline={activeVariation.timeline}
                mediaList={project.media}
                editable={true}
                onUpdateTimeline={handleUpdateVariationTimeline}
                time={playerTime}
                onTime={setPlayerTime}
                title={`Variation Timeline: ${activeVariation.name}${activeVariation.status === 'combined' ? ' (Combined — Editable)' : ''}`}
              />
            </div>

            {/* Diff against base snapshot */}
            {baseSnapshot && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#ffffff]">
                    Your changes since &quot;{baseSnapshot.message}&quot;
                  </h3>
                </div>
                <DiffViewer
                  baseTimeline={baseSnapshot.timeline}
                  variationTimeline={activeVariation.timeline}
                />
              </div>
            )}
          </section>
        ) : null}


        {/* Dropzone & Media Bin */}
        {!shouldShowCreateVariation && activeVariation && (
          <section>
            <Dropzone
              mediaItems={project.media}
              onMediaAdded={handleMediaAdded}
              onBuildTimeline={handleAutoBuildTimeline}
              onAddMediaToTimeline={handleAddMediaToTimeline}
            />
          </section>
        )}

        {/* Lead Snapshots Log (Version History) - Read-only for collaborator */}
        <SnapshotHistoryPanel
          snapshots={project.snapshots}
          readOnly={true}
          activeVariationBaseSnapshotId={activeVariation?.baseSnapshotId}
          onBranchFromHere={(snapId) => {
            setVarBaseSnapshotId(snapId);
            setIsCreatingVariation(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </main>
    </div>
  );
}
