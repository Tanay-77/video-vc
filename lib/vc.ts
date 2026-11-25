import { Clip, Project, ReviewRequest, Snapshot, Timeline, TrackType, Variation } from './types';

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export type CombineResult = Project | { clash: true };

export function isClash(result: CombineResult): result is { clash: true } {
  return 'clash' in result && result.clash === true;
}

/**
 * Creates a new project with snapshot 1 'Initial import'.
 */
export function createProject(
  name: string,
  timeline: Timeline,
  author: string
): Project {
  const projectId = generateId('proj');
  const initialSnapshotId = generateId('snap_init');

  const snapshot: Snapshot = {
    id: initialSnapshotId,
    parentId: null,
    author,
    message: 'Initial import',
    createdAt: new Date().toISOString(),
    timeline: deepClone(timeline),
  };

  return {
    id: projectId,
    name,
    media: [],
    snapshots: [snapshot],
    variations: [],
    reviews: [],
  };
}

/**
 * Opens a variation holding a deep copy of the latest snapshot's timeline,
 * with baseSnapshotId set to the latest snapshot's id.
 */
export function openCopy(
  project: Project,
  collaboratorName: string,
  variationName?: string
): Variation {
  const latestSnapshot =
    project.snapshots.length > 0
      ? project.snapshots[project.snapshots.length - 1]
      : null;

  const baseSnapshotId = latestSnapshot ? latestSnapshot.id : '';
  const baseTimeline = latestSnapshot ? latestSnapshot.timeline : { clips: [] };

  return {
    id: generateId('var'),
    name: variationName || `${collaboratorName}'s cut`,
    author: collaboratorName,
    baseSnapshotId,
    timeline: deepClone(baseTimeline),
    status: 'editing',
  };
}

// -------------------------------------------------------------
// Edit actions on a Timeline (pure and immutable, clip ids never change)
// -------------------------------------------------------------

/**
 * Trims a clip's duration. Updates dur and sourceOut accordingly.
 * Clip id never changes.
 */
export function trimClip(timeline: Timeline, id: string, newDur: number): Timeline {
  const validDur = Math.max(0.1, newDur);
  const updatedClips = timeline.clips.map((clip) => {
    if (clip.id === id) {
      return {
        ...clip,
        dur: validDur,
        sourceOut: clip.sourceIn + validDur * clip.speed,
      };
    }
    return { ...clip };
  });

  return { clips: updatedClips };
}

/**
 * Moves a clip to a new start time on the timeline.
 * Clip id never changes.
 */
export function moveClip(timeline: Timeline, id: string, newStart: number): Timeline {
  const validStart = Math.max(0, newStart);
  const updatedClips = timeline.clips.map((clip) => {
    if (clip.id === id) {
      return {
        ...clip,
        start: validStart,
      };
    }
    return { ...clip };
  });

  return { clips: updatedClips };
}

/**
 * Deletes a clip by id from the timeline.
 */
export function deleteClip(timeline: Timeline, id: string): Timeline {
  const updatedClips = timeline.clips
    .filter((clip) => clip.id !== id)
    .map((clip) => ({ ...clip }));

  return { clips: updatedClips };
}

/**
 * Adds a new clip to the timeline. Clip id is preserved.
 */
export function addClip(timeline: Timeline, clip: Clip): Timeline {
  return {
    clips: [...timeline.clips.map((c) => ({ ...c })), { ...clip }],
  };
}

/**
 * Sets the playback speed for a clip and adjusts sourceOut.
 * Clip id never changes.
 */
export function setSpeed(timeline: Timeline, id: string, speed: number): Timeline {
  const validSpeed = Math.max(0.1, speed);
  const updatedClips = timeline.clips.map((clip) => {
    if (clip.id === id) {
      return {
        ...clip,
        speed: validSpeed,
        sourceOut: clip.sourceIn + clip.dur * validSpeed,
      };
    }
    return { ...clip };
  });

  return { clips: updatedClips };
}

/**
 * Detects whether any clips on the same track overlap each other.
 * Multi-track video allows clips on DIFFERENT tracks to play simultaneously,
 * but clips on the SAME track (e.g. two clips on V1) cannot overlap.
 */
export function hasTrackOverlaps(timeline: Timeline): boolean {
  const tracks: TrackType[] = ['V2', 'V1', 'A1', 'CC'];
  const tolerance = 0.01;

  for (const track of tracks) {
    const trackClips = timeline.clips
      .filter((c) => c.track === track)
      .sort((a, b) => a.start - b.start);

    for (let i = 0; i < trackClips.length - 1; i++) {
      const current = trackClips[i];
      const next = trackClips[i + 1];
      if (next.start < current.start + current.dur - tolerance) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Resolves and prevents overlaps on all tracks.
 * Clips on different tracks can overlap (e.g. V1 video + V2 overlay + A1 audio).
 * For clips on the SAME track:
 * - If priorityClipId is provided (e.g. the clip just moved/added by the user),
 *   that clip retains its start time, and any colliding clips on that track are rippled forward.
 * - Otherwise, clips on each track are sorted by start time and placed sequentially flush
 *   so no clip overlaps another.
 */
export function preventOverlaps(
  timeline: Timeline,
  priorityClipId?: string
): Timeline {
  const tracks: TrackType[] = ['V2', 'V1', 'A1', 'CC'];
  const updatedClips: Clip[] = [];

  for (const track of tracks) {
    const trackClips = timeline.clips
      .filter((c) => c.track === track)
      .map((c) => ({ ...c }));

    if (trackClips.length <= 1) {
      updatedClips.push(...trackClips);
      continue;
    }

    if (priorityClipId && trackClips.some((c) => c.id === priorityClipId)) {
      const priorityClip = trackClips.find((c) => c.id === priorityClipId)!;
      const otherClips = trackClips.filter((c) => c.id !== priorityClipId);

      // Separate others into those that strictly end before priorityClip.start and those that start at/after
      const beforeClips = otherClips
        .filter((c) => c.start + c.dur <= priorityClip.start + 0.01)
        .sort((a, b) => a.start - b.start);

      // Adjust beforeClips sequentially if they overlap each other
      let currentEnd = 0;
      for (const c of beforeClips) {
        if (c.start < currentEnd) {
          c.start = parseFloat(currentEnd.toFixed(2));
        }
        currentEnd = parseFloat((c.start + c.dur).toFixed(2));
      }

      // If last beforeClip overlaps priorityClip, adjust priorityClip.start to be right after it
      if (beforeClips.length > 0) {
        const lastBefore = beforeClips[beforeClips.length - 1];
        if (lastBefore.start + lastBefore.dur > priorityClip.start) {
          priorityClip.start = parseFloat((lastBefore.start + lastBefore.dur).toFixed(2));
        }
      }

      // Clips that are at or after priorityClip
      const afterClips = otherClips
        .filter((c) => !beforeClips.includes(c))
        .sort((a, b) => a.start - b.start);

      let afterStart = parseFloat((priorityClip.start + priorityClip.dur).toFixed(2));
      for (const c of afterClips) {
        if (c.start < afterStart) {
          c.start = afterStart;
        }
        afterStart = parseFloat((c.start + c.dur).toFixed(2));
      }

      updatedClips.push(...beforeClips, priorityClip, ...afterClips);
    } else {
      // General chronological ordering without priority
      trackClips.sort((a, b) => a.start - b.start);
      let currentEnd = 0;
      for (const clip of trackClips) {
        if (clip.start < currentEnd) {
          clip.start = parseFloat(currentEnd.toFixed(2));
        }
        currentEnd = parseFloat((clip.start + clip.dur).toFixed(2));
        updatedClips.push(clip);
      }
    }
  }

  // Preserve any clips with custom/unrecognized track names if any
  const standardTrackSet = new Set(tracks);
  const otherTrackClips = timeline.clips
    .filter((c) => !standardTrackSet.has(c.track))
    .map((c) => ({ ...c }));
  updatedClips.push(...otherTrackClips);

  return { clips: updatedClips };
}

// -------------------------------------------------------------
// Version Control Actions on Project
// -------------------------------------------------------------

/**
 * Adds a snapshot after the latest one.
 * Uses the explicitly passed timeline, or project.masterDraft, or latest snapshot's timeline.
 * Clears project.masterDraft upon saving.
 */
export function saveSnapshot(
  project: Project,
  message: string,
  author?: string,
  timeline?: Timeline
): Project {
  const latestSnapshot =
    project.snapshots.length > 0
      ? project.snapshots[project.snapshots.length - 1]
      : null;

  const snapshotTimeline =
    timeline ||
    project.masterDraft ||
    (latestSnapshot ? latestSnapshot.timeline : { clips: [] });

  const newSnapshot: Snapshot = {
    id: generateId('snap'),
    parentId: latestSnapshot ? latestSnapshot.id : null,
    author: author || (latestSnapshot ? latestSnapshot.author : 'Lead Editor'),
    message,
    createdAt: new Date().toISOString(),
    timeline: deepClone(snapshotTimeline),
  };

  return {
    ...project,
    media: [...project.media.map((m) => ({ ...m }))],
    snapshots: [...project.snapshots.map((s) => deepClone(s)), newSnapshot],
    variations: [...project.variations.map((v) => deepClone(v))],
    reviews: [...project.reviews.map((r) => ({ ...r }))],
    masterDraft: null,
  };
}

/**
 * Discards uncommitted working draft on Main and reverts to latest snapshot timeline.
 */
export function discardMasterDraft(project: Project): Project {
  return {
    ...project,
    masterDraft: null,
  };
}

/**
 * Creates an open ReviewRequest and marks the variation 'in-review'.
 */
export function sendForReview(
  project: Project,
  variationId: string,
  message: string
): Project {
  const variation = project.variations.find((v) => v.id === variationId);
  if (!variation) {
    return deepClone(project);
  }

  const reviewRequest: ReviewRequest = {
    id: generateId('rev'),
    variationId,
    baseSnapshotId: variation.baseSnapshotId,
    message,
    status: 'open',
  };

  const updatedVariations = project.variations.map((v) => {
    if (v.id === variationId) {
      return {
        ...deepClone(v),
        status: 'in-review' as const,
      };
    }
    return deepClone(v);
  });

  return {
    ...project,
    media: [...project.media.map((m) => ({ ...m }))],
    snapshots: [...project.snapshots.map((s) => deepClone(s))],
    variations: updatedVariations,
    reviews: [...project.reviews.map((r) => ({ ...r })), reviewRequest],
  };
}

/**
 * Combines a variation into main:
 * If main has not changed since baseSnapshotId (i.e. latestSnapshot.id === review.baseSnapshotId),
 * adds a new snapshot with the variation's timeline and marks the review 'combined' and variation 'combined'.
 * If main has changed (latestSnapshot.id !== review.baseSnapshotId), returns { clash: true } and changes nothing.
 */
export function combine(project: Project, reviewId: string): CombineResult {
  const review = project.reviews.find((r) => r.id === reviewId);
  if (!review) {
    return deepClone(project);
  }

  const variation = project.variations.find((v) => v.id === review.variationId);
  if (!variation) {
    return deepClone(project);
  }

  const latestSnapshot =
    project.snapshots.length > 0
      ? project.snapshots[project.snapshots.length - 1]
      : null;

  // Check if main has changed since baseSnapshotId
  const latestSnapshotId = latestSnapshot ? latestSnapshot.id : '';
  if (latestSnapshotId !== review.baseSnapshotId) {
    // Main has moved forward or changed! Return clash and change nothing.
    return { clash: true };
  }

  // Main is clean: add a new snapshot with the variation's timeline
  const combinedSnapshot: Snapshot = {
    id: generateId('snap_combined'),
    parentId: latestSnapshot ? latestSnapshot.id : null,
    author: variation.author,
    message: `Combined: ${variation.name} (${review.message})`,
    createdAt: new Date().toISOString(),
    timeline: deepClone(variation.timeline),
  };

  const updatedReviews = project.reviews.map((r) => {
    if (r.id === reviewId) {
      return { ...r, status: 'combined' as const };
    }
    return { ...r };
  });

  const updatedVariations = project.variations.map((v) => {
    if (v.id === variation.id) {
      return { ...deepClone(v), status: 'combined' as const };
    }
    return deepClone(v);
  });

  return {
    ...project,
    media: [...project.media.map((m) => ({ ...m }))],
    snapshots: [...project.snapshots.map((s) => deepClone(s)), combinedSnapshot],
    variations: updatedVariations,
    reviews: updatedReviews,
  };
}

/**
 * Rebases a variation against Main's latest snapshot (like git pull --rebase).
 * - Matches clips between Main and variation (by id, or by mediaId+track / name+track).
 * - If a clip was deleted on Main (was in base, but not in main), it is removed from the variation.
 * - If a clip was trimmed/moved on Main and the collaborator did NOT edit that clip locally, it adopts Main's trim/timing.
 * - If the collaborator made local edits to that clip, the collaborator's edits are preserved.
 * - Truly new clips added on Main are appended.
 * - Truly new clips added locally by collaborator are preserved.
 * - Clips are kept free of collisions/overlaps via preventOverlaps.
 * - baseSnapshotId is updated to mainSnapshot.id.
 */
export function rebaseVariation(
  variation: Variation,
  baseSnapshot: Snapshot,
  mainSnapshot: Snapshot
): Variation {
  const mainClips = mainSnapshot.timeline.clips;
  const baseClips = baseSnapshot?.timeline.clips || [];
  const varClips = variation.timeline.clips;

  const matchedMainIds = new Set<string>();
  const updatedClips: Clip[] = [];

  for (const vClip of varClips) {
    // Find matching clip in main (exact ID first, then media+track or name+track)
    const mainMatch = mainClips.find(
      (mc) =>
        !matchedMainIds.has(mc.id) &&
        (mc.id === vClip.id ||
          (mc.track === vClip.track &&
            ((vClip.mediaId && mc.mediaId && vClip.mediaId === mc.mediaId) || vClip.name === mc.name)))
    );

    // Find matching clip in base to check if it was deleted on Main
    const baseMatch = baseClips.find(
      (bc) =>
        bc.id === vClip.id ||
        (bc.track === vClip.track &&
          ((vClip.mediaId && bc.mediaId && vClip.mediaId === bc.mediaId) || vClip.name === bc.name))
    );

    // If the clip existed in base but is now deleted on Main, remove it
    if (baseMatch && !mainMatch) {
      continue;
    }

    if (mainMatch) {
      matchedMainIds.add(mainMatch.id);

      // Check if collaborator made local private edits to this clip
      const locallyModified =
        baseMatch &&
        (Math.abs(vClip.dur - baseMatch.dur) > 0.04 ||
          Math.abs(vClip.start - baseMatch.start) > 0.04 ||
          Math.abs(vClip.sourceIn - baseMatch.sourceIn) > 0.04 ||
          Math.abs(vClip.speed - baseMatch.speed) > 0.01);

      if (!locallyModified) {
        // Adopt Lead's trim & timing directly!
        updatedClips.push({
          ...vClip,
          id: mainMatch.id,
          name: mainMatch.name,
          mediaId: mainMatch.mediaId,
          dur: mainMatch.dur,
          start: mainMatch.start,
          sourceIn: mainMatch.sourceIn,
          sourceOut: mainMatch.sourceOut,
          speed: mainMatch.speed,
        });
      } else {
        // Preserve collaborator's custom edits
        updatedClips.push({ ...vClip });
      }
    } else {
      // Brand new clip added locally by collaborator
      updatedClips.push({ ...vClip });
    }
  }

  // Add genuinely new clips from Main that were not matched
  for (const mc of mainClips) {
    if (!matchedMainIds.has(mc.id)) {
      updatedClips.push({ ...mc });
      matchedMainIds.add(mc.id);
    }
  }

  const resolvedTimeline = preventOverlaps({ clips: updatedClips });

  return {
    ...variation,
    baseSnapshotId: mainSnapshot.id,
    timeline: resolvedTimeline,
  };
}
