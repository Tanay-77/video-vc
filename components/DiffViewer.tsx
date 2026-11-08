'use client';

import React from 'react';
import { Timeline, Clip } from '../lib/types';

interface DiffViewerProps {
  baseTimeline: Timeline;
  variationTimeline: Timeline;
}

interface ClipDiff {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  clip: Clip;
  baseClip?: Clip;
  changes?: string[];
}

export function computeTimelineDiff(base: Timeline, target: Timeline): ClipDiff[] {
  const baseMap = new Map<string, Clip>(base.clips.map((c) => [c.id, c]));
  const targetMap = new Map<string, Clip>(target.clips.map((c) => [c.id, c]));

  const diffs: ClipDiff[] = [];

  // Check clips in target
  for (const clip of target.clips) {
    const baseClip = baseMap.get(clip.id);
    if (!baseClip) {
      diffs.push({ type: 'added', clip });
    } else {
      const changes: string[] = [];
      if (clip.track !== baseClip.track) changes.push(`Track: ${baseClip.track} → ${clip.track}`);
      if (Math.abs(clip.start - baseClip.start) > 0.01) {
        changes.push(`Start: ${baseClip.start.toFixed(1)}s → ${clip.start.toFixed(1)}s`);
      }
      if (Math.abs(clip.dur - baseClip.dur) > 0.01) {
        changes.push(`Duration: ${baseClip.dur.toFixed(1)}s → ${clip.dur.toFixed(1)}s`);
      }
      if (clip.name !== baseClip.name) changes.push(`Name: "${baseClip.name}" → "${clip.name}"`);
      if (Math.abs(clip.speed - baseClip.speed) > 0.01) {
        changes.push(`Speed: ${baseClip.speed}x → ${clip.speed}x`);
      }
      if (
        Math.abs(clip.sourceIn - baseClip.sourceIn) > 0.01 ||
        Math.abs(clip.sourceOut - baseClip.sourceOut) > 0.01
      ) {
        changes.push(`Source: [${baseClip.sourceIn.toFixed(1)}s-${baseClip.sourceOut.toFixed(1)}s] → [${clip.sourceIn.toFixed(1)}s-${clip.sourceOut.toFixed(1)}s]`);
      }

      if (changes.length > 0) {
        diffs.push({ type: 'modified', clip, baseClip, changes });
      } else {
        diffs.push({ type: 'unchanged', clip, baseClip });
      }
    }
  }

  // Check removed clips
  for (const clip of base.clips) {
    if (!targetMap.has(clip.id)) {
      diffs.push({ type: 'removed', clip });
    }
  }

  return diffs;
}

export function DiffViewer({ baseTimeline, variationTimeline }: DiffViewerProps) {
  const diffs = computeTimelineDiff(baseTimeline, variationTimeline);
  const added = diffs.filter((d) => d.type === 'added').length;
  const removed = diffs.filter((d) => d.type === 'removed').length;
  const modified = diffs.filter((d) => d.type === 'modified').length;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-2">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px]">
        <span className="font-semibold text-slate-300">Timeline Diff</span>
        <div className="flex items-center space-x-2 font-mono">
          <span className="text-emerald-400">+{added} added</span>
          <span className="text-amber-400">~{modified} modified</span>
          <span className="text-red-400">-{removed} removed</span>
        </div>
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {diffs.map((d, idx) => {
          if (d.type === 'added') {
            return (
              <div
                key={`diff-${idx}`}
                className="p-2 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-center justify-between"
              >
                <div>
                  <span className="font-bold mr-1.5">[+ ADD]</span>
                  <span className="font-semibold">{d.clip.name}</span>
                  <span className="text-[10px] ml-2 text-emerald-400 font-mono">
                    ({d.clip.track} &bull; {d.clip.start.toFixed(1)}s &ndash; {(d.clip.start + d.clip.dur).toFixed(1)}s)
                  </span>
                </div>
                <span className="font-mono text-[10px]">{d.clip.dur.toFixed(1)}s</span>
              </div>
            );
          }

          if (d.type === 'removed') {
            return (
              <div
                key={`diff-${idx}`}
                className="p-2 rounded bg-red-950/40 border border-red-800/60 text-red-300 flex items-center justify-between"
              >
                <div>
                  <span className="font-bold mr-1.5">[- DEL]</span>
                  <span className="font-semibold line-through">{d.clip.name}</span>
                  <span className="text-[10px] ml-2 text-red-400 font-mono">
                    ({d.clip.track} &bull; {d.clip.start.toFixed(1)}s)
                  </span>
                </div>
                <span className="font-mono text-[10px]">{d.clip.dur.toFixed(1)}s</span>
              </div>
            );
          }

          if (d.type === 'modified') {
            return (
              <div
                key={`diff-${idx}`}
                className="p-2 rounded bg-amber-950/40 border border-amber-800/60 text-amber-300"
              >
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="font-bold mr-1.5">[~ MOD]</span>
                    <span className="font-semibold">{d.clip.name}</span>
                    <span className="text-[10px] ml-2 text-amber-400 font-mono">({d.clip.track})</span>
                  </div>
                </div>
                <div className="pl-4 text-[10px] text-amber-200/90 space-y-0.5 font-mono">
                  {d.changes?.map((ch, i) => (
                    <div key={i}>&bull; {ch}</div>
                  ))}
                </div>
              </div>
            );
          }

          return null; // Don't clutter with unchanged
        })}

        {added === 0 && removed === 0 && modified === 0 && (
          <div className="text-center py-2 text-slate-500 text-[11px]">
            No differences between base snapshot and variation.
          </div>
        )}
      </div>
    </div>
  );
}

