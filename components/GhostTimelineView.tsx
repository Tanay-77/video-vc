'use client';

import React, { useState, useMemo, useRef } from 'react';
import { Clip, Timeline, TrackType } from '../lib/types';
import { diffTimelines, DiffResult, ClipDiffItem } from '../lib/diff';

interface GhostTimelineViewProps {
  baseTimeline: Timeline;
  variationTimeline: Timeline;
  time?: number;
  onTime?: (t: number) => void;
}

const TRACKS: { id: TrackType; label: string; desc: string; bg: string; border: string }[] = [
  { id: 'V2', label: 'V2', desc: 'Overlay / B-Roll', bg: 'bg-[#101014]', border: 'border-[#1f1f26]' },
  { id: 'V1', label: 'V1', desc: 'Primary Video', bg: 'bg-[#131317]', border: 'border-[#1f1f26]' },
  { id: 'A1', label: 'A1', desc: 'Audio', bg: 'bg-[#0e0e12]', border: 'border-[#1f1f26]' },
  { id: 'CC', label: 'CC', desc: 'Color / Captions', bg: 'bg-[#101014]', border: 'border-[#1f1f26]' },
];

const TRACK_HEIGHT = 58;

interface GhostBlock {
  key: string;
  type: 'unchanged' | 'added' | 'removed' | 'modified-active' | 'trimmed-tail' | 'trimmed-head' | 'moved-prev';
  track: TrackType;
  start: number;
  dur: number;
  name: string;
  badge?: string;
  details?: string;
}

export function GhostTimelineView({
  baseTimeline,
  variationTimeline,
  time = 0,
  onTime,
}: GhostTimelineViewProps) {
  const [pxPerSec, setPxPerSec] = useState<number>(45);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const diffResult = useMemo(() => {
    return diffTimelines(baseTimeline, variationTimeline);
  }, [baseTimeline, variationTimeline]);

  // Generate ghost blocks for each track
  const ghostBlocks = useMemo(() => {
    const blocks: GhostBlock[] = [];

    diffResult.items.forEach((item, idx) => {
      if (item.status === 'unchanged' && item.after) {
        blocks.push({
          key: `unchanged-${idx}-${item.after.id}`,
          type: 'unchanged',
          track: item.after.track,
          start: item.after.start,
          dur: item.after.dur,
          name: item.after.name,
        });
      } else if (item.status === 'added' && item.after) {
        // Added clips in solid green
        blocks.push({
          key: `added-${idx}-${item.after.id}`,
          type: 'added',
          track: item.after.track,
          start: item.after.start,
          dur: item.after.dur,
          name: item.after.name,
          badge: '+ ADD',
          details: `Added new clip (${item.after.dur.toFixed(1)}s)`,
        });
      } else if (item.status === 'removed' && item.before) {
        // Removed clips as red dashed ghost blocks
        blocks.push({
          key: `removed-${idx}-${item.before.id}`,
          type: 'removed',
          track: item.before.track,
          start: item.before.start,
          dur: item.before.dur,
          name: item.before.name,
          badge: '- DEL',
          details: `Removed clip (${item.before.dur.toFixed(1)}s)`,
        });
      } else if (item.status === 'modified' && item.before && item.after) {
        const isTrimmed = item.flags.includes('trimmed');
        const isMoved = item.flags.includes('moved');
        const isRetimed = item.flags.includes('retimed');

        // Active clip on variation timeline
        blocks.push({
          key: `mod-active-${idx}-${item.after.id}`,
          type: 'modified-active',
          track: item.after.track,
          start: item.after.start,
          dur: item.after.dur,
          name: item.after.name,
          badge: isTrimmed ? '~ TRIMMED' : isMoved ? '~ MOVED' : isRetimed ? '~ RETIMED' : '~ MOD',
          details: `${item.after.dur.toFixed(1)}s`,
        });

        // If trimmed shorter on the tail: render red ghost beyond the new end
        if (isTrimmed && item.before.dur > item.after.dur) {
          const tailStart = item.after.start + item.after.dur;
          const tailDur = item.before.dur - item.after.dur;
          blocks.push({
            key: `trim-tail-${idx}-${item.after.id}`,
            type: 'trimmed-tail',
            track: item.after.track,
            start: tailStart,
            dur: tailDur,
            name: `Trimmed tail (-${tailDur.toFixed(1)}s)`,
            badge: 'GHOST TAIL',
            details: `Previously extended to ${(tailStart + tailDur).toFixed(1)}s`,
          });
        }

        // If trimmed on the head: render red ghost before new start
        if (isTrimmed && item.after.start > item.before.start) {
          const headStart = item.before.start;
          const headDur = item.after.start - item.before.start;
          blocks.push({
            key: `trim-head-${idx}-${item.after.id}`,
            type: 'trimmed-head',
            track: item.after.track,
            start: headStart,
            dur: headDur,
            name: `Trimmed head (-${headDur.toFixed(1)}s)`,
            badge: 'GHOST HEAD',
            details: `Previously started at ${headStart.toFixed(1)}s`,
          });
        }

        // If moved: render a subtle dashed ghost box at original position
        if (isMoved && (item.before.start !== item.after.start || item.before.track !== item.after.track)) {
          blocks.push({
            key: `move-prev-${idx}-${item.before.id}`,
            type: 'moved-prev',
            track: item.before.track,
            start: item.before.start,
            dur: item.before.dur,
            name: `${item.before.name} (Previous pos)`,
            badge: 'ORIGINAL',
            details: `Was at ${item.before.start.toFixed(1)}s`,
          });
        }
      }
    });

    return blocks;
  }, [diffResult]);

  // Compute maximum timeline duration across both base and variation
  const maxTime = useMemo(() => {
    let max = 15;
    baseTimeline.clips.forEach((c) => {
      max = Math.max(max, c.start + c.dur + 2);
    });
    variationTimeline.clips.forEach((c) => {
      max = Math.max(max, c.start + c.dur + 2);
    });
    return Math.ceil(max);
  }, [baseTimeline, variationTimeline]);

  const timelineWidth = Math.max(800, maxTime * pxPerSec);

  // Time ruler ticks
  const rulerTicks = useMemo(() => {
    const ticks: { time: number; label: string; isMajor: boolean }[] = [];
    const interval = pxPerSec >= 60 ? 1 : pxPerSec >= 30 ? 2 : 5;
    for (let t = 0; t <= maxTime; t += interval) {
      ticks.push({
        time: t,
        label: `${t}s`,
        isMajor: t % (interval * 2) === 0,
      });
    }
    return ticks;
  }, [maxTime, pxPerSec]);

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onTime || !scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + scrollContainerRef.current.scrollLeft - 80; // 80px track label width
    if (clickX >= 0) {
      const clickedTime = Math.max(0, Math.min(maxTime, clickX / pxPerSec));
      onTime(parseFloat(clickedTime.toFixed(2)));
    }
  };

  return (
    <div className="bg-[#131317] border border-[#22222a] rounded-2xl overflow-hidden shadow-xl">
      {/* Ghost Timeline Top Toolbar & Legend */}
      <div className="p-3 bg-[#0d0d10] border-b border-[#22222a] flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
            Ghost Visualizer:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-600 border border-emerald-400"></span>
            <span className="text-emerald-300 font-medium">+ Added Clip</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-950/40 border border-dashed border-rose-500"></span>
            <span className="text-rose-300 font-medium">- Removed Clip (Ghost)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-950/60 border border-dashed border-rose-400"></span>
            <span className="text-rose-400 font-medium">Trimmed Tail (Ghost)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-600 border border-amber-300"></span>
            <span className="text-amber-300 font-medium">~ Trimmed Cut</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-zinc-800 border border-zinc-700"></span>
            <span className="text-zinc-400">Unchanged Clip</span>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center space-x-1.5 bg-[#18181f] border border-[#242430] rounded-full p-0.5">
          <button
            type="button"
            onClick={() => setPxPerSec((prev) => Math.max(20, prev - 10))}
            className="px-2 py-0.5 text-xs text-zinc-300 hover:text-white rounded-full hover:bg-[#242430]"
            title="Zoom out"
          >
            &minus;
          </button>
          <span className="font-mono text-[11px] text-zinc-400 px-1">{pxPerSec}px/s</span>
          <button
            type="button"
            onClick={() => setPxPerSec((prev) => Math.min(90, prev + 10))}
            className="px-2 py-0.5 text-xs text-zinc-300 hover:text-white rounded-full hover:bg-[#242430]"
            title="Zoom in"
          >
            &#43;
          </button>
        </div>
      </div>

      {/* Timeline Scroll Container */}
      <div
        ref={scrollContainerRef}
        onClick={handleRulerClick}
        className="overflow-x-auto relative select-none cursor-pointer"
        style={{ minHeight: '280px' }}
      >
        <div style={{ width: `${timelineWidth + 90}px` }} className="relative pb-4">
          {/* Time Ruler */}
          <div className="h-7 bg-[#0d0d10] border-b border-[#22222a] flex relative ml-20 text-[10px] font-mono text-zinc-400">
            {rulerTicks.map((tick) => (
              <div
                key={`tick-${tick.time}`}
                className="absolute top-0 bottom-0 flex flex-col justify-between"
                style={{ left: `${tick.time * pxPerSec}px` }}
              >
                <span className="px-1">{tick.label}</span>
                <span
                  className={`w-px bg-zinc-700 ${
                    tick.isMajor ? 'h-3 bg-zinc-500' : 'h-1.5 bg-zinc-800'
                  }`}
                ></span>
              </div>
            ))}
          </div>

          {/* Pure White Apple Playhead marker */}
          {time !== undefined && (
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none transition-all duration-75"
              style={{ left: `${time * pxPerSec + 80}px` }}
            >
              <div className="w-[1.5px] h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)]"></div>
              <div className="w-3 h-3 bg-white rotate-45 -ml-[5px] -mt-1 shadow-sm border border-white/80"></div>
            </div>
          )}

          {/* Tracks Lanes */}
          <div className="space-y-1 mt-1">
            {TRACKS.map((track) => {
              const trackBlocks = ghostBlocks.filter((b) => b.track === track.id);

              return (
                <div key={track.id} className="flex items-center relative group">
                  {/* Track Header Label */}
                  <div
                    className={`w-20 shrink-0 h-[58px] ${track.bg} border-r border-y ${track.border} flex flex-col justify-center px-2 z-10 sticky left-0 shadow-sm`}
                  >
                    <span className="font-bold text-xs text-white tracking-wide">{track.label}</span>
                    <span className="text-[9px] text-zinc-400 truncate">{track.desc}</span>
                  </div>

                  {/* Track Lane Content */}
                  <div
                    className={`flex-1 h-[58px] ${track.bg} border-y ${track.border} relative overflow-hidden`}
                    style={{ width: `${timelineWidth}px` }}
                  >
                    {/* Background grid lines */}
                    {rulerTicks.map((tick) => (
                      <div
                        key={`grid-${track.id}-${tick.time}`}
                        className="absolute top-0 bottom-0 w-px bg-slate-800/30 pointer-events-none"
                        style={{ left: `${tick.time * pxPerSec}px` }}
                      ></div>
                    ))}

                    {/* Clip Blocks on this track */}
                    {trackBlocks.map((block) => {
                      const leftPos = block.start * pxPerSec;
                      const width = Math.max(16, block.dur * pxPerSec);

                      // Style variants
                      let styleClasses = '';
                      if (block.type === 'unchanged') {
                        styleClasses =
                          'bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:border-slate-500';
                      } else if (block.type === 'added') {
                        styleClasses =
                          'bg-emerald-600/90 border-2 border-emerald-400 text-white font-semibold shadow-lg shadow-emerald-950/50';
                      } else if (block.type === 'removed') {
                        styleClasses =
                          'bg-rose-950/40 border-2 border-dashed border-rose-500 text-rose-300 opacity-80';
                      } else if (block.type === 'modified-active') {
                        styleClasses =
                          'bg-amber-600/90 border-2 border-amber-300 text-white font-semibold shadow-md';
                      } else if (block.type === 'trimmed-tail') {
                        styleClasses =
                          'bg-rose-950/50 border-2 border-dashed border-rose-500/90 text-rose-300 animate-pulse';
                      } else if (block.type === 'trimmed-head') {
                        styleClasses =
                          'bg-rose-950/50 border-2 border-dashed border-rose-500/90 text-rose-300';
                      } else if (block.type === 'moved-prev') {
                        styleClasses =
                          'bg-slate-900/60 border-2 border-dashed border-slate-600 text-slate-400 opacity-70';
                      }

                      return (
                        <div
                          key={block.key}
                          className={`absolute top-1 bottom-1 rounded-md px-2 flex flex-col justify-center text-xs overflow-hidden transition-all duration-150 ${styleClasses}`}
                          style={{
                            left: `${leftPos}px`,
                            width: `${width}px`,
                          }}
                          title={`${block.name} • ${block.details || `${block.dur.toFixed(1)}s`}`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {block.badge && (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded uppercase font-bold bg-black/40 shrink-0">
                                {block.badge}
                              </span>
                            )}
                            <span
                              className={`truncate font-medium text-[11px] ${
                                block.type === 'removed' ? 'line-through text-rose-200' : ''
                              }`}
                            >
                              {block.name}
                            </span>
                          </div>
                          <div className="text-[9px] opacity-80 font-mono truncate">
                            {block.start.toFixed(1)}s &ndash; {(block.start + block.dur).toFixed(1)}s ({block.dur.toFixed(1)}s)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
