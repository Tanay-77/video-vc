import { Clip, Project, ReviewRequest, Snapshot, Timeline, Variation } from './types';

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
