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
import { Clip, MediaItem, Snapshot, Timeline } from '@/lib/types';
import { buildTimeline } from '@/lib/buildTimeline';
import { diffTimelines } from '@/lib/diff';
import { hasTrackOverlaps, preventOverlaps } from '@/lib/vc';
import { Upload, Plus, ExternalLink, X, FileSearch, GitMerge, AlertTriangle, Copy } from 'lucide-react';

export default function LeadEditorPage() {
  const params = useParams();
  const projectId = (params?.id as string) || '';

  const { project, setProject, isLoading } = useProject(projectId);

  // Snapshot commit form state
  const [snapshotMsg, setSnapshotMsg] = useState('');
  const [snapshotAuthor, setSnapshotAuthor] = useState('Alex (Lead)');
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  // Playhead scrubber time shared between player and timeline
  const [playerTime, setPlayerTime] = useState<number>(0);

  // Selected review for diff view
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [requestChangeNote, setRequestChangeNote] = useState('');
  const [activeReviewAction, setActiveReviewAction] = useState<string | null>(null);
  const [showDraftDiff, setShowDraftDiff] = useState(false);

  const latestSnapshot = project && project.snapshots.length > 0
    ? project.snapshots[project.snapshots.length - 1]
    : null;

  // Active working timeline for Lead: masterDraft if dirty/uncommitted, otherwise latest snapshot timeline
  const activeTimeline = project?.masterDraft || latestSnapshot?.timeline || { clips: [] };

  // Calculate uncommitted working draft diff between latest snapshot and masterDraft
  const draftDiff = React.useMemo(() => {
    if (!latestSnapshot || !project?.masterDraft) return null;
    return diffTimelines(latestSnapshot.timeline, project.masterDraft);
  }, [latestSnapshot, project?.masterDraft]);

  const hasDraftChanges = Boolean(
    draftDiff && (draftDiff.addedCount > 0 || draftDiff.modifiedCount > 0 || draftDiff.removedCount > 0)
  );

  // Handler to update the active timeline (updates masterDraft only, like uncommitted local edits in git)
  const handleUpdateActiveTimeline = useCallback((updatedTimeline: Timeline) => {
    setProject((prev) => {
      if (!prev) return prev;
      if (prev.snapshots.length === 0 || (prev.snapshots.length === 1 && prev.snapshots[0].timeline.clips.length === 0)) {
        const initialSnap: Snapshot = {
          id: prev.snapshots[0]?.id || `snap_${Date.now()}`,
          parentId: null,
          author: snapshotAuthor || 'Alex (Lead)',
          message: 'Initial cut',
          createdAt: new Date().toISOString(),
          timeline: updatedTimeline,
        };
        return {
          ...prev,
          snapshots: [initialSnap],
          masterDraft: null,
        };
      }

      return {
        ...prev,
        masterDraft: updatedTimeline,
      };
    });
  }, [setProject, snapshotAuthor]);

  // Handler to publish current working draft to Main as a new formal Snapshot (Commit)
  const handlePublishDraft = useCallback((customMsg?: string) => {
    const commitMsg = (customMsg || snapshotMsg).trim() || `Cut update by ${snapshotAuthor || 'Alex (Lead)'}`;
    setProject((prev) => {
      if (!prev) return prev;
      const currentLatest = prev.snapshots.length > 0
        ? prev.snapshots[prev.snapshots.length - 1]
        : null;

      const newSnapshot: Snapshot = {
        id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        parentId: currentLatest ? currentLatest.id : null,
        author: snapshotAuthor.trim() || 'Alex (Lead)',
        message: commitMsg,
        createdAt: new Date().toISOString(),
        timeline: JSON.parse(JSON.stringify(activeTimeline)),
      };

      return {
        ...prev,
        snapshots: [...prev.snapshots, newSnapshot],
        masterDraft: null,
      };
    });

    setSnapshotMsg('');
    setIsCreatingSnapshot(false);
    setShowDraftDiff(false);
  }, [snapshotMsg, snapshotAuthor, setProject, activeTimeline]);

  // Handler to discard uncommitted working draft edits
  const handleDiscardDraft = useCallback(() => {
    if (!confirm('Discard all uncommitted draft edits and revert to the latest saved Snapshot?')) return;
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        masterDraft: null,
      };
    });
    setShowDraftDiff(false);
  }, [setProject]);

  // Auto-build timeline from uploaded media items (videos on V1, audio on A1)
  const handleAutoBuildTimeline = useCallback((items: MediaItem[]) => {
    const mediaToBuild = items && items.length > 0 ? items : (project?.media || []);
    const generatedTimeline = buildTimeline(mediaToBuild);
    handleUpdateActiveTimeline(generatedTimeline);
    setPlayerTime(0);
  }, [handleUpdateActiveTimeline, project?.media]);

  // Directly add a single media item with its full duration to the timeline (no duration prompt)
  const handleAddMediaToTimeline = useCallback((item: MediaItem) => {
    const isAudio =
      item.name.toLowerCase().endsWith('.mp3') ||
      item.name.toLowerCase().endsWith('.wav') ||
      item.name.toLowerCase().endsWith('.m4a') ||
      item.name.toLowerCase().endsWith('.aac') ||
      item.name.toLowerCase().endsWith('.flac');

    const targetTrack = isAudio ? 'A1' : 'V1';
    const trackClips = activeTimeline.clips.filter((c) => c.track === targetTrack);
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
      clips: [...activeTimeline.clips, newClip],
    }, newClip.id);

    handleUpdateActiveTimeline(resolved);
  }, [activeTimeline, playerTime, handleUpdateActiveTimeline]);

  // Auto-untangle any overlapping clips on the active master timeline
  useEffect(() => {
    if (activeTimeline && hasTrackOverlaps(activeTimeline)) {
      handleUpdateActiveTimeline(preventOverlaps(activeTimeline));
    }
  }, [activeTimeline, handleUpdateActiveTimeline]);

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
        <Header role="Lead editor" />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <h2 className="text-xl font-bold text-white">Project Not Found</h2>
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

  // Handler to create a formal new Snapshot (git commit)
  const handleCreateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = snapshotMsg.trim();
    if (!msg) return;
    handlePublishDraft(msg);
  };

  // Handler to add media items to project AND auto-sequence them onto the timeline
  const handleMediaAdded = (newItems: MediaItem[]) => {
    setProject((prev) => {
      if (!prev) return prev;
      const allMedia = [...prev.media, ...newItems];
      const generatedTimeline = buildTimeline(allMedia);

      if (prev.snapshots.length === 0) {
        return {
          ...prev,
          media: allMedia,
          snapshots: [
            {
              id: `snap_${Date.now()}`,
              parentId: null,
              author: snapshotAuthor || 'Lead Editor',
              message: 'Initial cut from media import',
              createdAt: new Date().toISOString(),
              timeline: generatedTimeline,
            },
          ],
          masterDraft: null,
        };
      }

      // If snapshots already exist, save into working draft so Lead can preview and publish!
      return {
        ...prev,
        media: allMedia,
        masterDraft: generatedTimeline,
      };
    });
    setPlayerTime(0);
  };

  // Handler to Combine / Merge Variation
  const handleCombineVariation = (reviewId: string) => {
    const review = project.reviews.find((r) => r.id === reviewId);
    if (!review) return;

    // Check if Main has moved forward since review was based (Merge Clash)
    if (latestSnapshot && review.baseSnapshotId !== latestSnapshot.id) {
      alert('Clash detected! Main has advanced past this review base snapshot. Collaborator must rebase before combining.');
      return;
    }

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
      v.id === variation.id ? { ...v, status: 'combined' as const, baseSnapshotId: mergeSnapshot.id } : v
    );

    setProject({
      ...project,
      snapshots: [...project.snapshots, mergeSnapshot],
      reviews: updatedReviews,
      variations: updatedVariations,
      masterDraft: null, // Merged timeline is now the official HEAD snapshot
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
    <div className="min-h-screen flex flex-col bg-[#000000] text-[#ffffff]">
      <Header projectId={project.id} projectName={project.name} role="Lead editor" />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 space-y-6">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121214] border border-[#222226] rounded-2xl p-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[#ffffff]">{project.name}</h1>
              <span className="text-xs bg-[#1c1c20] text-[#8e8e93] border border-[#222226] px-2.5 py-0.5 rounded-full font-mono">
                Lead
              </span>
            </div>
            <p className="text-xs text-[#8e8e93] mt-1 flex items-center gap-1.5">
              <span>Active Snapshot: <strong className="text-[#ffffff]">{latestSnapshot?.message || 'No snapshot'}</strong></span>
              {latestSnapshot && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(latestSnapshot.id)}
                  title={`Snapshot ID: ${latestSnapshot.id} (Click to copy)`}
                  className="p-1 text-[#8e8e93] hover:text-[#ffffff] transition rounded"
                >
                  <Copy className="w-3 h-3" />
                </button>
              )}
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {hasDraftChanges ? (
              <button
                type="button"
                onClick={() => handlePublishDraft()}
                className="px-3.5 py-1.5 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] text-xs font-semibold rounded-full transition flex items-center gap-1.5"
                title="Publish your current working draft as a snapshot"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Create Snapshot</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreatingSnapshot(!isCreatingSnapshot)}
                className="px-3.5 py-1.5 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] text-xs font-semibold rounded-full transition flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Snapshot</span>
              </button>
            )}

            <Link
              href={`/join/${project.id}${project.variations.length === 0 ? '?new=1' : ''}`}
              target="_blank"
              className="px-3.5 py-1.5 bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] text-xs font-medium rounded-full transition border border-[#222226] flex items-center gap-1.5"
              title="Open Collaborator view in a new tab to create or edit variations"
            >
              <span>Open Collaborator in New Tab</span>
              <ExternalLink className="w-3 h-3 text-[#8e8e93]" />
            </Link>
          </div>
        </div>

        {/* Create Snapshot Drawer / Panel */}
        {isCreatingSnapshot && (
          <form
            onSubmit={handleCreateSnapshot}
            className="p-4 bg-[#121214] border border-[#222226] rounded-2xl space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#222226] pb-2">
              <span className="font-semibold text-[#ffffff]">New Snapshot</span>
              <button
                type="button"
                onClick={() => setIsCreatingSnapshot(false)}
                className="text-[#8e8e93] hover:text-[#ffffff] flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[#8e8e93] mb-1">Author Name</label>
                <input
                  type="text"
                  value={snapshotAuthor}
                  onChange={(e) => setSnapshotAuthor(e.target.value)}
                  className="w-full bg-[#000000] border border-[#222226] rounded-lg px-2.5 py-1.5 text-[#ffffff] focus:outline-none focus:border-[#5b8def]"
                  required
                />
              </div>
              <div>
                <label className="block text-[#8e8e93] mb-1">Snapshot Message / Changelog</label>
                <input
                  type="text"
                  placeholder="e.g. Cut opening drone shot to 4s and color graded"
                  value={snapshotMsg}
                  onChange={(e) => setSnapshotMsg(e.target.value)}
                  className="w-full bg-[#000000] border border-[#222226] rounded-lg px-2.5 py-1.5 text-[#ffffff] focus:outline-none focus:border-[#5b8def]"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] font-semibold rounded-full transition"
            >
              Save Snapshot
            </button>
          </form>
        )}

        {/* Live Preview Player View */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#ffffff] uppercase tracking-wider flex items-center gap-2">
              <span>Preview Player</span>
              <span className="text-[10px] bg-[#1c1c20] text-[#8e8e93] border border-[#222226] px-2 py-0.5 rounded font-mono">
                V1 Video + A1 Audio + Gaps
              </span>
            </h2>
            <span className="text-xs text-[#8e8e93]">
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
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#ffffff] uppercase tracking-wider flex items-center gap-2">
              <span>Lead Master Timeline</span>
              {hasDraftChanges ? (
                <span className="text-[10px] bg-[#1c1c20] text-[#8e8e93] border border-[#222226] px-2 py-0.5 rounded-full font-mono font-medium">
                  Unpublished Draft
                </span>
              ) : (
                <span className="text-[10px] bg-[#1c1c20] text-[#8e8e93] border border-[#222226] px-2 py-0.5 rounded-full font-mono font-medium">
                  Clean Milestone
                </span>
              )}
            </h2>
            <span className="text-xs text-[#8e8e93]">
              Directly editable &bull; Private draft until published to Main
            </span>
          </div>

          {/* Working Tree / Branch Status Bar */}
          <div
            className="rounded-2xl border border-[#222226] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition bg-[#121214]"
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  hasDraftChanges ? 'bg-[#c9973a]' : 'bg-[#8e8e93]'
                }`}
              />
              <div>
                {hasDraftChanges ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#ffffff]">Working Draft: Unpublished Changes</span>
                      <span className="font-mono bg-[#c9973a]/12 px-2 py-0.5 rounded-full text-[11px] text-[#c9973a]">
                        +{draftDiff?.addedCount} added &bull; ~{draftDiff?.modifiedCount} modified &bull; -{draftDiff?.removedCount} removed
                      </span>
                    </div>
                    <p className="text-[11px] text-[#8e8e93]">
                      These edits stay in your private draft. Collaborators won&apos;t be interrupted until you publish.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#ffffff]">Clean Master Cut</span>
                      <span className="font-mono text-[#8e8e93] text-[11px]">
                        Snapshot #{project.snapshots.length}: &ldquo;{latestSnapshot?.message || 'Initial'}&rdquo;
                      </span>
                    </div>
                    <p className="text-[11px] text-[#8e8e93]">
                      Edit freely below. Edits remain private drafts until you click &ldquo;Create Snapshot&rdquo;.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {hasDraftChanges && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowDraftDiff(!showDraftDiff)}
                  className="px-3 py-1.5 bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] font-medium rounded-full border border-[#222226] transition"
                >
                  {showDraftDiff ? 'Hide Draft Diff' : 'Inspect Changes'}
                </button>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="px-3 py-1.5 bg-transparent hover:bg-[#1a1a1e] text-[#c9605f] hover:text-[#ffffff] font-medium rounded-full border border-[#222226] transition"
                  title="Discard all uncommitted draft edits and revert to the latest snapshot"
                >
                  Discard Draft
                </button>
                <button
                  type="button"
                  onClick={() => handlePublishDraft()}
                  className="px-3.5 py-1.5 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] font-semibold rounded-full transition flex items-center gap-1.5"
                  title="Create a new snapshot so collaborators can sync"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Create Snapshot</span>
                </button>
              </div>
            )}
          </div>

          {/* Optional Draft Diff Viewer */}
          {hasDraftChanges && showDraftDiff && latestSnapshot && project?.masterDraft && (
            <div className="bg-[#121214] border border-[#222226] rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-[#222226]">
                <span className="font-medium text-[#ffffff] text-xs">
                  Diff: Latest Snapshot ({latestSnapshot.id.slice(0, 10)}) &rarr; Current Working Draft
                </span>
                <button
                  type="button"
                  onClick={() => setShowDraftDiff(false)}
                  className="text-[#8e8e93] hover:text-[#ffffff] text-xs flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
              <DiffViewer
                baseTimeline={latestSnapshot.timeline}
                variationTimeline={project.masterDraft}
              />
            </div>
          )}

          <TimelineView
            timeline={activeTimeline}
            mediaList={project.media}
            editable={true}
            onUpdateTimeline={handleUpdateActiveTimeline}
            time={playerTime}
            onTime={setPlayerTime}
            title="Active Assembly Cut"
          />
        </section>

        {/* Dropzone & Media Bin */}
        <section>
          <Dropzone
            mediaItems={project.media}
            onMediaAdded={handleMediaAdded}
            onBuildTimeline={handleAutoBuildTimeline}
            onAddMediaToTimeline={handleAddMediaToTimeline}
          />
        </section>

        {/* Review Requests & Variations from Collaborators */}
        <section className="bg-[#121214] border border-[#222226] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#222226]">
            <div>
              <h2 className="text-base font-bold text-[#ffffff] flex items-center gap-2">
                <span>Incoming Review Requests</span>
                <span className="text-xs bg-[#1c1c20] text-[#8e8e93] border border-[#222226] px-2.5 py-0.5 rounded-full font-mono">
                  {project.reviews.filter((r) => r.status === 'open').length} Open
                </span>
              </h2>
              <p className="text-xs text-[#8e8e93]">
                Review, inspect timeline diffs, and combine variations proposed by collaborators
              </p>
            </div>
          </div>

          {project.reviews.length === 0 ? (
            <div className="text-center py-6 text-[#8e8e93] text-xs">
              No review requests submitted yet. Open the collaborator link in another tab to submit one!
            </div>
          ) : (
            <div className="space-y-4">
              {project.reviews.map((rev) => {
                const variation = project.variations.find((v) => v.id === rev.variationId);
                const baseSnap = project.snapshots.find((s) => s.id === rev.baseSnapshotId);
                // If base snapshot had clips, compare against it; if it was empty (e.g. snap_init), compare against active Master cut
                const effectiveBaseTimeline = (baseSnap && baseSnap.timeline.clips.length > 0)
                  ? baseSnap.timeline
                  : activeTimeline.clips.length > 0
                    ? activeTimeline
                    : latestSnapshot?.timeline || { clips: [] };
                const isSelected = selectedReviewId === rev.id;
                const revClash = Boolean(latestSnapshot && rev.status === 'open' && rev.baseSnapshotId !== latestSnapshot.id);

                return (
                  <div
                    key={rev.id}
                    className="rounded-xl border border-[#222226] p-4 transition bg-[#121214]"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#ffffff] text-sm">
                            {variation?.name || 'Variation'}
                          </span>
                          <span
                            className="text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-[#1c1c20] text-[#8e8e93] border border-[#222226]"
                          >
                            {rev.status}
                          </span>
                          {revClash && (
                            <span className="text-[10px] font-medium bg-[#c9973a]/12 text-[#c9973a] px-2.5 py-0.5 rounded-full flex items-center gap-1 font-mono">
                              <AlertTriangle className="w-3 h-3 text-[#c9973a]" />
                              <span>Clash Detected (Rebase Needed)</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#8e8e93]">{rev.message}</p>
                        <div className="text-[11px] text-[#8e8e93]">
                          Author: <span className="text-[#ffffff]">{variation?.author || 'Collaborator'}</span> &bull;{' '}
                          Base: <span title={`Snapshot ID: ${rev.baseSnapshotId}`} className="text-[#ffffff] font-medium">{project.snapshots.find((s) => s.id === rev.baseSnapshotId)?.message || 'Snapshot'}</span>
                        </div>
                        {rev.note && (
                          <div className="mt-1 p-2 bg-[#000000] border border-[#222226] rounded text-xs text-[#8e8e93]">
                            <strong className="text-[#ffffff]">Feedback:</strong> {rev.note}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <Link
                          href={`/lead/${projectId}/review/${rev.id}`}
                          className="px-2.5 py-1.5 bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] text-xs font-medium rounded border border-[#222226] transition flex items-center gap-1.5"
                          title="Open dedicated review page with Ghost Timeline"
                        >
                          <FileSearch className="w-3.5 h-3.5 text-[#8e8e93]" />
                          <span>Review Page</span>
                          <span>&rarr;</span>
                        </Link>

                        <button
                          type="button"
                          onClick={() => setSelectedReviewId(isSelected ? null : rev.id)}
                          className="px-2.5 py-1.5 bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] text-xs rounded border border-[#222226] transition"
                        >
                          {isSelected ? 'Hide Quick Diff' : 'Quick Diff'}
                        </button>

                        {rev.status === 'open' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCombineVariation(rev.id)}
                              disabled={revClash}
                              className={`px-3 py-1.5 text-xs font-medium rounded transition flex items-center gap-1.5 border border-[#222226] ${
                                revClash
                                    ? 'bg-transparent text-[#8e8e93]/40 border-[#222226]/40 cursor-not-allowed'
                                    : 'bg-transparent hover:bg-[#1a1a1e] text-[#ffffff]'
                              }`}
                              title={revClash ? 'Clash detected. Master cut moved forward. Collaborator must sync first.' : 'Combine variation'}
                            >
                              <GitMerge className="w-3.5 h-3.5 text-[#8e8e93]" />
                              <span>Combine</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveReviewAction(activeReviewAction === rev.id ? null : rev.id)}
                              className="px-3 py-1.5 bg-transparent hover:bg-[#1a1a1e] text-[#c9605f] text-xs font-medium rounded border border-[#222226] transition"
                            >
                              Request Changes
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Request changes note input */}
                    {activeReviewAction === rev.id && (
                      <div className="mt-3 p-3 bg-[#000000] rounded-lg border border-[#222226] space-y-2">
                        <label className="block text-xs text-[#8e8e93] font-medium">
                          Notes / Changes Required for Collaborator:
                        </label>
                        <input
                          type="text"
                          value={requestChangeNote}
                          onChange={(e) => setRequestChangeNote(e.target.value)}
                          placeholder="e.g., Shorten clip 2 by 0.5s and move to V2..."
                          className="w-full bg-[#121214] border border-[#222226] rounded px-2.5 py-1.5 text-xs text-[#ffffff]"
                        />
                        <div className="flex justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => setActiveReviewAction(null)}
                            className="px-2.5 py-1 text-xs text-[#8e8e93] hover:text-[#ffffff]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRequestChanges(rev.id)}
                            className="px-3 py-1 bg-transparent hover:bg-[#1a1a1e] text-[#c9605f] border border-[#222226] text-xs font-semibold rounded"
                          >
                            Send Feedback
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Diff Preview when opened */}
                    {isSelected && variation && (
                      <div className="mt-4 pt-3 border-t border-[#222226] space-y-3">
                        <div className="flex items-center justify-between text-xs pb-1">
                          <span className="text-[#8e8e93] font-medium">
                            Comparing proposed changes against:
                          </span>
                          <span className="text-[11px] font-mono text-[#ffffff] bg-[#1c1c20] border border-[#222226] px-2 py-0.5 rounded">
                            {baseSnap && baseSnap.timeline.clips.length > 0
                              ? `Base Snapshot: ${baseSnap.message} (${baseSnap.id.slice(0, 8)})`
                              : 'Current Master Timeline (HEAD)'}
                          </span>
                        </div>
                        <DiffViewer
                          baseTimeline={effectiveBaseTimeline}
                          variationTimeline={variation.timeline}
                        />
                        <div className="pt-2">
                          <span className="text-[11px] font-semibold text-[#8e8e93] block mb-1">
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
        <SnapshotHistoryPanel
          snapshots={project.snapshots}
          readOnly={false}
        />
      </main>
    </div>
  );
}
