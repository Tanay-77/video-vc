'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { PlayerView } from '@/components/PlayerView';
import { GhostTimelineView } from '@/components/GhostTimelineView';
import { ChangeCards, GitTextPanel } from '@/components/ReviewDiffComponents';
import { useProject } from '@/lib/sync';
import { saveProject } from '@/lib/store';
import { diffTimelines } from '@/lib/diff';
import { combine, isClash } from '@/lib/vc';
import { GitMerge, Check, AlertTriangle, Layers, X } from 'lucide-react';

export default function ReviewDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.id as string) || '';
  const reviewId = (params?.reviewId as string) || '';

  const { project, setProject, isLoading } = useProject(projectId);

  // Scrubber time for the player and ghost timeline
  const [playerTime, setPlayerTime] = useState<number>(0);

  // State for request changes form
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const review = project?.reviews.find((r) => r.id === reviewId);
  const variation = project?.variations.find((v) => v.id === review?.variationId);

  const latestSnapshot =
    project && project.snapshots.length > 0
      ? project.snapshots[project.snapshots.length - 1]
      : null;

  const latestWithClips = project
    ? [...project.snapshots].reverse().find((s) => s.timeline.clips.length > 0) || latestSnapshot
    : null;

  const baseSnapshot =
    project?.snapshots.find((s) => s.id === review?.baseSnapshotId) || latestWithClips || latestSnapshot;

  // Effective base timeline for accurate diffs
  const effectiveBaseTimeline = useMemo(() => {
    if (baseSnapshot && baseSnapshot.timeline.clips.length > 0) {
      return baseSnapshot.timeline;
    }
    if (latestWithClips && latestWithClips.timeline.clips.length > 0) {
      return latestWithClips.timeline;
    }
    return { clips: [] };
  }, [baseSnapshot, latestWithClips]);

  // Compute diff between base snapshot and variation head
  const diffResult = useMemo(() => {
    if (!variation) return null;
    return diffTimelines(effectiveBaseTimeline, variation.timeline);
  }, [effectiveBaseTimeline, variation]);

  // Clash check: Does Main have new commits since this variation branched?
  const hasClash = Boolean(
    latestSnapshot && review && latestSnapshot.id !== review.baseSnapshotId
  );

  // Handler: Combine into main
  const handleCombineIntoMain = () => {
    if (!project || !review) return;

    const result = combine(project, review.id);

    if (isClash(result)) {
      alert('Clash detected! Main has advanced past this review base snapshot. Collaborator must rebase before combining.');
      return;
    }

    // Merged cut is now the official HEAD on Main, so clear masterDraft
    const updatedProject = {
      ...result,
      masterDraft: null,
    };

    saveProject(updatedProject);
    setProject(updatedProject);
    setActionSuccessMsg(`Successfully combined "${variation?.name || 'Variation'}" into the timeline.`);
  };

  // Handler: Request changes
  const handleRequestChanges = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !review) return;
    const note = feedbackNote.trim();
    if (!note) return;

    const updatedReviews = project.reviews.map((r) =>
      r.id === review.id ? { ...r, status: 'changes-requested' as const, note } : r
    );

    const updatedVariations = project.variations.map((v) =>
      v.id === review.variationId ? { ...v, status: 'editing' as const } : v
    );

    const updatedProject = {
      ...project,
      reviews: updatedReviews,
      variations: updatedVariations,
    };

    saveProject(updatedProject);
    setProject(updatedProject);
    setIsRequestingChanges(false);
    setActionSuccessMsg(`Feedback note sent to collaborator. Review marked as "changes-requested".`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center text-[#8e8e93]">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-[#5b8def] border-t-transparent rounded-full animate-spin"></div>
          <span>Loading review...</span>
        </div>
      </div>
    );
  }

  if (!project || !review || !variation) {
    return (
      <div className="min-h-screen bg-[#000000] text-[#ffffff] flex flex-col">
        <Header role="Lead editor" />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <h2 className="text-xl font-bold text-[#ffffff]">Review Request Not Found</h2>
          <p className="text-sm text-[#8e8e93]">
            Could not find review &quot;{reviewId}&quot; in project &quot;{projectId}&quot;.
          </p>
          <Link
            href={`/lead/${projectId}`}
            className="inline-block px-4 py-2 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] rounded-full text-sm font-semibold transition"
          >
            &larr; Return to Project Lead Workspace
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#000000] text-[#ffffff]">
      <Header projectId={project.id} projectName={project.name} role="Lead editor" />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 space-y-6">
        {/* Navigation Breadcrumb & Back Link */}
        <div className="flex items-center justify-between">
          <Link
            href={`/lead/${project.id}`}
            className="inline-flex items-center text-xs font-medium text-[#8e8e93] hover:text-[#ffffff] transition gap-1.5"
          >
            <span>&larr;</span>
            <span>Back to Lead Workspace</span>
          </Link>

          <span className="text-xs text-[#8e8e93] font-mono">
            Review ID: {review.id.slice(0, 10)}
          </span>
        </div>

        {/* Review Request Hero Header Banner */}
        <div className="p-5 bg-[#121214] border border-[#222226] rounded-2xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-[#ffffff]">
                  Review: {variation.name}
                </h1>
                <span
                  className="text-[10px] font-medium uppercase px-2.5 py-0.5 rounded-full bg-[#1c1c20] text-[#8e8e93] border border-[#222226]"
                >
                  {review.status}
                </span>
              </div>
              <p className="text-sm text-[#ffffff]">
                &ldquo;{review.message}&rdquo;
              </p>
              <div className="text-xs text-[#8e8e93] flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  Author: <strong className="text-[#ffffff]">{variation.author}</strong>
                </span>
                <span>&bull;</span>
                <span>
                  Base Snapshot: <strong className="text-[#ffffff]" title={`Snapshot ID: ${baseSnapshot?.id || review.baseSnapshotId}`}>{baseSnapshot?.message || 'Snapshot'}</strong>
                </span>
                <span>&bull;</span>
                <span>
                  Variation Cut Length: <strong className="font-mono text-[#ffffff]">{variation.timeline.clips.length} clips</strong>
                </span>
              </div>
            </div>

            {/* Top Primary Actions */}
            <div className="flex items-center space-x-2 shrink-0">
              {review.status === 'open' && (
                <>
                  <button
                    type="button"
                    onClick={handleCombineIntoMain}
                    disabled={hasClash}
                    className={`px-4 py-2 text-xs font-semibold rounded-full transition flex items-center gap-1.5 ${
                      hasClash
                        ? 'bg-[#1c1c20] text-[#8e8e93]/40 border border-[#222226] cursor-not-allowed'
                        : 'bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000]'
                    }`}
                    title={hasClash ? 'Merge clash detected. Main cut moved forward.' : 'Combine this cut directly into Main'}
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>Combine</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRequestingChanges(!isRequestingChanges)}
                    className="px-3.5 py-2 bg-transparent hover:bg-[#1a1a1e] text-[#c9605f] text-xs font-medium rounded-full border border-[#222226] transition"
                  >
                    Request Changes
                  </button>
                </>
              )}

              {review.status === 'combined' && (
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#1c1c20] text-[#8e8e93] border border-[#222226]">
                  <Check className="w-3.5 h-3.5" />
                  <span>Combined</span>
                </span>
              )}
            </div>
          </div>

          {/* Feedback note banner if changes-requested */}
          {review.note && (
            <div className="p-3 bg-[#000000] border border-[#222226] rounded-xl text-xs text-[#8e8e93] space-y-1">
              <strong className="block font-semibold text-[#ffffff]">Previous Feedback to Collaborator:</strong>
              <p>{review.note}</p>
            </div>
          )}
        </div>

        {/* Action Success Toast Banner */}
        {actionSuccessMsg && (
          <div className="p-4 bg-[#121214] border border-[#222226] rounded-2xl text-xs text-[#ffffff] flex items-center justify-between">
            <span>{actionSuccessMsg}</span>
            <Link
              href={`/lead/${project.id}`}
              className="px-3.5 py-1.5 bg-[#5b8def] hover:bg-[#6c9bf5] text-[#000000] rounded-full font-semibold transition"
            >
              View Updated Master Cut &rarr;
            </Link>
          </div>
        )}

        {/* Clash Warning Banner if Main moved forward */}
        {hasClash && review.status === 'open' && (
          <div className="p-4 bg-[#121214] border border-[#222226] rounded-2xl text-xs text-[#ffffff] space-y-1">
            <div className="flex items-center gap-2 font-semibold text-[#ffffff]">
              <AlertTriangle className="w-4 h-4 text-[#c9973a] shrink-0" />
              <span>Merge Clash Detected (Main HEAD Advanced)</span>
            </div>
            <p className="text-[#8e8e93]">
              The Lead Master cut has moved forward since this variation was branched. The current HEAD snapshot is{' '}
              <strong className="font-mono text-[#ffffff]">{latestSnapshot?.message} ({latestSnapshot?.id.slice(0, 8)})</strong>,
              while this variation is based on{' '}
              <strong className="font-mono text-[#ffffff]">{baseSnapshot?.id.slice(0, 8)}</strong>.
            </p>
            <p className="text-[11px] text-[#8e8e93]">
              The &quot;Combine&quot; button is disabled to protect against overwriting newer changes. The collaborator can click <strong>&quot;Sync from Main&quot;</strong> in their tab to rebase.
            </p>
          </div>
        )}

        {/* Request Changes Form Drawer */}
        {isRequestingChanges && review.status === 'open' && (
          <form
            onSubmit={handleRequestChanges}
            className="p-4 bg-[#121214] border border-[#222226] rounded-2xl space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#222226] pb-2">
              <span className="font-semibold text-[#c9605f]">
                Request Changes from {variation.author}
              </span>
              <button
                type="button"
                onClick={() => setIsRequestingChanges(false)}
                className="text-[#8e8e93] hover:text-[#ffffff] flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>

            <div>
              <label className="block text-[#8e8e93] mb-1">
                Feedback &amp; required edits:
              </label>
              <textarea
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                placeholder="e.g. Please shorten the beach intro to 5 seconds and align V2 overlay with beat..."
                rows={3}
                className="w-full bg-[#000000] border border-[#222226] rounded-xl px-2.5 py-1.5 text-[#ffffff] focus:outline-none focus:border-[#5b8def]"
                required
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsRequestingChanges(false)}
                className="px-3 py-1.5 text-[#8e8e93] hover:text-[#ffffff]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-transparent hover:bg-[#1a1a1e] text-[#c9605f] border border-[#222226] font-semibold rounded-full transition"
              >
                Send Feedback &amp; Request Changes
              </button>
            </div>
          </form>
        )}

        {/* Section 1: Variation Video Preview Player */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#ffffff] flex items-center gap-2">
              <span>Preview Variation Video Cut:</span>
              <span className="text-[#ffffff] font-semibold">{variation.name}</span>
            </h2>
            <span className="text-xs text-[#8e8e93] font-mono">
              Position: {playerTime.toFixed(2)}s
            </span>
          </div>

          <PlayerView
            timeline={variation.timeline}
            time={playerTime}
            onTime={setPlayerTime}
          />
        </section>

        {/* Section 2: Ghost Timeline Visualizer */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#ffffff] uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#8e8e93]" />
              <span>Visual Ghost Timeline:</span>
              <span className="text-[#8e8e93] font-normal normal-case">
                Base Cut vs Variation (Removed &amp; Trimmed Tails Highlighted)
              </span>
            </h3>
          </div>

          <GhostTimelineView
            baseTimeline={effectiveBaseTimeline}
            variationTimeline={variation.timeline}
            time={playerTime}
            onTime={setPlayerTime}
          />
        </section>

        {/* Section 3: Change Cards */}
        {diffResult && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-[#ffffff] uppercase tracking-wider">
              Change Summary Cards ({diffResult.items.filter((i) => i.status !== 'unchanged').length} changes):
            </h3>

            <ChangeCards diffResult={diffResult} />
          </section>
        )}

        {/* Section 4: Collapsible Git Text Diff */}
        {diffResult && (
          <section className="space-y-2">
            <GitTextPanel diffResult={diffResult} />
          </section>
        )}
      </main>
    </div>
  );
}
