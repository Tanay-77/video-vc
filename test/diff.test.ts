import { describe, it, expect } from 'vitest';
import { diffTimelines, summarize, renderGitText, TIME_TOLERANCE } from '../lib/diff';
import { Clip, Timeline } from '../lib/types';

describe('lib/diff.ts - Structural Timeline Diff Engine', () => {
  const clip1: Clip = {
    id: 'c1',
    mediaId: 'm1',
    track: 'V1',
    name: 'Intro Scene',
    start: 0,
    dur: 5.0,
    sourceIn: 0,
    sourceOut: 5.0,
    speed: 1.0,
  };

  const clip2: Clip = {
    id: 'c2',
    mediaId: 'm2',
    track: 'V1',
    name: 'Main Action',
    start: 5.0,
    dur: 6.0,
    sourceIn: 1.0,
    sourceOut: 7.0,
    speed: 1.0,
  };

  const clipAudio: Clip = {
    id: 'c3',
    mediaId: 'm3',
    track: 'A1',
    name: 'Background Music',
    start: 0,
    dur: 11.0,
    sourceIn: 0,
    sourceOut: 11.0,
    speed: 1.0,
  };

  const baseTimeline: Timeline = {
    clips: [clip1, clip2, clipAudio],
  };

  // 1. No change
  it('detects no change between identical timelines', () => {
    const headTimeline: Timeline = {
      clips: [{ ...clip1 }, { ...clip2 }, { ...clipAudio }],
    };

    const diff = diffTimelines(baseTimeline, headTimeline);

    expect(diff.items.length).toBe(3);
    expect(diff.addedCount).toBe(0);
    expect(diff.removedCount).toBe(0);
    expect(diff.modifiedCount).toBe(0);
    expect(diff.unchangedCount).toBe(3);

    for (const item of diff.items) {
      expect(item.status).toBe('unchanged');
      expect(item.flags).toEqual([]);
      expect(item.before).not.toBeNull();
      expect(item.after).not.toBeNull();
    }

    const summary = summarize(diff);
    expect(summary).toEqual(['No changes detected.']);
    expect(renderGitText(diff)).toBe('');
  });

  // 2. One trim
  it('detects one trim (duration/source range changed with speed same)', () => {
    const trimmedClip2: Clip = {
      ...clip2,
      dur: 4.0, // shortened from 6.0 to 4.0
      sourceOut: 5.0,
    };

    const headTimeline: Timeline = {
      clips: [{ ...clip1 }, trimmedClip2, { ...clipAudio }],
    };

    const diff = diffTimelines(baseTimeline, headTimeline);

    expect(diff.modifiedCount).toBe(1);
    expect(diff.unchangedCount).toBe(2);

    const modified = diff.items.find((i) => i.clipId === 'c2')!;
    expect(modified.status).toBe('modified');
    expect(modified.flags).toEqual(['trimmed']);
    expect(modified.before?.dur).toBe(6.0);
    expect(modified.after?.dur).toBe(4.0);

    const summary = summarize(diff);
    expect(summary[0]).toContain('trimmed duration from 6.0s to 4.0s');

    const gitText = renderGitText(diff);
    expect(gitText).toContain('@@ V1 @@');
    expect(gitText).toContain('- c2 "Main Action" [5.00s - 11.00s] dur 6.00s');
    expect(gitText).toContain('+ c2 "Main Action" [5.00s - 9.00s] dur 4.00s');
  });

  // 3. One move (start time or track)
  it('detects one move (start time shifted)', () => {
    const movedClip2: Clip = {
      ...clip2,
      start: 7.0, // moved from 5.0 to 7.0
    };

    const headTimeline: Timeline = {
      clips: [{ ...clip1 }, movedClip2, { ...clipAudio }],
    };

    const diff = diffTimelines(baseTimeline, headTimeline);

    expect(diff.modifiedCount).toBe(1);
    const item = diff.items.find((i) => i.clipId === 'c2')!;
    expect(item.flags).toEqual(['moved']);
    expect(item.before?.start).toBe(5.0);
    expect(item.after?.start).toBe(7.0);

    const summary = summarize(diff);
    expect(summary[0]).toContain('moved start from 5.0s to 7.0s');
  });

  it('detects track move (e.g. V1 to V2)', () => {
    const trackMovedClip: Clip = {
      ...clip2,
      track: 'V2',
    };

    const headTimeline: Timeline = {
      clips: [{ ...clip1 }, trackMovedClip, { ...clipAudio }],
    };

    const diff = diffTimelines(baseTimeline, headTimeline);
    const item = diff.items.find((i) => i.clipId === 'c2')!;
    expect(item.flags).toEqual(['moved']);
    expect(item.before?.track).toBe('V1');
    expect(item.after?.track).toBe('V2');

    const gitText = renderGitText(diff);
    expect(gitText).toContain('@@ V2 @@');
    expect(gitText).toContain('+ c2 "Main Action"');
    expect(gitText).toContain('@@ V1 @@');
    expect(gitText).toContain('- c2 "Main Action"');
  });

  // 4. One retime
  it('detects one retime (playback speed changed)', () => {
    const retimedClip1: Clip = {
      ...clip1,
      speed: 1.5, // changed speed from 1.0 to 1.5
      sourceOut: 7.5,
    };

    const headTimeline: Timeline = {
      clips: [retimedClip1, { ...clip2 }, { ...clipAudio }],
    };

    const diff = diffTimelines(baseTimeline, headTimeline);

    expect(diff.modifiedCount).toBe(1);
    const item = diff.items.find((i) => i.clipId === 'c1')!;
    expect(item.flags).toEqual(['retimed']);
    expect(item.before?.speed).toBe(1.0);
    expect(item.after?.speed).toBe(1.5);

    const summary = summarize(diff);
    expect(summary[0]).toContain('speed changed from 1x to 1.5x');
  });

  // 5. One add
  it('detects one added clip in head', () => {
    const newClip: Clip = {
      id: 'c4-new',
      mediaId: 'm4',
      track: 'V2',
      name: 'B-Roll Cutaway',
      start: 2.0,
      dur: 3.0,
      sourceIn: 0,
      sourceOut: 3.0,
      speed: 1.0,
    };

    const headTimeline: Timeline = {
      clips: [{ ...clip1 }, { ...clip2 }, { ...clipAudio }, newClip],
    };

    const diff = diffTimelines(baseTimeline, headTimeline);

    expect(diff.addedCount).toBe(1);
    expect(diff.removedCount).toBe(0);
    expect(diff.modifiedCount).toBe(0);

    const added = diff.items.find((i) => i.clipId === 'c4-new')!;
    expect(added.status).toBe('added');
    expect(added.before).toBeNull();
    expect(added.after?.id).toBe('c4-new');

    const summary = summarize(diff);
    expect(summary[0]).toContain('Added "B-Roll Cutaway" on V2');

    const gitText = renderGitText(diff);
    expect(gitText).toContain('@@ V2 @@');
    expect(gitText).toContain('+ c4-new "B-Roll Cutaway"');
  });

  // 6. One remove
  it('detects one removed clip in head', () => {
    // Drop clip2 from head
    const headTimeline: Timeline = {
      clips: [{ ...clip1 }, { ...clipAudio }],
    };

    const diff = diffTimelines(baseTimeline, headTimeline);

    expect(diff.removedCount).toBe(1);
    expect(diff.addedCount).toBe(0);

    const removed = diff.items.find((i) => i.clipId === 'c2')!;
    expect(removed.status).toBe('removed');
    expect(removed.before?.id).toBe('c2');
    expect(removed.after).toBeNull();

    const summary = summarize(diff);
    expect(summary[0]).toContain('Removed "Main Action" from V1');

    const gitText = renderGitText(diff);
    expect(gitText).toContain('@@ V1 @@');
    expect(gitText).toContain('- c2 "Main Action"');
  });

  // 7. Combination
  it('handles combination of moves, trims, retimes, adds, and removes', () => {
    // clip1: moved and trimmed (start 1.0s, dur 3.0s)
    const modifiedClip1: Clip = {
      ...clip1,
      start: 1.0,
      dur: 3.0,
      sourceOut: 3.0,
    };

    // clip2: retimed and moved to V2
    const modifiedClip2: Clip = {
      ...clip2,
      track: 'V2',
      speed: 2.0,
    };

    // clipAudio: removed
    // new clip: added
    const newOverlayClip: Clip = {
      id: 'c_overlay',
      mediaId: null,
      track: 'CC',
      name: 'Color Grade LUT',
      start: 0,
      dur: 10.0,
      sourceIn: 0,
      sourceOut: 10.0,
      speed: 1.0,
    };

    const headTimeline: Timeline = {
      clips: [modifiedClip1, modifiedClip2, newOverlayClip],
    };

    const diff = diffTimelines(baseTimeline, headTimeline);

    expect(diff.addedCount).toBe(1); // newOverlayClip
    expect(diff.removedCount).toBe(1); // clipAudio
    expect(diff.modifiedCount).toBe(2); // clip1 and clip2
    expect(diff.unchangedCount).toBe(0);

    // clip1 has both moved and trimmed flags
    const item1 = diff.items.find((i) => i.clipId === 'c1')!;
    expect(item1.flags).toContain('moved');
    expect(item1.flags).toContain('trimmed');

    // clip2 has both moved (track V1 -> V2) and retimed (speed 1.0 -> 2.0)
    const item2 = diff.items.find((i) => i.clipId === 'c2')!;
    expect(item2.flags).toContain('moved');
    expect(item2.flags).toContain('retimed');

    const summary = summarize(diff);
    expect(summary.length).toBeLessThanOrEqual(6);
    expect(summary.length).toBe(4);

    const gitText = renderGitText(diff);
    expect(gitText).toContain('@@ V1 @@');
    expect(gitText).toContain('@@ V2 @@');
    expect(gitText).toContain('@@ A1 @@');
    expect(gitText).toContain('@@ CC @@');
  });

  // 8. Explanation of Ambiguous Cases
  describe('Ambiguous Cases & Boundary Tolerances', () => {
    it('Ambiguous Case 1 - Tolerance threshold (0.04s): sub-threshold float deviations are unchanged', () => {
      // 0.03s shift is within 0.04s tolerance -> should be unchanged
      const nearClip: Clip = {
        ...clip1,
        start: clip1.start + 0.03,
        dur: clip1.dur - 0.03,
      };

      const diff = diffTimelines(baseTimeline, { clips: [nearClip, clip2, clipAudio] });
      const item = diff.items.find((i) => i.clipId === 'c1')!;
      expect(item.status).toBe('unchanged');
      expect(item.flags).toEqual([]);

      // 0.05s shift exceeds 0.04s tolerance -> triggers flag
      const overThresholdClip: Clip = {
        ...clip1,
        start: clip1.start + 0.05,
      };
      const diffOver = diffTimelines(baseTimeline, { clips: [overThresholdClip, clip2, clipAudio] });
      const itemOver = diffOver.items.find((i) => i.clipId === 'c1')!;
      expect(itemOver.status).toBe('modified');
      expect(itemOver.flags).toEqual(['moved']);
    });

    it('Ambiguous Case 2 - Retimed vs Trimmed: when speed changes, clip is retimed (not trimmed)', () => {
      // When speed changes from 1.0x to 2.0x, sourceOut or dur inevitably changes.
      // Per spec: 'trimmed' is dur/sourceIn/sourceOut changed WITH speed remaining the same.
      // Therefore, speed change is exclusively classified as 'retimed' unless moved.
      const retimedOnly: Clip = {
        ...clip1,
        speed: 2.0,
        sourceOut: 10.0,
      };

      const diff = diffTimelines(baseTimeline, { clips: [retimedOnly, clip2, clipAudio] });
      const item = diff.items.find((i) => i.clipId === 'c1')!;
      expect(item.flags).toEqual(['retimed']);
      expect(item.flags).not.toContain('trimmed');
    });

    it('Ambiguous Case 3 - Multiple flags combination: moved + retimed simultaneously', () => {
      const movedAndRetimed: Clip = {
        ...clip1,
        start: 2.0, // moved
        speed: 1.5, // retimed
      };

      const diff = diffTimelines(baseTimeline, { clips: [movedAndRetimed, clip2, clipAudio] });
      const item = diff.items.find((i) => i.clipId === 'c1')!;
      expect(item.flags).toContain('moved');
      expect(item.flags).toContain('retimed');
    });

    it('Ambiguous Case 4 - Cross-track move in Git diff: appears as "-" in source track and "+" in destination track', () => {
      const movedTrackClip: Clip = {
        ...clip1,
        track: 'V2', // was V1
      };

      const diff = diffTimelines(baseTimeline, { clips: [movedTrackClip, clip2, clipAudio] });
      const gitText = renderGitText(diff);

      // Must have section for V1 showing removal
      expect(gitText).toMatch(/@@ V1 @@[\s\S]*- c1 "Intro Scene"/);
      // Must have section for V2 showing addition
      expect(gitText).toMatch(/@@ V2 @@[\s\S]*\+ c1 "Intro Scene"/);
    });
  });
});
