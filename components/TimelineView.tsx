'use client';

import React, { useState } from 'react';
import { Clip, MediaItem, Timeline, TrackType } from '../lib/types';

interface TimelineViewProps {
  timeline: Timeline;
  mediaList?: MediaItem[];
  editable?: boolean;
  onUpdateTimeline?: (timeline: Timeline) => void;
  title?: string;
}

const TRACKS: { id: TrackType; label: string; desc: string; bg: string; border: string; clipBg: string }[] = [
  { id: 'V2', label: 'V2', desc: 'Overlay / B-Roll', bg: 'bg-purple-950/20', border: 'border-purple-800/40', clipBg: 'bg-purple-600 hover:bg-purple-500 border-purple-400' },
  { id: 'V1', label: 'V1', desc: 'Primary Video', bg: 'bg-blue-950/20', border: 'border-blue-800/40', clipBg: 'bg-blue-600 hover:bg-blue-500 border-blue-400' },
  { id: 'A1', label: 'A1', desc: 'Audio', bg: 'bg-emerald-950/20', border: 'border-emerald-800/40', clipBg: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400' },
  { id: 'CC', label: 'CC', desc: 'Color / Captions', bg: 'bg-amber-950/20', border: 'border-amber-800/40', clipBg: 'bg-amber-600 hover:bg-amber-500 border-amber-400' },
];

export function TimelineView({
  timeline,
  mediaList = [],
  editable = false,
  onUpdateTimeline,
  title,
}: TimelineViewProps) {
  const [pxPerSec, setPxPerSec] = useState<number>(45);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isAddingClip, setIsAddingClip] = useState<boolean>(false);

  // New clip form state
  const [newTrack, setNewTrack] = useState<TrackType>('V1');
  const [newName, setNewName] = useState<string>('New Clip');
  const [newMediaId, setNewMediaId] = useState<string>('');
  const [newStart, setNewStart] = useState<number>(0);
  const [newDur, setNewDur] = useState<number>(3);
  const [newSpeed, setNewSpeed] = useState<number>(1.0);

  // Calculate total timeline length in seconds
  const maxTime = Math.max(
    15,
    ...timeline.clips.map((c) => c.start + c.dur + 2)
  );

  const selectedClip = timeline.clips.find((c) => c.id === selectedClipId);

  const handleUpdateSelectedClip = (field: keyof Clip, value: any) => {
    if (!editable || !onUpdateTimeline || !selectedClipId) return;
    const updatedClips = timeline.clips.map((c) => {
      if (c.id === selectedClipId) {
        return { ...c, [field]: value };
      }
      return c;
    });
    onUpdateTimeline({ clips: updatedClips });
  };

  const handleDeleteSelectedClip = () => {
    if (!editable || !onUpdateTimeline || !selectedClipId) return;
    const updatedClips = timeline.clips.filter((c) => c.id !== selectedClipId);
    onUpdateTimeline({ clips: updatedClips });
    setSelectedClipId(null);
  };

  const handleAddClip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable || !onUpdateTimeline) return;

    const newClip: Clip = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `clip_${Date.now()}`,
      track: newTrack,
      name: newName.trim() || 'Untitled Clip',
      mediaId: newMediaId || null,
      start: Math.max(0, Number(newStart) || 0),
      dur: Math.max(0.5, Number(newDur) || 1),
      sourceIn: 0,
      sourceOut: Math.max(0.5, Number(newDur) || 1),
      speed: Number(newSpeed) || 1.0,
    };

    onUpdateTimeline({ clips: [...timeline.clips, newClip] });
    setIsAddingClip(false);
    setSelectedClipId(newClip.id);
  };

  // Generate ruler tick marks
  const tickInterval = pxPerSec >= 60 ? 1 : pxPerSec >= 30 ? 2 : 5;
  const tickCount = Math.ceil(maxTime / tickInterval);
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * tickInterval);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      {/* Timeline Header Controls */}
      <div className="px-4 py-3 bg-slate-850 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-3">
          {title && <h3 className="font-semibold text-slate-200 text-sm">{title}</h3>}
          <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
            {timeline.clips.length} clip{timeline.clips.length !== 1 ? 's' : ''} &bull; {maxTime.toFixed(1)}s total
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 text-xs text-slate-300">
            <button
              type="button"
              onClick={() => setPxPerSec((p) => Math.max(20, p - 10))}
              className="px-2 py-1 hover:bg-slate-700 rounded transition"
              title="Zoom Out"
            >
              -
            </button>
            <span className="px-2 font-mono text-[11px] text-slate-400">{pxPerSec}px/s</span>
            <button
              type="button"
              onClick={() => setPxPerSec((p) => Math.min(100, p + 10))}
              className="px-2 py-1 hover:bg-slate-700 rounded transition"
              title="Zoom In"
            >
              +
            </button>
          </div>

          {editable && onUpdateTimeline && (
            <button
              type="button"
              onClick={() => setIsAddingClip(!isAddingClip)}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition shadow-sm"
            >
              {isAddingClip ? 'Cancel' : '+ Add Clip'}
            </button>
          )}
        </div>
      </div>

      {/* Add clip modal/panel */}
      {isAddingClip && editable && (
        <form onSubmit={handleAddClip} className="p-4 bg-slate-950/80 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Track</label>
            <select
              value={newTrack}
              onChange={(e) => setNewTrack(e.target.value as TrackType)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white"
            >
              <option value="V2">V2 (Overlay)</option>
              <option value="V1">V1 (Primary)</option>
              <option value="A1">A1 (Audio)</option>
              <option value="CC">CC (Color/Caption)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Clip Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Intro cut"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white"
              required
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Source Media</label>
            <select
              value={newMediaId}
              onChange={(e) => setNewMediaId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white"
            >
              <option value="">(None / Generator)</option>
              {mediaList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.duration.toFixed(1)}s)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Start Time (s)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={newStart}
              onChange={(e) => setNewStart(parseFloat(e.target.value) || 0)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Duration (s)</label>
            <input
              type="number"
              step="0.1"
              min="0.2"
              value={newDur}
              onChange={(e) => setNewDur(parseFloat(e.target.value) || 1)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded transition"
            >
              Save Clip
            </button>
          </div>
        </form>
      )}

      {/* Timeline Tracks Display */}
      <div className="overflow-x-auto relative">
        <div style={{ width: `${Math.max(800, maxTime * pxPerSec + 150)}px` }} className="min-w-full">
          {/* Ruler */}
          <div className="h-7 bg-slate-950 border-b border-slate-800 flex items-center relative pl-24">
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-slate-950 border-r border-slate-800 text-[10px] text-slate-500 uppercase font-semibold flex items-center px-2">
              Time (s)
            </div>
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 bottom-0 flex flex-col justify-end text-[10px] font-mono text-slate-500 border-l border-slate-800 pl-1"
                style={{ left: `${24 * 4 + t * pxPerSec}px` }}
              >
                <span>{t}s</span>
              </div>
            ))}
          </div>

          {/* Tracks */}
          <div className="divide-y divide-slate-800/60">
            {TRACKS.map((track) => {
              const trackClips = timeline.clips.filter((c) => c.track === track.id);

              return (
                <div key={track.id} className={`h-14 flex relative items-center ${track.bg}`}>
                  {/* Track Label Sidebar */}
                  <div className="sticky left-0 z-20 w-24 h-full bg-slate-900/95 border-r border-slate-800 px-2.5 py-1.5 flex flex-col justify-center shadow-md">
                    <span className="font-bold text-xs text-slate-200">{track.label}</span>
                    <span className="text-[10px] text-slate-400 truncate">{track.desc}</span>
                  </div>

                  {/* Track lane */}
                  <div className="relative h-full flex-1">
                    {trackClips.map((clip) => {
                      const left = clip.start * pxPerSec;
                      const width = Math.max(30, clip.dur * pxPerSec);
                      const isSelected = clip.id === selectedClipId;

                      return (
                        <div
                          key={clip.id}
                          onClick={() => setSelectedClipId(clip.id)}
                          style={{
                            left: `${left}px`,
                            width: `${width}px`,
                          }}
                          className={`absolute top-1.5 bottom-1.5 rounded border px-2 py-1 cursor-pointer transition-all flex flex-col justify-between text-xs overflow-hidden select-none ${track.clipBg} ${
                            isSelected ? 'ring-2 ring-white shadow-lg z-10 brightness-110' : 'opacity-90'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-semibold text-white truncate gap-1">
                            <span className="truncate">{clip.name}</span>
                            {clip.speed !== 1 && (
                              <span className="text-[9px] bg-black/40 px-1 rounded text-white/90">
                                {clip.speed}x
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-white/80 flex items-center justify-between">
                            <span>{clip.start.toFixed(1)}s</span>
                            <span>{clip.dur.toFixed(1)}s</span>
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

      {/* Clip Details Inspector */}
      {selectedClip && (
        <div className="p-4 bg-slate-950 border-t border-slate-800 text-xs">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded font-mono font-bold bg-slate-800 text-indigo-400">
                {selectedClip.track}
              </span>
              <h4 className="font-semibold text-slate-200 text-sm">{selectedClip.name}</h4>
              <span className="text-slate-500 font-mono text-[10px]">ID: {selectedClip.id.slice(0, 8)}...</span>
            </div>

            {editable && (
              <button
                type="button"
                onClick={handleDeleteSelectedClip}
                className="px-2.5 py-1 bg-red-900/50 hover:bg-red-800 text-red-300 rounded border border-red-700/60 transition"
              >
                Delete Clip
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            <div>
              <span className="block text-slate-400 mb-1">Track</span>
              {editable ? (
                <select
                  value={selectedClip.track}
                  onChange={(e) => handleUpdateSelectedClip('track', e.target.value as TrackType)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                >
                  <option value="V2">V2</option>
                  <option value="V1">V1</option>
                  <option value="A1">A1</option>
                  <option value="CC">CC</option>
                </select>
              ) : (
                <span className="font-mono text-slate-200">{selectedClip.track}</span>
              )}
            </div>

            <div>
              <span className="block text-slate-400 mb-1">Timeline Start</span>
              {editable ? (
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={selectedClip.start}
                  onChange={(e) => handleUpdateSelectedClip('start', Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                />
              ) : (
                <span className="font-mono text-slate-200">{selectedClip.start.toFixed(2)}s</span>
              )}
            </div>

            <div>
              <span className="block text-slate-400 mb-1">Duration</span>
              {editable ? (
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={selectedClip.dur}
                  onChange={(e) => handleUpdateSelectedClip('dur', Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                />
              ) : (
                <span className="font-mono text-slate-200">{selectedClip.dur.toFixed(2)}s</span>
              )}
            </div>

            <div>
              <span className="block text-slate-400 mb-1">Source In &bull; Out</span>
              {editable ? (
                <div className="flex space-x-1">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={selectedClip.sourceIn}
                    onChange={(e) => handleUpdateSelectedClip('sourceIn', parseFloat(e.target.value) || 0)}
                    className="w-1/2 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-slate-200"
                  />
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={selectedClip.sourceOut}
                    onChange={(e) => handleUpdateSelectedClip('sourceOut', parseFloat(e.target.value) || 0)}
                    className="w-1/2 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-slate-200"
                  />
                </div>
              ) : (
                <span className="font-mono text-slate-200">
                  {selectedClip.sourceIn.toFixed(1)}s &rarr; {selectedClip.sourceOut.toFixed(1)}s
                </span>
              )}
            </div>

            <div>
              <span className="block text-slate-400 mb-1">Speed</span>
              {editable ? (
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="4"
                  value={selectedClip.speed}
                  onChange={(e) => handleUpdateSelectedClip('speed', parseFloat(e.target.value) || 1.0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                />
              ) : (
                <span className="font-mono text-slate-200">{selectedClip.speed}x</span>
              )}
            </div>

            <div>
              <span className="block text-slate-400 mb-1">Linked Media</span>
              <span className="text-slate-300 truncate block">
                {mediaList.find((m) => m.id === selectedClip.mediaId)?.name || (selectedClip.mediaId ? selectedClip.mediaId : 'None')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

