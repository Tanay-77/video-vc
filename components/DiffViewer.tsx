'use client';

import React, { useState } from 'react';
import { Layers, FileText, LayoutList } from 'lucide-react';
import { Timeline } from '../lib/types';
import { diffTimelines, summarize, renderGitText } from '../lib/diff';
import { GhostTimelineView } from './GhostTimelineView';

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
  const [viewMode, setViewMode] = useState<'cards' | 'ghost' | 'git'>('cards');
  const diffResult = diffTimelines(baseTimeline, variationTimeline);
  const summaryLines = summarize(diffResult);
  const gitText = renderGitText(diffResult);

  const { addedCount, removedCount, modifiedCount } = diffResult;

  return (
    <div className="bg-[#131317] border border-[#22222a] rounded-2xl p-4 text-xs space-y-3">
      {/* Diff Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#22222a] text-[11px]">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-zinc-200">Timeline Diff</span>
          <div className="flex items-center space-x-1.5 font-mono text-[10px]">
            <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/60">
              +{addedCount} added
            </span>
            <span className="text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-800/60">
              ~{modifiedCount} modified
            </span>
            <span className="text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-800/60">
              -{removedCount} removed
            </span>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-[#0d0d10] rounded-full p-0.5 border border-[#22222a] text-[10px]">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1 rounded-full transition flex items-center gap-1 ${
              viewMode === 'cards' ? 'bg-[#0071e3] text-white font-medium shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <LayoutList className="w-3 h-3" />
            <span>Summary Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('ghost')}
            className={`px-3 py-1 rounded-full transition flex items-center gap-1 ${
              viewMode === 'ghost' ? 'bg-[#0071e3] text-white font-medium shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Ghost Timeline</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('git')}
            className={`px-3 py-1 rounded-full transition font-mono flex items-center gap-1 ${
              viewMode === 'git' ? 'bg-[#0071e3] text-white font-medium shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>Git Text Diff</span>
          </button>
        </div>
      </div>

      {/* Summary Bullet Points */}
      {summaryLines.length > 0 && summaryLines[0] !== 'No changes detected.' && (
        <div className="p-3 bg-[#18181f] rounded-xl border border-[#262632] space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
            Change Summary (Biggest First):
          </span>
          {summaryLines.map((line, i) => (
            <div key={i} className="text-[11px] text-zinc-300 flex items-start gap-1.5">
              <span className="text-[#0071e3] font-bold">&bull;</span>
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
                    className="p-2.5 rounded-xl bg-emerald-950/25 border border-emerald-800/40 text-emerald-300 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold mr-1.5 text-xs">[+ ADD]</span>
                      <span className="font-semibold text-white">{d.after.name}</span>
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
                    className="p-2.5 rounded-xl bg-rose-950/25 border border-rose-800/40 text-rose-300 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold mr-1.5 text-xs">[- DEL]</span>
                      <span className="font-semibold line-through text-zinc-300">{d.before.name}</span>
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
                    className="p-2.5 rounded-xl bg-amber-950/25 border border-amber-800/40 text-amber-300 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs">[~ MOD]</span>
                        <span className="font-semibold text-white">{d.after.name}</span>
                        <span className="text-[10px] text-amber-400 font-mono">
                          ({d.after.track})
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] font-mono uppercase">
                        {d.flags.map((flag) => (
                          <span
                            key={flag}
                            className="px-2 py-0.5 rounded-full bg-amber-900/60 border border-amber-700/60 font-bold"
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
            <div className="text-center py-4 text-zinc-500 text-[11px] italic">
              No differences between base snapshot and variation.
            </div>
          )}
        </div>
      )}

      {/* Mode 2: Ghost Timeline */}
      {viewMode === 'ghost' && (
        <div className="space-y-2">
          <GhostTimelineView
            baseTimeline={baseTimeline}
            variationTimeline={variationTimeline}
          />
        </div>
      )}

      {/* Mode 3: Git Text Diff */}
      {viewMode === 'git' && (
        <div className="bg-[#0d0d10] border border-[#22222a] rounded-xl p-3 font-mono text-[11px] overflow-x-auto max-h-56">
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
