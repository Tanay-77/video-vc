import { describe, it, expect } from 'vitest';
import { Project, Timeline, Clip } from '../lib/types';
import { createSampleProject } from '../lib/sample';
import { computeTimelineDiff } from '../components/DiffViewer';

describe('lib/types.ts & project structure', () => {
  it('generates a valid sample project matching all types and requirements', () => {
    const sample = createSampleProject();

    expect(sample.id).toBeDefined();
    expect(sample.name).toBe('Summer Reel 2026');
    expect(sample.media.length).toBeGreaterThan(0);
    expect(sample.snapshots.length).toBeGreaterThan(0);
    expect(sample.variations.length).toBeGreaterThan(0);
    expect(sample.reviews.length).toBeGreaterThan(0);

    // Check media item durations in seconds
    for (const m of sample.media) {
      expect(typeof m.duration).toBe('number');
      expect(m.duration).toBeGreaterThan(0);
      expect(typeof m.size).toBe('number');
    }

    // Check base snapshot timeline tracks
    const baseSnap = sample.snapshots[0];
    expect(baseSnap.timeline.clips.length).toBeGreaterThan(0);
    for (const clip of baseSnap.timeline.clips) {
      expect(['V2', 'V1', 'A1', 'CC']).toContain(clip.track);
      expect(typeof clip.start).toBe('number');
      expect(typeof clip.dur).toBe('number');
      expect(typeof clip.sourceIn).toBe('number');
      expect(typeof clip.sourceOut).toBe('number');
      expect(typeof clip.speed).toBe('number');
    }

    // Check review request
    const review = sample.reviews[0];
    expect(['open', 'combined', 'changes-requested']).toContain(review.status);
    expect(review.variationId).toBe(sample.variations[0].id);
  });

  it('correctly computes timeline diffs between base and variation', () => {
    const baseTimeline: Timeline = {
      clips: [
        {
          id: 'c1',
          track: 'V1',
          name: 'Base clip',
          mediaId: null,
          start: 0,
          dur: 5,
          sourceIn: 0,
          sourceOut: 5,
          speed: 1.0,
        },
      ],
    };

    const targetTimeline: Timeline = {
      clips: [
        // c1 modified
        {
          id: 'c1',
          track: 'V2', // track change
          name: 'Base clip',
          mediaId: null,
          start: 1, // start change
          dur: 4, // dur change
          sourceIn: 0,
          sourceOut: 4,
          speed: 1.0,
        },
        // c2 added
        {
          id: 'c2',
          track: 'A1',
          name: 'Added audio',
          mediaId: null,
          start: 0,
          dur: 8,
          sourceIn: 0,
          sourceOut: 8,
          speed: 1.0,
        },
      ],
    };

    const diffs = computeTimelineDiff(baseTimeline, targetTimeline);

    const added = diffs.find((d) => d.type === 'added');
    expect(added).toBeDefined();
    expect(added?.clip.id).toBe('c2');

    const modified = diffs.find((d) => d.type === 'modified');
    expect(modified).toBeDefined();
    expect(modified?.clip.id).toBe('c1');
    expect(modified?.changes?.some((ch) => ch.includes('Track: V1 → V2'))).toBe(true);
  });
});

