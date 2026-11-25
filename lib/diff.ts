import { Clip, Timeline, TrackType } from './types';

export type DiffFlag = 'moved' | 'trimmed' | 'retimed';
export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface ClipDiffItem {
  clipId: string;
  name: string;
  status: DiffStatus;
  flags: DiffFlag[];
  before: Clip | null;
  after: Clip | null;
}

export interface DiffResult {
  items: ClipDiffItem[];
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
}

export const TIME_TOLERANCE = 0.04; // 0.04s tolerance

function isClose(a: number, b: number, tolerance = TIME_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Computes a structural diff between two timelines.
 * Clips are matched by permanent id.
 * 
 * Flags:
 * - 'moved': start time or track changed
 * - 'trimmed': dur, sourceIn or sourceOut changed, with speed remaining the same
 * - 'retimed': speed changed
 * - A clip can have several flags (e.g. ['moved', 'trimmed'], ['moved', 'retimed']).
 * 
 * In base only: 'removed'
 * In head only: 'added'
 */
export function diffTimelines(base: Timeline, head: Timeline): DiffResult {
  const baseMap = new Map<string, Clip>();
  for (const c of base.clips) {
    baseMap.set(c.id, c);
  }

  const headMap = new Map<string, Clip>();
  for (const c of head.clips) {
    headMap.set(c.id, c);
  }

  const items: ClipDiffItem[] = [];

  // Check all clips in head (present or added)
  for (const headClip of head.clips) {
    const baseClip = baseMap.get(headClip.id);

    if (!baseClip) {
      // Only in head: added
      items.push({
        clipId: headClip.id,
        name: headClip.name,
        status: 'added',
        flags: [],
        before: null,
        after: { ...headClip },
      });
    } else {
      // In both: check flags with 0.04s tolerance
      const flags: DiffFlag[] = [];

      const startDiff = !isClose(headClip.start, baseClip.start);
      const trackDiff = headClip.track !== baseClip.track;
      if (startDiff || trackDiff) {
        flags.push('moved');
      }

      const speedDiff = !isClose(headClip.speed, baseClip.speed, 0.001);
      if (speedDiff) {
        flags.push('retimed');
      } else {
        // Trimmed applies when speed is the same and dur, sourceIn, or sourceOut changed
        const durDiff = !isClose(headClip.dur, baseClip.dur);
        const inDiff = !isClose(headClip.sourceIn, baseClip.sourceIn);
        const outDiff = !isClose(headClip.sourceOut, baseClip.sourceOut);

        if (durDiff || inDiff || outDiff) {
          flags.push('trimmed');
        }
      }

      if (flags.length > 0) {
        items.push({
          clipId: headClip.id,
          name: headClip.name,
          status: 'modified',
          flags,
          before: { ...baseClip },
          after: { ...headClip },
        });
      } else {
        items.push({
          clipId: headClip.id,
          name: headClip.name,
          status: 'unchanged',
          flags: [],
          before: { ...baseClip },
          after: { ...headClip },
        });
      }
    }
  }

  // Check clips only in base: removed
  for (const baseClip of base.clips) {
    if (!headMap.has(baseClip.id)) {
      items.push({
        clipId: baseClip.id,
        name: baseClip.name,
        status: 'removed',
        flags: [],
        before: { ...baseClip },
        after: null,
      });
    }
  }

  let addedCount = 0;
  let removedCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;

  for (const item of items) {
    if (item.status === 'added') addedCount++;
    else if (item.status === 'removed') removedCount++;
    else if (item.status === 'modified') modifiedCount++;
    else if (item.status === 'unchanged') unchangedCount++;
  }

  return {
    items,
    addedCount,
    removedCount,
    modifiedCount,
    unchangedCount,
  };
}

/**
 * Summarizes the diff in up to 6 plain-English lines, biggest changes first.
 */
export function summarize(diff: DiffResult): string[] {
  const changedItems = diff.items.filter((item) => item.status !== 'unchanged');

  if (changedItems.length === 0) {
    return ['No changes detected.'];
  }

  // Compute a change magnitude score to sort biggest changes first
  function getChangeWeight(item: ClipDiffItem): number {
    if (item.status === 'removed' && item.before) {
      return 100 + item.before.dur;
    }
    if (item.status === 'added' && item.after) {
      return 100 + item.after.dur;
    }
    if (item.status === 'modified' && item.before && item.after) {
      let weight = 0;
      if (item.flags.includes('retimed')) {
        weight += 80 + Math.abs(item.after.speed - item.before.speed) * 20;
      }
      if (item.before.track !== item.after.track) {
        weight += 70;
      }
      if (item.flags.includes('trimmed')) {
        weight += 40 + Math.abs(item.after.dur - item.before.dur);
      }
      if (item.flags.includes('moved')) {
        weight += 30 + Math.abs(item.after.start - item.before.start);
      }
      return weight;
    }
    return 1;
  }

  const sorted = [...changedItems].sort((a, b) => getChangeWeight(b) - getChangeWeight(a));
  const topChanges = sorted.slice(0, 6);

  return topChanges.map((item) => {
    const { name, status, flags, before, after } = item;

    if (status === 'added' && after) {
      return `Added "${name}" on ${after.track} (${after.dur.toFixed(1)}s at ${after.start.toFixed(1)}s)`;
    }

    if (status === 'removed' && before) {
      return `Removed "${name}" from ${before.track} (${before.dur.toFixed(1)}s at ${before.start.toFixed(1)}s)`;
    }

    if (status === 'modified' && before && after) {
      const descriptions: string[] = [];

      if (flags.includes('moved')) {
        if (before.track !== after.track) {
          descriptions.push(`moved from ${before.track} to ${after.track} at ${after.start.toFixed(1)}s`);
        } else {
          descriptions.push(`moved start from ${before.start.toFixed(1)}s to ${after.start.toFixed(1)}s`);
        }
      }

      if (flags.includes('trimmed')) {
        if (!isClose(before.dur, after.dur)) {
          descriptions.push(`trimmed duration from ${before.dur.toFixed(1)}s to ${after.dur.toFixed(1)}s`);
        } else {
          descriptions.push(`adjusted in/out range [${after.sourceIn.toFixed(1)}s-${after.sourceOut.toFixed(1)}s]`);
        }
      }

      if (flags.includes('retimed')) {
        descriptions.push(`speed changed from ${before.speed}x to ${after.speed}x`);
      }

      return `"${name}" on ${after.track}: ${descriptions.join(', ')}`;
    }

    return `Modified "${name}"`;
  });
}

/**
 * Renders a git-style text diff with - and + lines and @@ track headers.
 */
export function renderGitText(diff: DiffResult): string {
  const tracksOrder: TrackType[] = ['V2', 'V1', 'A1', 'CC'];
  const sections: string[] = [];

  // Find all tracks involved in changes
  const activeTracks = new Set<TrackType>();
  for (const item of diff.items) {
    if (item.status === 'unchanged') continue;
    if (item.before) activeTracks.add(item.before.track);
    if (item.after) activeTracks.add(item.after.track);
  }

  // Format helper for a clip line
  function formatClipLine(c: Clip): string {
    return `${c.id} "${c.name}" [${c.start.toFixed(2)}s - ${(c.start + c.dur).toFixed(2)}s] dur ${c.dur.toFixed(2)}s, src [${c.sourceIn.toFixed(2)}s - ${c.sourceOut.toFixed(2)}s], ${c.speed}x`;
  }

  for (const track of tracksOrder) {
    if (!activeTracks.has(track)) continue;

    const trackLines: string[] = [`@@ ${track} @@`];

    for (const item of diff.items) {
      if (item.status === 'unchanged') continue;

      if (item.status === 'removed' && item.before?.track === track) {
        trackLines.push(`- ${formatClipLine(item.before)}`);
      } else if (item.status === 'added' && item.after?.track === track) {
        trackLines.push(`+ ${formatClipLine(item.after)}`);
      } else if (item.status === 'modified') {
        const { before, after } = item;
        if (!before || !after) continue;

        // If track changed, show '-' in original track and '+' in new track
        if (before.track === track && after.track !== track) {
          trackLines.push(`- ${formatClipLine(before)}`);
        } else if (before.track !== track && after.track === track) {
          trackLines.push(`+ ${formatClipLine(after)}`);
        } else if (before.track === track && after.track === track) {
          trackLines.push(`- ${formatClipLine(before)}`);
          trackLines.push(`+ ${formatClipLine(after)}`);
        }
      }
    }

    if (trackLines.length > 1) {
      sections.push(trackLines.join('\n'));
    }
  }

  return sections.join('\n\n');
}
