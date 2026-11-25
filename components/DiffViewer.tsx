'use client';

import React, { useState } from 'react';
import { Timeline } from '../lib/types';
import { diffTimelines, summarize, renderGitText } from '../lib/diff';

interface DiffViewerProps {
  baseTimeline: Timeline;
  variationTimeline: Timeline;
}

export interface LegacyClipDiff {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  clip: any;
  baseClip?: any;
  changes?: string[];
}

/**
 * Backward-compatible helper for legacy test suite
 */
export function computeTimelineDiff(base: Timeline, target: Timeline): LegacyClipDiff[] {
  const result = diffTimelines(base, target);
  return result.items.map((item) => {
    const changes: string[] = [];
    if (item.status === 'modified' && item.before && item.after) {
      if (item.before.track !== item.after.track) {
        changes.push(`Track: ${item.before.track} → ${item.after.track}`);
      }
      if (item.before.start !== item.after.start) {
        changes.push(`Start: ${item.before.start}s → ${item.after.start}s`);
      }
      if (item.before.dur !== item.after.dur) {
        changes.push(`Duration: ${item.before.dur}s → ${item.after.dur}s`);
      }
    }

    return {
      type: item.status,
      clip: item.after || item.before,
      baseClip: item.before || undefined,
      changes: changes.length > 0 ? changes : undefined,
    };
  });
}

export function DiffViewer({ baseTimeline, variationTimeline }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'git'>('cards');
  const diffResult = diffTimelines(baseTimeline, variationTimeline);
  const summaryLines = summarize(diffResult);
  const gitText = renderGitText(diffResult);

  const { addedCount, removedCount, modifiedCount } = diffResult;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-3">
      {/* Diff Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px]">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-slate-300">Timeline Diff</span>
          <div className="flex items-center space-x-1.5 font-mono text-[10px]">
            <span className="text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/60">
              +{addedCount} added
            </span>
            <span className="text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800/60">
              ~{modifiedCount} modified
            </span>
            <span className="text-rose-400 bg-rose-950/60 px-1.5 py-0.2 rounded border border-rose-800/60">
              -{removedCount} removed
            </span>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-slate-900 rounded p-0.5 border border-slate-800 text-[10px]">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-2 py-0.5 rounded transition ${
              viewMode === 'cards' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Summary Cards
          </button>
          <button
            type="button"
            onClick={() => setViewMode('git')}
            className={`px-2 py-0.5 rounded transition font-mono ${
              viewMode === 'git' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Git Text Diff
          </button>
        </div>
      </div>

      {/* Summary Bullet Points */}
      {summaryLines.length > 0 && summaryLines[0] !== 'No changes detected.' && (
        <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Change Summary (Biggest First):
          </span>
          {summaryLines.map((line, i) => (
            <div key={i} className="text-[11px] text-slate-300 flex items-start gap-1.5">
              <span className="text-indigo-400 font-bold">&bull;</span>
              <span>{line}</span>
            </div>
          ))}
        </div>
      )}

      {/* Mode 1: Cards View */}
      {viewMode === 'cards' && (
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {diffResult.items
            .filter((item) => item.status !== 'unchanged')
            .map((d, idx) => {
              if (d.status === 'added' && d.after) {
                return (
                  <div
                    key={`diff-${idx}`}
                    className="p-2 rounded bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold mr-1.5 text-xs">[+ ADD]</span>
                      <span className="font-semibold">{d.after.name}</span>
                      <span className="text-[10px] ml-2 text-emerald-400 font-mono">
                        ({d.after.track} &bull; {d.after.start.toFixed(1)}s &ndash; {(d.after.start + d.after.dur).toFixed(1)}s)
                      </span>
                    </div>
                    <span className="font-mono text-[10px]">{d.after.dur.toFixed(1)}s</span>
                  </div>
                );
              }

              if (d.status === 'removed' && d.before) {
                return (
                  <div
                    key={`diff-${idx}`}
                    className="p-2 rounded bg-rose-950/30 border border-rose-800/50 text-rose-300 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold mr-1.5 text-xs">[- DEL]</span>
                      <span className="font-semibold line-through">{d.before.name}</span>
                      <span className="text-[10px] ml-2 text-rose-400 font-mono">
                        ({d.before.track} &bull; {d.before.start.toFixed(1)}s)
                      </span>
                    </div>
                    <span className="font-mono text-[10px]">{d.before.dur.toFixed(1)}s</span>
                  </div>
                );
              }

              if (d.status === 'modified' && d.before && d.after) {
                return (
                  <div
                    key={`diff-${idx}`}
                    className="p-2 rounded bg-amber-950/30 border border-amber-800/50 text-amber-300 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs">[~ MOD]</span>
                        <span className="font-semibold">{d.after.name}</span>
                        <span className="text-[10px] text-amber-400 font-mono">
                          ({d.after.track})
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] font-mono uppercase">
                        {d.flags.map((flag) => (
                          <span
                            key={flag}
                            className="px-1.5 py-0.2 rounded bg-amber-900/60 border border-amber-700/60 font-bold"
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-[10px] text-amber-200/80 font-mono pl-4 space-y-0.5">
                      {d.flags.includes('moved') && (
                        <div>&bull; Position: {d.before.start.toFixed(1)}s &rarr; {d.after.start.toFixed(1)}s {d.before.track !== d.after.track ? `(Track: ${d.before.track} → ${d.after.track})` : ''}</div>
                      )}
                      {d.flags.includes('trimmed') && (
                        <div>&bull; Duration: {d.before.dur.toFixed(1)}s &rarr; {d.after.dur.toFixed(1)}s (Source in/out: [{d.after.sourceIn.toFixed(1)}s - {d.after.sourceOut.toFixed(1)}s])</div>
                      )}
                      {d.flags.includes('retimed') && (
                        <div>&bull; Speed: {d.before.speed}x &rarr; {d.after.speed}x</div>
                      )}
                    </div>
                  </div>
                );
              }

              return null;
            })}

          {addedCount === 0 && removedCount === 0 && modifiedCount === 0 && (
            <div className="text-center py-4 text-slate-500 text-[11px] italic">
              No differences between base snapshot and variation.
            </div>
          )}
        </div>
      )}

      {/* Mode 2: Git Text Diff */}
      {viewMode === 'git' && (
        <div className="bg-slate-900 border border-slate-800 rounded p-3 font-mono text-[11px] overflow-x-auto max-h-56">
          {gitText ? (
            <pre className="text-slate-200 whitespace-pre leading-relaxed">
              {gitText.split('\n').map((line, i) => {
                const isHeader = line.startsWith('@@');
                const isMinus = line.startsWith('-');
                const isPlus = line.startsWith('+');

                return (
                  <div
                    key={i}
                    className={
                      isHeader
                        ? 'text-cyan-400 font-bold py-0.5'
                        : isMinus
                        ? 'text-rose-400 bg-rose-950/30 -mx-1 px-1'
                        : isPlus
                        ? 'text-emerald-400 bg-emerald-950/30 -mx-1 px-1'
                        : 'text-slate-400'
                    }
                  >
                    {line}
                  </div>
                );
              })}
            </pre>
          ) : (
            <div className="text-slate-500 text-center py-2 italic">
              Empty diff (no changes)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
