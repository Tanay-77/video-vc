import { describe, it, expect } from 'vitest';
import {
  createProject,
  openCopy,
  trimClip,
  moveClip,
  deleteClip,
  addClip,
  setSpeed,
  saveSnapshot,
  discardMasterDraft,
  hasTrackOverlaps,
  preventOverlaps,
  sendForReview,
  combine,
  isClash,
  rebaseVariation,
} from '../lib/vc';
import { Clip, Timeline, Snapshot, Variation } from '../lib/types';

describe('lib/vc.ts - Pure Immutable Version Control Functions', () => {
  const sampleClip1: Clip = {
    id: 'clip-1-uuid',
    mediaId: 'media-1',
    track: 'V1',
    name: 'Opening Shot',
    start: 0,
    dur: 5.0,
    sourceIn: 1.0,
    sourceOut: 6.0,
    speed: 1.0,
  };

  const sampleClip2: Clip = {
    id: 'clip-2-uuid',
    mediaId: 'media-2',
    track: 'V1',
    name: 'Action Scene',
    start: 5.0,
    dur: 4.0,
    sourceIn: 0,
    sourceOut: 4.0,
    speed: 1.0,
  };

  const sampleTimeline: Timeline = {
    clips: [sampleClip1, sampleClip2],
  };

  describe('createProject', () => {
    it('creates a project with snapshot 1 "Initial import"', () => {
      const project = createProject('My Film', sampleTimeline, 'Lead Director');

      expect(project.name).toBe('My Film');
      expect(project.snapshots.length).toBe(1);

      const snap1 = project.snapshots[0];
      expect(snap1.message).toBe('Initial import');
      expect(snap1.author).toBe('Lead Director');
      expect(snap1.parentId).toBeNull();
      expect(snap1.timeline.clips.length).toBe(2);
      expect(snap1.timeline.clips[0].id).toBe('clip-1-uuid');

      expect(project.variations).toEqual([]);
      expect(project.reviews).toEqual([]);
      expect(project.media).toEqual([]);
    });

    it('is pure and deeply clones the input timeline', () => {
      const mutableTimeline: Timeline = {
        clips: [{ ...sampleClip1 }],
      };

      const project = createProject('Pure Test', mutableTimeline, 'Author');
      mutableTimeline.clips[0].dur = 999;
      mutableTimeline.clips.push({ ...sampleClip2 });

      expect(project.snapshots[0].timeline.clips.length).toBe(1);
      expect(project.snapshots[0].timeline.clips[0].dur).toBe(5.0);
    });
  });

  describe('openCopy', () => {
    it('creates a Variation holding a deep copy of the latest snapshot timeline with baseSnapshotId set', () => {
      const project = createProject('Project A', sampleTimeline, 'Lead Editor');
      const latestSnap = project.snapshots[0];

      const variation = openCopy(project, 'Jordan (Editor)');

      expect(variation.author).toBe('Jordan (Editor)');
      expect(variation.status).toBe('editing');
      expect(variation.baseSnapshotId).toBe(latestSnap.id);
      expect(variation.timeline.clips.length).toBe(2);
      expect(variation.timeline.clips[0].id).toBe('clip-1-uuid');

      // Modifying variation timeline does not affect project
      variation.timeline.clips[0].dur = 2.0;
      expect(project.snapshots[0].timeline.clips[0].dur).toBe(5.0);
    });
  });

  describe('Timeline edit actions (pure and immutable, clip ids never change)', () => {
    it('trimClip: adjusts duration and sourceOut, preserves clip id, does not mutate original', () => {
      const updated = trimClip(sampleTimeline, 'clip-1-uuid', 3.0);

      expect(updated.clips[0].id).toBe('clip-1-uuid');
      expect(updated.clips[0].dur).toBe(3.0);
      // sourceOut = sourceIn (1.0) + newDur (3.0) * speed (1.0) = 4.0
      expect(updated.clips[0].sourceOut).toBe(4.0);

      // Original is untouched
      expect(sampleTimeline.clips[0].dur).toBe(5.0);
      expect(sampleTimeline.clips[0].sourceOut).toBe(6.0);
    });

    it('moveClip: adjusts start time, preserves clip id, does not mutate original', () => {
      const updated = moveClip(sampleTimeline, 'clip-2-uuid', 8.5);

      expect(updated.clips[1].id).toBe('clip-2-uuid');
      expect(updated.clips[1].start).toBe(8.5);

      // Original is untouched
      expect(sampleTimeline.clips[1].start).toBe(5.0);
    });

    it('deleteClip: removes clip by id, does not mutate original', () => {
      const updated = deleteClip(sampleTimeline, 'clip-1-uuid');

      expect(updated.clips.length).toBe(1);
      expect(updated.clips[0].id).toBe('clip-2-uuid');

      // Original is untouched
      expect(sampleTimeline.clips.length).toBe(2);
    });

    it('addClip: adds a clip, preserves clip id, does not mutate original', () => {
      const newClip: Clip = {
        id: 'clip-3-uuid',
        mediaId: 'media-3',
        track: 'A1',
        name: 'Soundtrack BGM',
        start: 0,
        dur: 10.0,
        sourceIn: 0,
        sourceOut: 10.0,
        speed: 1.0,
      };

      const updated = addClip(sampleTimeline, newClip);

      expect(updated.clips.length).toBe(3);
      expect(updated.clips[2].id).toBe('clip-3-uuid');

      // Original is untouched
      expect(sampleTimeline.clips.length).toBe(2);
    });

    it('setSpeed: updates playback speed and recalculates sourceOut, clip id never changes', () => {
      const updated = setSpeed(sampleTimeline, 'clip-1-uuid', 2.0);

      expect(updated.clips[0].id).toBe('clip-1-uuid');
      expect(updated.clips[0].speed).toBe(2.0);
      // sourceOut = sourceIn (1.0) + dur (5.0) * speed (2.0) = 11.0
      expect(updated.clips[0].sourceOut).toBe(11.0);

      // Original untouched
      expect(sampleTimeline.clips[0].speed).toBe(1.0);
    });
  });

  describe('saveSnapshot', () => {
    it('adds a snapshot after the latest one with the latest timeline and correct parentId', () => {
      const project = createProject('Doc Film', sampleTimeline, 'Lead');
      const snap1 = project.snapshots[0];

      const updatedProject = saveSnapshot(project, 'Trimmed intro and color corrected', 'Lead');

      expect(updatedProject.snapshots.length).toBe(2);

      const snap2 = updatedProject.snapshots[1];
      expect(snap2.message).toBe('Trimmed intro and color corrected');
      expect(snap2.parentId).toBe(snap1.id);
      expect(snap2.timeline.clips.length).toBe(2);

      // Immutability
      expect(project.snapshots.length).toBe(1);
    });

    it('uses masterDraft when saving a snapshot and resets masterDraft to null', () => {
      const project = createProject('Draft Film', sampleTimeline, 'Lead');
      const draftTimeline: Timeline = {
        clips: [
          {
            id: 'clip-new-draft',
            mediaId: 'media-draft',
            track: 'V1',
            name: 'New Draft Cut',
            start: 0,
            dur: 10.0,
            sourceIn: 0,
            sourceOut: 10.0,
            speed: 1.0,
          },
        ],
      };

      const projectWithDraft = { ...project, masterDraft: draftTimeline };
      const saved = saveSnapshot(projectWithDraft, 'Published working draft', 'Lead');

      expect(saved.snapshots.length).toBe(2);
      expect(saved.snapshots[1].message).toBe('Published working draft');
      expect(saved.snapshots[1].timeline.clips.length).toBe(1);
      expect(saved.snapshots[1].timeline.clips[0].id).toBe('clip-new-draft');
      expect(saved.masterDraft).toBeNull();
    });

    it('discardMasterDraft resets masterDraft without modifying snapshots', () => {
      const project = createProject('Draft Film', sampleTimeline, 'Lead');
      const projectWithDraft = {
        ...project,
        masterDraft: { clips: [] },
      };

      const discarded = discardMasterDraft(projectWithDraft);
      expect(discarded.masterDraft).toBeNull();
      expect(discarded.snapshots.length).toBe(1);
      expect(discarded.snapshots[0].timeline.clips.length).toBe(2);
    });
  });

  describe('sendForReview', () => {
    it('creates an open ReviewRequest and marks the variation "in-review"', () => {
      const project = createProject('Ad Reel', sampleTimeline, 'Director');
      const variation = openCopy(project, 'Taylor (Assistant)');
      const projectWithVar = { ...project, variations: [variation] };

      const reviewProject = sendForReview(
        projectWithVar,
        variation.id,
        'Shortened scene 2 for faster pacing'
      );

      expect(reviewProject.reviews.length).toBe(1);
      const review = reviewProject.reviews[0];
      expect(review.status).toBe('open');
      expect(review.variationId).toBe(variation.id);
      expect(review.baseSnapshotId).toBe(variation.baseSnapshotId);
      expect(review.message).toBe('Shortened scene 2 for faster pacing');

      const updatedVar = reviewProject.variations.find((v) => v.id === variation.id);
      expect(updatedVar?.status).toBe('in-review');

      // Immutability: projectWithVar is untouched
      expect(projectWithVar.reviews.length).toBe(0);
      expect(projectWithVar.variations[0].status).toBe('editing');
    });
  });

  describe('combine', () => {
    it('clean merge: adds a new snapshot with variation timeline and marks review & variation "combined" when main has not changed', () => {
      const project = createProject('Feature', sampleTimeline, 'Lead');
      const variation = openCopy(project, 'Alex (Collaborator)');

      // Collaborator trims clip 1 to 2.5s
      const modifiedVariation = {
        ...variation,
        timeline: trimClip(variation.timeline, 'clip-1-uuid', 2.5),
      };

      const projectWithVar = { ...project, variations: [modifiedVariation] };
      const projectInReview = sendForReview(projectWithVar, modifiedVariation.id, 'Pacing fix on V1');
      const reviewId = projectInReview.reviews[0].id;

      // Combine into main
      const combined = combine(projectInReview, reviewId);

      expect(isClash(combined)).toBe(false);
      if (!isClash(combined)) {
        expect(combined.snapshots.length).toBe(2);

        const mergedSnap = combined.snapshots[1];
        expect(mergedSnap.timeline.clips[0].dur).toBe(2.5);
        expect(mergedSnap.parentId).toBe(project.snapshots[0].id);

        const rev = combined.reviews.find((r) => r.id === reviewId);
        expect(rev?.status).toBe('combined');

        const varItem = combined.variations.find((v) => v.id === modifiedVariation.id);
        expect(varItem?.status).toBe('combined');
      }

      // Immutability: projectInReview snapshots remained at 1
      expect(projectInReview.snapshots.length).toBe(1);
    });

    it('clash detection: returns { clash: true } and changes nothing if main has changed since baseSnapshotId', () => {
      const project = createProject('Feature', sampleTimeline, 'Lead');
      const baseSnap = project.snapshots[0];

      // Collaborator branches variation off baseSnap
      const variation = openCopy(project, 'Jordan');
      expect(variation.baseSnapshotId).toBe(baseSnap.id);

      const projectWithVar = { ...project, variations: [variation] };
      const projectInReview = sendForReview(projectWithVar, variation.id, 'My cut');
      const reviewId = projectInReview.reviews[0].id;

      // Meanwhile, the Lead commits a new snapshot on main!
      const projectWithMainAdvanced = saveSnapshot(projectInReview, 'Lead commit while review was pending', 'Lead');

      expect(projectWithMainAdvanced.snapshots.length).toBe(2);
      const newHeadSnap = projectWithMainAdvanced.snapshots[1];
      expect(newHeadSnap.id).not.toBe(baseSnap.id);

      // Now attempting to combine must detect the clash!
      const result = combine(projectWithMainAdvanced, reviewId);

      expect(isClash(result)).toBe(true);
      expect(result).toEqual({ clash: true });

      // Verifies nothing was changed in projectWithMainAdvanced
      expect(projectWithMainAdvanced.snapshots.length).toBe(2);
      expect(projectWithMainAdvanced.reviews[0].status).toBe('open');
      expect(projectWithMainAdvanced.variations[0].status).toBe('in-review');
    });
  });

  describe('Track Overlap Prevention (hasTrackOverlaps & preventOverlaps)', () => {
    it('hasTrackOverlaps: detects when two clips on the same track overlap in time', () => {
      const overlapping: Timeline = {
        clips: [
          { ...sampleClip1, track: 'V1', start: 0, dur: 5.0 },
          { ...sampleClip2, track: 'V1', start: 2.0, dur: 4.0 }, // Overlaps between 2.0s and 5.0s!
        ],
      };
      expect(hasTrackOverlaps(overlapping)).toBe(true);
    });

    it('hasTrackOverlaps: allows clips on different tracks to play simultaneously without flagging overlap', () => {
      const multiTrack: Timeline = {
        clips: [
          { ...sampleClip1, track: 'V1', start: 0, dur: 5.0 }, // Primary video
          { ...sampleClip2, track: 'V2', start: 1.0, dur: 3.0 }, // B-Roll overlay
          { ...sampleClip1, id: 'audio-bgm', track: 'A1', start: 0, dur: 10.0 }, // BGM
        ],
      };
      expect(hasTrackOverlaps(multiTrack)).toBe(false);
    });

    it('preventOverlaps: resolves overlapping clips on the same track sequentially', () => {
      const overlapping: Timeline = {
        clips: [
          { ...sampleClip1, track: 'V1', start: 0, dur: 5.0 },
          { ...sampleClip2, track: 'V1', start: 2.0, dur: 4.0 }, // Overlaps!
        ],
      };

      const resolved = preventOverlaps(overlapping);
      expect(hasTrackOverlaps(resolved)).toBe(false);

      const clip1 = resolved.clips.find((c) => c.id === sampleClip1.id);
      const clip2 = resolved.clips.find((c) => c.id === sampleClip2.id);

      expect(clip1?.start).toBe(0);
      expect(clip1?.dur).toBe(5.0);
      expect(clip2?.start).toBe(5.0); // Shifted flush to clip1's end
      expect(clip2?.dur).toBe(4.0);
    });

    it('preventOverlaps with priorityClipId: preserves priority clip position and shifts colliding clips forward', () => {
      const timeline: Timeline = {
        clips: [
          { ...sampleClip1, track: 'V1', start: 0, dur: 8.0 },
          { ...sampleClip2, track: 'V1', start: 3.0, dur: 4.0 }, // Dragged or added into 3.0s!
        ],
      };

      // Clip 2 has priority at 3.0s
      const resolved = preventOverlaps(timeline, sampleClip2.id);
      expect(hasTrackOverlaps(resolved)).toBe(false);

      const clip2 = resolved.clips.find((c) => c.id === sampleClip2.id);
      expect(clip2?.start).toBe(3.0);
    });
  });

  describe('rebaseVariation (Git pull --rebase semantics)', () => {
    it('applies Lead trims cleanly to the variation without duplicate clips or gaps', () => {
      const baseSnap: Snapshot = {
        id: 'snap-1',
        parentId: null,
        author: 'Alex (Lead)',
        message: 'Initial cut',
        createdAt: new Date().toISOString(),
        timeline: {
          clips: [
            { id: 'c1', mediaId: 'm1', track: 'V1', name: 'clip_1.mp4', start: 0, dur: 10.0, sourceIn: 0, sourceOut: 10.0, speed: 1 },
            { id: 'c2', mediaId: 'm2', track: 'V1', name: 'clip_2.mp4', start: 10.0, dur: 8.0, sourceIn: 0, sourceOut: 8.0, speed: 1 },
          ],
        },
      };

      // Collaborator variation branched from snap-1
      const variation: Variation = {
        id: 'var-1',
        name: "Jordan's Cut",
        author: 'Jordan',
        baseSnapshotId: 'snap-1',
        status: 'editing',
        timeline: JSON.parse(JSON.stringify(baseSnap.timeline)),
      };

      // Lead trims clip 1 from 10.0s down to 6.3s, moves clip 2 to 6.3s, and pushes snap-2
      const mainSnap: Snapshot = {
        id: 'snap-2',
        parentId: 'snap-1',
        author: 'Alex (Lead)',
        message: 'Trimmed intro clip to 6.3s',
        createdAt: new Date().toISOString(),
        timeline: {
          clips: [
            { id: 'c1', mediaId: 'm1', track: 'V1', name: 'clip_1.mp4', start: 0, dur: 6.3, sourceIn: 0, sourceOut: 6.3, speed: 1 },
            { id: 'c2', mediaId: 'm2', track: 'V1', name: 'clip_2.mp4', start: 6.3, dur: 8.0, sourceIn: 0, sourceOut: 8.0, speed: 1 },
          ],
        },
      };

      const rebased = rebaseVariation(variation, baseSnap, mainSnap);

      expect(rebased.baseSnapshotId).toBe('snap-2');
      expect(rebased.timeline.clips.length).toBe(2); // NO duplicates!
      expect(rebased.timeline.clips[0].dur).toBe(6.3);
      expect(rebased.timeline.clips[0].start).toBe(0);
      expect(rebased.timeline.clips[1].start).toBe(6.3);
      expect(rebased.timeline.clips[1].dur).toBe(8.0);
    });

    it('matches clips by mediaId + track even if clip IDs differed', () => {
      const baseSnap: Snapshot = {
        id: 'snap-1',
        parentId: null,
        author: 'Alex',
        message: 'Base cut',
        createdAt: new Date().toISOString(),
        timeline: {
          clips: [
            { id: 'main-c1', mediaId: 'm1', track: 'V1', name: 'waves.mp4', start: 0, dur: 10.0, sourceIn: 0, sourceOut: 10.0, speed: 1 },
          ],
        },
      };

      const variation: Variation = {
        id: 'var-1',
        name: 'Var',
        author: 'Jordan',
        baseSnapshotId: 'snap-1',
        status: 'editing',
        timeline: {
          clips: [
            { id: 'var-c1', mediaId: 'm1', track: 'V1', name: 'waves.mp4', start: 0, dur: 10.0, sourceIn: 0, sourceOut: 10.0, speed: 1 },
          ],
        },
      };

      const mainSnap: Snapshot = {
        id: 'snap-2',
        parentId: 'snap-1',
        author: 'Alex',
        message: 'Trimmed waves',
        createdAt: new Date().toISOString(),
        timeline: {
          clips: [
            { id: 'main-c1', mediaId: 'm1', track: 'V1', name: 'waves.mp4', start: 0, dur: 6.3, sourceIn: 0, sourceOut: 6.3, speed: 1 },
          ],
        },
      };

      const rebased = rebaseVariation(variation, baseSnap, mainSnap);
      expect(rebased.timeline.clips.length).toBe(1); // Exactly 1, no duplicate
      expect(rebased.timeline.clips[0].dur).toBe(6.3);
    });

    it('removes clips deleted on Main and adds new clips added on Main', () => {
      const baseSnap: Snapshot = {
        id: 'snap-1',
        parentId: null,
        author: 'Alex',
        message: 'Base cut',
        createdAt: new Date().toISOString(),
        timeline: {
          clips: [
            { id: 'c1', mediaId: 'm1', track: 'V1', name: 'clip1', start: 0, dur: 5.0, sourceIn: 0, sourceOut: 5.0, speed: 1 },
            { id: 'c2', mediaId: 'm2', track: 'V1', name: 'clip2', start: 5.0, dur: 5.0, sourceIn: 0, sourceOut: 5.0, speed: 1 },
          ],
        },
      };

      const variation: Variation = {
        id: 'var-1',
        name: 'Var',
        author: 'Jordan',
        baseSnapshotId: 'snap-1',
        status: 'editing',
        timeline: JSON.parse(JSON.stringify(baseSnap.timeline)),
      };

      // Main deleted c2 and added c3
      const mainSnap: Snapshot = {
        id: 'snap-2',
        parentId: 'snap-1',
        author: 'Alex',
        message: 'Replaced clip2 with clip3',
        createdAt: new Date().toISOString(),
        timeline: {
          clips: [
            { id: 'c1', mediaId: 'm1', track: 'V1', name: 'clip1', start: 0, dur: 5.0, sourceIn: 0, sourceOut: 5.0, speed: 1 },
            { id: 'c3', mediaId: 'm3', track: 'V1', name: 'clip3', start: 5.0, dur: 4.0, sourceIn: 0, sourceOut: 4.0, speed: 1 },
          ],
        },
      };

      const rebased = rebaseVariation(variation, baseSnap, mainSnap);
      expect(rebased.timeline.clips.length).toBe(2);
      expect(rebased.timeline.clips.find((c) => c.id === 'c2')).toBeUndefined();
      expect(rebased.timeline.clips.find((c) => c.id === 'c3')).toBeDefined();
    });
  });
});
