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
    <div className="bg-[#121214] border border-[#222226] rounded-2xl p-4 text-xs space-y-3">
      {/* Diff Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#222226] text-[11px]">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-[#ffffff]">Timeline Diff</span>
          <div className="flex items-center space-x-1.5 font-mono text-[10px]">
            <span className="text-[#4aa56b] bg-[#4aa56b]/12 px-2 py-0.5 rounded-full">
              +{addedCount} added
            </span>
            <span className="text-[#c9973a] bg-[#c9973a]/12 px-2 py-0.5 rounded-full">
              ~{modifiedCount} modified
            </span>
            <span className="text-[#c9605f] bg-[#c9605f]/12 px-2 py-0.5 rounded-full">
              -{removedCount} removed
            </span>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-[#000000] rounded-full p-0.5 border border-[#222226] text-[10px]">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1 rounded-full transition flex items-center gap-1 ${
              viewMode === 'cards' ? 'bg-[#5b8def] text-[#000000] font-semibold' : 'text-[#8e8e93] hover:text-[#ffffff]'
            }`}
          >
            <LayoutList className="w-3 h-3" />
            <span>Summary Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('ghost')}
            className={`px-3 py-1 rounded-full transition flex items-center gap-1 ${
              viewMode === 'ghost' ? 'bg-[#5b8def] text-[#000000] font-semibold' : 'text-[#8e8e93] hover:text-[#ffffff]'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Ghost Timeline</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('git')}
            className={`px-3 py-1 rounded-full transition font-mono flex items-center gap-1 ${
              viewMode === 'git' ? 'bg-[#5b8def] text-[#000000] font-semibold' : 'text-[#8e8e93] hover:text-[#ffffff]'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>Git Text Diff</span>
          </button>
        </div>
      </div>

      {/* Summary Bullet Points */}
      {summaryLines.length > 0 && summaryLines[0] !== 'No changes detected.' && (
        <div className="p-3 bg-[#121214] rounded-xl border border-[#222226] space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93] block mb-1">
            Change Summary (Biggest First):
          </span>
          {summaryLines.map((line, i) => (
            <div key={i} className="text-[11px] text-[#ffffff] flex items-start gap-1.5">
              <span className="text-[#8e8e93] font-bold">&bull;</span>
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
                    className="p-2.5 rounded-xl bg-[#121214] border border-[#222226] flex items-center justify-between"
                  >
                    <div>
                      <span className="font-mono text-[10px] font-medium mr-1.5 bg-[#4aa56b]/12 text-[#4aa56b] px-1.5 py-0.5 rounded">[+ ADD]</span>
                      <span className="font-medium text-[#ffffff]">{d.after.name}</span>
                      <span className="text-[10px] ml-2 text-[#8e8e93] font-mono">
                        ({d.after.track} &bull; {d.after.start.toFixed(1)}s &ndash; {(d.after.start + d.after.dur).toFixed(1)}s)
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[#8e8e93]">{d.after.dur.toFixed(1)}s</span>
                  </div>
                );
              }

              if (d.status === 'removed' && d.before) {
                return (
                  <div
                    key={`diff-${idx}`}
                    className="p-2.5 rounded-xl bg-[#121214] border border-[#222226] flex items-center justify-between"
                  >
                    <div>
                      <span className="font-mono text-[10px] font-medium mr-1.5 bg-[#c9605f]/12 text-[#c9605f] px-1.5 py-0.5 rounded">[- DEL]</span>
                      <span className="font-medium line-through text-[#8e8e93]">{d.before.name}</span>
                      <span className="text-[10px] ml-2 text-[#8e8e93] font-mono">
                        ({d.before.track} &bull; {d.before.start.toFixed(1)}s)
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[#8e8e93]">{d.before.dur.toFixed(1)}s</span>
                  </div>
                );
              }

              if (d.status === 'modified' && d.before && d.after) {
                return (
                  <div
                    key={`diff-${idx}`}
                    className="p-2.5 rounded-xl bg-[#121214] border border-[#222226] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-medium bg-[#c9973a]/12 text-[#c9973a] px-1.5 py-0.5 rounded">[~ MOD]</span>
                        <span className="font-medium text-[#ffffff]">{d.after.name}</span>
                        <span className="text-[10px] text-[#8e8e93] font-mono">
                          ({d.after.track})
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] font-mono uppercase">
                        {d.flags.map((flag) => (
                          <span
                            key={flag}
                            className={`px-2 py-0.5 rounded-full ${
                              flag === 'retimed'
                                ? 'bg-[#8b7fc7]/12 text-[#8b7fc7]'
                                : 'bg-[#c9973a]/12 text-[#c9973a]'
                            }`}
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-[10px] text-[#8e8e93] font-mono pl-4 space-y-0.5">
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
            <div className="text-center py-4 text-[#8e8e93] text-[11px] italic">
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
        <div className="bg-[#000000] border border-[#222226] rounded-xl p-3 font-mono text-[11px] overflow-x-auto max-h-56">
          {gitText ? (
            <pre className="text-[#ffffff] whitespace-pre leading-relaxed">
              {gitText.split('\n').map((line, i) => {
                const isHeader = line.startsWith('@@');
                const isMinus = line.startsWith('-');
                const isPlus = line.startsWith('+');

                return (
                  <div
                    key={i}
                    className={
                      isHeader
                        ? 'text-[#5b8def] font-bold py-0.5'
                        : isMinus
                        ? 'text-[#c9605f] bg-[#c9605f]/12 -mx-1 px-1'
                        : isPlus
                        ? 'text-[#4aa56b] bg-[#4aa56b]/12 -mx-1 px-1'
                        : 'text-[#8e8e93]'
                    }
                  >
                    {line}
                  </div>
                );
              })}
            </pre>
          ) : (
            <div className="text-[#8e8e93] text-center py-2 italic">
              Empty diff (no changes)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
