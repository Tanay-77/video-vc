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
    setActionSuccessMsg(`Successfully combined "${variation?.name || 'Variation'}" into Main! Main timeline is now updated.`);
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
      <div className="min-h-screen bg-[#0a0a0d] flex items-center justify-center text-zinc-400">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-[#5856d6] border-t-transparent rounded-full animate-spin"></div>
          <span>Loading review...</span>
        </div>
      </div>
    );
  }

  if (!project || !review || !variation) {
    return (
      <div className="min-h-screen bg-[#0a0a0d] text-zinc-100 flex flex-col">
        <Header role="Lead editor" />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <h2 className="text-xl font-bold text-white">Review Request Not Found</h2>
          <p className="text-sm text-zinc-400">
            Could not find review &quot;{reviewId}&quot; in project &quot;{projectId}&quot;.
          </p>
          <Link
            href={`/lead/${projectId}`}
            className="inline-block px-4 py-2 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-full text-sm font-medium transition"
          >
            &larr; Return to Project Lead Workspace
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0d] text-zinc-100">
      <Header projectId={project.id} projectName={project.name} role="Lead editor" />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 space-y-6">
        {/* Navigation Breadcrumb & Back Link */}
        <div className="flex items-center justify-between">
          <Link
            href={`/lead/${project.id}`}
            className="inline-flex items-center text-xs font-medium text-[#0071e3] hover:text-[#0077ed] transition gap-1.5"
          >
            <span>&larr;</span>
            <span>Back to Lead Workspace</span>
          </Link>

          <span className="text-xs text-zinc-500 font-mono">
            Review ID: {review.id.slice(0, 10)}
          </span>
        </div>

        {/* Review Request Hero Header Banner */}
        <div className="p-5 bg-[#131317] border border-[#22222a] rounded-2xl space-y-3 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white">
                  Review: {variation.name}
                </h1>
                <span
                  className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${
                    review.status === 'open'
                      ? 'bg-amber-950/60 text-amber-300 border-amber-600/60'
                      : review.status === 'combined'
                      ? 'bg-[#6e40c9]/20 text-[#a371f7] border-[#6e40c9]/40'
                      : 'bg-rose-950/60 text-rose-300 border-rose-700/60'
                  }`}
                >
                  {review.status}
                </span>
              </div>
              <p className="text-sm text-zinc-300">
                &ldquo;{review.message}&rdquo;
              </p>
              <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  Author: <strong className="text-zinc-200">{variation.author}</strong>
                </span>
                <span>&bull;</span>
                <span>
                  Base Snapshot: <strong className="font-mono text-[#0071e3]">{baseSnapshot ? `${baseSnapshot.message} (${baseSnapshot.id.slice(0, 8)})` : review.baseSnapshotId.slice(0, 8)}</strong>
                </span>
                <span>&bull;</span>
                <span>
                  Variation Cut Length: <strong className="font-mono text-zinc-200">{variation.timeline.clips.length} clips</strong>
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
                    className={`px-4 py-2 text-xs font-semibold rounded-full transition shadow-sm flex items-center gap-1.5 ${
                      hasClash
                        ? 'bg-[#18181f] text-zinc-500 border border-[#262632] cursor-not-allowed'
                        : 'bg-[#34c759] hover:bg-[#2ea043] text-black shadow-lg'
                    }`}
                    title={hasClash ? 'Merge clash detected. Main cut moved forward.' : 'Combine and merge this cut directly into Main'}
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>Combine into Main</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRequestingChanges(!isRequestingChanges)}
                    className="px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-medium rounded-full border border-rose-800/60 transition"
                  >
                    Request Changes
                  </button>
                </>
              )}

              {review.status === 'combined' && (
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#6e40c9]/20 text-[#a371f7] border border-[#6e40c9]/40 shadow-sm">
                  <Check className="w-3.5 h-3.5" />
                  <span>Combined into Main Cut</span>
                </span>
              )}
            </div>
          </div>

          {/* Feedback note banner if changes-requested */}
          {review.note && (
            <div className="p-3 bg-rose-950/30 border border-rose-900/60 rounded-xl text-xs text-rose-300 space-y-1">
              <strong className="block font-semibold">Previous Feedback to Collaborator:</strong>
              <p>{review.note}</p>
            </div>
          )}
        </div>

        {/* Action Success Toast Banner */}
        {actionSuccessMsg && (
          <div className="p-4 bg-emerald-950/60 border border-emerald-700 rounded-2xl text-xs text-emerald-200 flex items-center justify-between shadow-lg">
            <span>{actionSuccessMsg}</span>
            <Link
              href={`/lead/${project.id}`}
              className="px-3.5 py-1.5 bg-[#34c759] hover:bg-[#2ea043] text-black rounded-full font-semibold transition"
            >
              View Updated Master Cut &rarr;
            </Link>
          </div>
        )}

        {/* Clash Warning Banner if Main moved forward */}
        {hasClash && review.status === 'open' && (
          <div className="p-4 bg-amber-950/30 border border-amber-600/60 rounded-2xl text-xs text-amber-200 space-y-1 shadow-lg">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Merge Clash Detected (Main HEAD Advanced)</span>
            </div>
            <p className="text-zinc-300">
              The Lead Master cut has moved forward since this variation was branched. The current HEAD snapshot is{' '}
              <strong className="font-mono text-[#0071e3]">{latestSnapshot?.message} ({latestSnapshot?.id.slice(0, 8)})</strong>,
              while this variation is based on{' '}
              <strong className="font-mono text-amber-300">{baseSnapshot?.id.slice(0, 8)}</strong>.
            </p>
            <p className="text-[11px] text-zinc-400">
              The &quot;Combine into Main&quot; button is disabled to protect against overwriting newer changes. The collaborator can click <strong>&quot;Sync from Main&quot;</strong> in their tab to rebase.
            </p>
          </div>
        )}

        {/* Request Changes Form Drawer */}
        {isRequestingChanges && review.status === 'open' && (
          <form
            onSubmit={handleRequestChanges}
            className="p-4 bg-[#131317] border border-rose-800/60 rounded-2xl space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#22222a] pb-2">
              <span className="font-semibold text-rose-300">
                Request Changes from {variation.author}
              </span>
              <button
                type="button"
                onClick={() => setIsRequestingChanges(false)}
                className="text-zinc-400 hover:text-white flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">
                Feedback &amp; required edits:
              </label>
              <textarea
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                placeholder="e.g. Please shorten the beach intro to 5 seconds and align V2 overlay with beat..."
                rows={3}
                className="w-full bg-[#18181f] border border-[#2a2a36] rounded-xl px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500"
                required
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsRequestingChanges(false)}
                className="px-3 py-1.5 text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-rose-700 hover:bg-rose-600 text-white font-semibold rounded-full transition"
              >
                Send Feedback &amp; Request Changes
              </button>
            </div>
          </form>
        )}

        {/* Section 1: Variation Video Preview Player */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span>Preview Variation Video Cut:</span>
              <span className="text-emerald-400 font-normal">{variation.name}</span>
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              Position: {playerTime.toFixed(2)}s
            </span>
          </div>

          <PlayerView
            timeline={variation.timeline}
            time={playerTime}
            onTime={setPlayerTime}
          />
        </section>

        {/* Section 2: Point 1 - Ghost Timeline Visualizer */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#0071e3]" />
              <span>Visual Ghost Timeline:</span>
              <span className="text-slate-500 font-normal normal-case">
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

        {/* Section 3: Point 2 - Prototype Change Cards */}
        {diffResult && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Change Summary Cards ({diffResult.items.filter((i) => i.status !== 'unchanged').length} changes):
            </h3>

            <ChangeCards diffResult={diffResult} />
          </section>
        )}

        {/* Section 4: Point 3 - Collapsible Git Text Diff */}
        {diffResult && (
          <section className="space-y-2">
            <GitTextPanel diffResult={diffResult} />
          </section>
        )}
      </main>
    </div>
  );
}
