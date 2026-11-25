'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clip, MediaItem, Timeline, TrackType } from '../lib/types';
import { hasTrackOverlaps, preventOverlaps } from '../lib/vc';

interface TimelineViewProps {
  timeline: Timeline;
  mediaList?: MediaItem[];
  editable?: boolean;
  onUpdateTimeline?: (timeline: Timeline) => void;
  title?: string;
  time?: number;
  onTime?: (t: number) => void;
}

const TRACKS: { id: TrackType; label: string; desc: string; bg: string; border: string; clipBg: string }[] = [
  { id: 'V2', label: 'V2', desc: 'Overlay / B-Roll', bg: 'bg-purple-950/20', border: 'border-purple-800/40', clipBg: 'bg-purple-600 hover:bg-purple-500 border-purple-400' },
  { id: 'V1', label: 'V1', desc: 'Primary Video', bg: 'bg-blue-950/20', border: 'border-blue-800/40', clipBg: 'bg-blue-600 hover:bg-blue-500 border-blue-400' },
  { id: 'A1', label: 'A1', desc: 'Audio', bg: 'bg-emerald-950/20', border: 'border-emerald-800/40', clipBg: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400' },
  { id: 'CC', label: 'CC', desc: 'Color / Captions', bg: 'bg-amber-950/20', border: 'border-amber-800/40', clipBg: 'bg-amber-600 hover:bg-amber-500 border-amber-400' },
];

const TRACK_HEIGHT = 56; // 14 Tailwind units = 56px

interface DragState {
  mode: 'move' | 'trim-left' | 'trim-right';
  clipId: string;
  startMouseX: number;
  startMouseY: number;
  initialStart: number;
  initialDur: number;
  initialSourceIn: number;
  initialSourceOut: number;
  initialSpeed: number;
  initialTrack: TrackType;
  currentStart: number;
  currentDur: number;
  currentSourceIn: number;
  currentSourceOut: number;
  currentTrack: TrackType;
}

export function TimelineView({
  timeline,
  mediaList = [],
  editable = false,
  onUpdateTimeline,
  title,
  time: propTime,
  onTime,
}: TimelineViewProps) {
  const [pxPerSec, setPxPerSec] = useState<number>(45);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isAddingClip, setIsAddingClip] = useState<boolean>(false);
  const [internalTime, setInternalTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [snappingEnabled, setSnappingEnabled] = useState<boolean>(true);

  // Undo / Redo history stacks
  const [undoStack, setUndoStack] = useState<Timeline[]>([]);
  const [redoStack, setRedoStack] = useState<Timeline[]>([]);

  // Dragging state for move & trim
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  // New clip form state
  const [newTrack, setNewTrack] = useState<TrackType>('V1');
  const [newName, setNewName] = useState<string>('New Clip');
  const [newMediaId, setNewMediaId] = useState<string>('');
  const [newStart, setNewStart] = useState<number>(0);
  const [newDur, setNewDur] = useState<number>(5);
  const [newSpeed, setNewSpeed] = useState<number>(1.0);

  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);

  // Current playhead time
  const currentTime = propTime !== undefined ? propTime : internalTime;

  // Calculate total timeline length in seconds
  const maxTime = Math.max(
    15,
    ...timeline.clips.map((c) => c.start + c.dur + 2)
  );

  const updateTime = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(maxTime, t));
    const rounded = parseFloat(clamped.toFixed(2));
    if (onTime) {
      onTime(rounded);
    } else {
      setInternalTime(rounded);
    }
  }, [maxTime, onTime]);

  // Helper to commit a timeline change with undo history
  const commitTimelineChange = useCallback((newTimeline: Timeline) => {
    if (!onUpdateTimeline) return;
    const sanitized = preventOverlaps(newTimeline);
    setUndoStack((prev) => [...prev.slice(-30), JSON.parse(JSON.stringify(timeline))]);
    setRedoStack([]);
    onUpdateTimeline(sanitized);
  }, [onUpdateTimeline, timeline]);

  // Auto-untangle any overlapping clips on the timeline
  useEffect(() => {
    if (hasTrackOverlaps(timeline) && editable && onUpdateTimeline) {
      onUpdateTimeline(preventOverlaps(timeline));
    }
  }, [timeline, editable, onUpdateTimeline]);

  const handleUndo = useCallback(() => {
    if (!editable || !onUpdateTimeline || undoStack.length === 0) return;
    const prevTimeline = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, JSON.parse(JSON.stringify(timeline))]);
    onUpdateTimeline(prevTimeline);
  }, [editable, onUpdateTimeline, undoStack, timeline]);

  const handleRedo = useCallback(() => {
    if (!editable || !onUpdateTimeline || redoStack.length === 0) return;
    const nextTimeline = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, JSON.parse(JSON.stringify(timeline))]);
    onUpdateTimeline(nextTimeline);
  }, [editable, onUpdateTimeline, redoStack, timeline]);

  // Playhead playback loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const nextTime = currentTime + 0.1;
      if (nextTime >= maxTime) {
        setIsPlaying(false);
        updateTime(0);
      } else {
        updateTime(nextTime);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, currentTime, maxTime, updateTime]);

  const selectedClip = timeline.clips.find((c) => c.id === selectedClipId);

  // Active clips under current playhead
  const activeClips = timeline.clips.filter(
    (c) => currentTime >= c.start && currentTime <= c.start + c.dur
  );
  const activeVideoClip =
    activeClips.find((c) => c.track === 'V2') ||
    activeClips.find((c) => c.track === 'V1');
  const activeAudioClip = activeClips.find((c) => c.track === 'A1');
  const activeEffectClip = activeClips.find((c) => c.track === 'CC');

  // Split clip at playhead
  const handleSplitAtPlayhead = useCallback(() => {
    if (!editable || !onUpdateTimeline) return;

    const targetClip = selectedClip && currentTime > selectedClip.start && currentTime < selectedClip.start + selectedClip.dur
      ? selectedClip
      : activeVideoClip || activeClips[0];

    if (!targetClip) return;
    if (currentTime <= targetClip.start || currentTime >= targetClip.start + targetClip.dur) return;

    const splitOffset = currentTime - targetClip.start;
    const firstDur = parseFloat(splitOffset.toFixed(2));
    const secondDur = parseFloat((targetClip.dur - splitOffset).toFixed(2));
    const firstSourceOut = targetClip.sourceIn + splitOffset * targetClip.speed;

    const firstClip: Clip = {
      ...targetClip,
      dur: firstDur,
      sourceOut: firstSourceOut,
    };

    const secondClip: Clip = {
      ...targetClip,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `clip_${Date.now()}`,
      start: parseFloat(currentTime.toFixed(2)),
      dur: secondDur,
      sourceIn: firstSourceOut,
    };

    const updated = timeline.clips.map((c) => (c.id === targetClip.id ? firstClip : c));
    updated.push(secondClip);

    commitTimelineChange({ clips: updated });
    setSelectedClipId(secondClip.id);
  }, [editable, onUpdateTimeline, selectedClip, currentTime, activeVideoClip, activeClips, timeline.clips, commitTimelineChange]);

  // Delete selected clip
  const handleDeleteSelectedClip = useCallback(() => {
    if (!editable || !onUpdateTimeline || !selectedClipId) return;
    const updatedClips = timeline.clips.filter((c) => c.id !== selectedClipId);
    commitTimelineChange({ clips: updatedClips });
    setSelectedClipId(null);
  }, [editable, onUpdateTimeline, selectedClipId, timeline.clips, commitTimelineChange]);

  // Duplicate selected clip
  const handleDuplicateSelectedClip = useCallback(() => {
    if (!editable || !onUpdateTimeline || !selectedClip) return;
    const duplicateClip: Clip = {
      ...selectedClip,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `clip_${Date.now()}_dup`,
      name: `${selectedClip.name} (Copy)`,
      start: parseFloat((selectedClip.start + selectedClip.dur + 0.1).toFixed(2)),
    };
    commitTimelineChange({ clips: [...timeline.clips, duplicateClip] });
    setSelectedClipId(duplicateClip.id);
  }, [editable, onUpdateTimeline, selectedClip, timeline.clips, commitTimelineChange]);

  // Ripple Delete selected clip (removes clip and pulls subsequent clips backward to close the gap)
  const handleRippleDeleteSelectedClip = useCallback(() => {
    if (!editable || !onUpdateTimeline || !selectedClip) return;
    const deletedTrack = selectedClip.track;
    const deletedStart = selectedClip.start;
    const deletedDur = selectedClip.dur;

    const remaining = timeline.clips
      .filter((c) => c.id !== selectedClip.id)
      .map((c) => {
        if (c.track === deletedTrack && c.start >= deletedStart + deletedDur) {
          return {
            ...c,
            start: parseFloat(Math.max(0, c.start - deletedDur).toFixed(2)),
          };
        }
        return c;
      });

    commitTimelineChange({ clips: remaining });
    setSelectedClipId(null);
  }, [editable, onUpdateTimeline, selectedClip, timeline.clips, commitTimelineChange]);

  // Close gaps between clips on V1 and snap leading clips to 0s
  const handleCloseGaps = useCallback(() => {
    if (!editable || !onUpdateTimeline) return;
    const v1Clips = [...timeline.clips.filter((c) => c.track === 'V1')].sort((a, b) => a.start - b.start);
    if (v1Clips.length === 0) return;

    const leadingGap = v1Clips[0].start;
    let curStart = 0;
    const updatedV1 = v1Clips.map((c) => {
      const res = { ...c, start: parseFloat(curStart.toFixed(2)) };
      curStart += c.dur;
      return res;
    });

    const nonV1 = timeline.clips.filter((c) => c.track !== 'V1').map((c) => {
      if (leadingGap > 0 && c.start >= leadingGap) {
        return { ...c, start: parseFloat(Math.max(0, c.start - leadingGap).toFixed(2)) };
      }
      return c;
    });

    commitTimelineChange({ clips: [...updatedV1, ...nonV1] });
  }, [editable, onUpdateTimeline, timeline.clips, commitTimelineChange]);

  // Keyboard Shortcuts (Space, Ctrl+Z, Ctrl+Y, S, Delete, Arrow keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Duplicate: Ctrl+D
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateSelectedClip();
        return;
      }

      // Space: Play/Pause
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
        return;
      }

      // Split: 'S'
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSplitAtPlayhead();
        return;
      }

      // Delete: Delete or Backspace (Shift+Del for ripple delete)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRippleDeleteSelectedClip();
        } else {
          handleDeleteSelectedClip();
        }
        return;
      }

      // Arrow Left / Right: Seek backward/forward
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : 0.1;
        updateTime(currentTime - step);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1.0 : 0.1;
        updateTime(currentTime + step);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleSplitAtPlayhead, handleDeleteSelectedClip, handleDuplicateSelectedClip, updateTime, currentTime]);

  // Compute snap points (0, playhead, all other clips' start & end)
  const getSnapPoints = useCallback((excludeClipId?: string): number[] => {
    const points = new Set<number>([0, parseFloat(currentTime.toFixed(2))]);
    timeline.clips.forEach((c) => {
      if (c.id !== excludeClipId) {
        points.add(parseFloat(c.start.toFixed(2)));
        points.add(parseFloat((c.start + c.dur).toFixed(2)));
      }
    });
    return Array.from(points);
  }, [currentTime, timeline.clips]);

  // Start clip drag (move or trim)
  const handleStartClipDrag = (
    e: React.MouseEvent,
    clip: Clip,
    mode: 'move' | 'trim-left' | 'trim-right'
  ) => {
    if (!editable) return;
    e.stopPropagation();
    setSelectedClipId(clip.id);

    setDragState({
      mode,
      clipId: clip.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initialStart: clip.start,
      initialDur: clip.dur,
      initialSourceIn: clip.sourceIn,
      initialSourceOut: clip.sourceOut,
      initialSpeed: clip.speed,
      initialTrack: clip.track,
      currentStart: clip.start,
      currentDur: clip.dur,
      currentSourceIn: clip.sourceIn,
      currentSourceOut: clip.sourceOut,
      currentTrack: clip.track,
    });
  };

  // Global mouse move & mouse up listeners for dragging & scrubbing
  useEffect(() => {
    if (!dragState && !isScrubbing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Handle playhead scrubbing
      if (isScrubbing && rulerRef.current) {
        const rect = rulerRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left - 96;
        const sought = Math.max(0, Math.min(maxTime, clickX / pxPerSec));
        updateTime(sought);
        return;
      }

      // Handle clip dragging (move or trim)
      if (dragState) {
        const deltaX = (e.clientX - dragState.startMouseX) / pxPerSec;
        const snapThreshold = 10 / pxPerSec; // 10px snap window
        const snapPoints = snappingEnabled ? getSnapPoints(dragState.clipId) : [];

        if (dragState.mode === 'move') {
          let candidateStart = Math.max(0, dragState.initialStart + deltaX);
          const candidateEnd = candidateStart + dragState.initialDur;

          // Apply snapping to start or end
          if (snappingEnabled) {
            for (const sp of snapPoints) {
              if (Math.abs(candidateStart - sp) < snapThreshold) {
                candidateStart = sp;
                break;
              } else if (Math.abs(candidateEnd - sp) < snapThreshold) {
                candidateStart = Math.max(0, sp - dragState.initialDur);
                break;
              }
            }
          }

          // Track lane vertical detection
          let candidateTrack = dragState.initialTrack;
          if (tracksContainerRef.current) {
            const containerRect = tracksContainerRef.current.getBoundingClientRect();
            const relY = e.clientY - containerRect.top;
            const trackIndex = Math.floor(relY / TRACK_HEIGHT);
            if (trackIndex >= 0 && trackIndex < TRACKS.length) {
              candidateTrack = TRACKS[trackIndex].id;
            }
          }

          setDragState((prev) => prev ? {
            ...prev,
            currentStart: parseFloat(candidateStart.toFixed(2)),
            currentTrack: candidateTrack,
          } : null);
        } else if (dragState.mode === 'trim-left') {
          // Left handle: adjusts start, dur, sourceIn
          let candidateStart = dragState.initialStart + deltaX;
          candidateStart = Math.max(0, Math.min(candidateStart, dragState.initialStart + dragState.initialDur - 0.2));

          if (snappingEnabled) {
            for (const sp of snapPoints) {
              if (Math.abs(candidateStart - sp) < snapThreshold) {
                candidateStart = sp;
                break;
              }
            }
          }

          const actualDelta = candidateStart - dragState.initialStart;
          const newDur = Math.max(0.2, dragState.initialDur - actualDelta);
          const newSourceIn = Math.max(0, dragState.initialSourceIn + actualDelta * dragState.initialSpeed);

          setDragState((prev) => prev ? {
            ...prev,
            currentStart: parseFloat(candidateStart.toFixed(2)),
            currentDur: parseFloat(newDur.toFixed(2)),
            currentSourceIn: parseFloat(newSourceIn.toFixed(2)),
          } : null);
        } else if (dragState.mode === 'trim-right') {
          // Right handle: adjusts dur, sourceOut
          let candidateEnd = dragState.initialStart + dragState.initialDur + deltaX;
          candidateEnd = Math.max(dragState.initialStart + 0.2, candidateEnd);

          if (snappingEnabled) {
            for (const sp of snapPoints) {
              if (Math.abs(candidateEnd - sp) < snapThreshold) {
                candidateEnd = sp;
                break;
              }
            }
          }

          const newDur = Math.max(0.2, candidateEnd - dragState.initialStart);
          const newSourceOut = dragState.initialSourceIn + newDur * dragState.initialSpeed;

          setDragState((prev) => prev ? {
            ...prev,
            currentDur: parseFloat(newDur.toFixed(2)),
            currentSourceOut: parseFloat(newSourceOut.toFixed(2)),
          } : null);
        }
      }
    };

    const handleMouseUp = () => {
      if (isScrubbing) {
        setIsScrubbing(false);
      }

      if (dragState) {
        const hasChanged =
          dragState.currentStart !== dragState.initialStart ||
          dragState.currentDur !== dragState.initialDur ||
          dragState.currentTrack !== dragState.initialTrack ||
          dragState.currentSourceIn !== dragState.initialSourceIn ||
          dragState.currentSourceOut !== dragState.initialSourceOut;

        if (hasChanged && editable && onUpdateTimeline) {
          const updatedClips = timeline.clips.map((c) => {
            if (c.id === dragState.clipId) {
              return {
                ...c,
                start: dragState.currentStart,
                dur: dragState.currentDur,
                track: dragState.currentTrack,
                sourceIn: dragState.currentSourceIn,
                sourceOut: dragState.currentSourceOut,
              };
            }
            return c;
          });
          const nonOverlapping = preventOverlaps({ clips: updatedClips }, dragState.clipId);
          commitTimelineChange(nonOverlapping);
        }

        setDragState(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, isScrubbing, pxPerSec, maxTime, snappingEnabled, getSnapPoints, editable, onUpdateTimeline, timeline.clips, commitTimelineChange, updateTime]);

  const handleUpdateSelectedClip = (field: keyof Clip, value: any) => {
    if (!editable || !onUpdateTimeline || !selectedClipId) return;
    const updatedClips = timeline.clips.map((c) => {
      if (c.id === selectedClipId) {
        return { ...c, [field]: value };
      }
      return c;
    });
    commitTimelineChange({ clips: updatedClips });
  };

  const handleOpenAddClip = () => {
    if (!isAddingClip) {
      // Find a media item to preselect
      const availableMedia = mediaList.length > 0 ? mediaList[0] : null;

      // Smart placement: at the end of the selected track so clips never overlap
      const trackClips = timeline.clips.filter((c) => c.track === newTrack);
      const endOfTrack = trackClips.length > 0
        ? Math.max(...trackClips.map((c) => c.start + c.dur))
        : 0;
      setNewStart(parseFloat(endOfTrack.toFixed(2)));

      if (availableMedia) {
        setNewMediaId(availableMedia.id);
        setNewName(availableMedia.name);
        setNewDur(parseFloat(availableMedia.duration.toFixed(2)));
        const isAudio = availableMedia.name.toLowerCase().match(/\.(mp3|wav|ogg|m4a|aac|flac)$/);
        if (isAudio) setNewTrack('A1');
      } else {
        setNewMediaId('');
        setNewName('New Clip');
        setNewDur(5);
      }
    }
    setIsAddingClip(!isAddingClip);
  };

  const handleAddClip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editable || !onUpdateTimeline) return;

    const selectedMedia = mediaList.find((m) => m.id === newMediaId);
    // Directly use full media duration, no duration prompt
    const fullDur = selectedMedia ? selectedMedia.duration : 5.0;
    const validDur = Math.max(0.1, fullDur);

    const trackClips = timeline.clips.filter((c) => c.track === newTrack);
    const endOfTrack = trackClips.length > 0
      ? Math.max(...trackClips.map((c) => c.start + c.dur))
      : 0;

    // Check if newStart overlaps an existing clip on this track
    let targetStart = Math.max(0, Number(newStart) || 0);
    const hasCollision = trackClips.some((c) => {
      const clipEnd = c.start + c.dur;
      return targetStart < clipEnd && c.start < targetStart + validDur;
    });

    if (hasCollision) {
      targetStart = parseFloat(endOfTrack.toFixed(2));
    }

    const newClip: Clip = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `clip_${Date.now()}`,
      track: newTrack,
      name: newName.trim() || (selectedMedia ? selectedMedia.name : 'Untitled Clip'),
      mediaId: newMediaId || null,
      start: targetStart,
      dur: validDur,
      sourceIn: 0,
      sourceOut: validDur,
      speed: Number(newSpeed) || 1.0,
    };

    const nonOverlapping = preventOverlaps({ clips: [...timeline.clips, newClip] }, newClip.id);
    commitTimelineChange(nonOverlapping);
    setIsAddingClip(false);
    setSelectedClipId(newClip.id);
  };

  // Ruler mousedown to seek and scrub
  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left - 96;
    if (clickX >= 0) {
      const soughtTime = Math.max(0, Math.min(maxTime, clickX / pxPerSec));
      updateTime(soughtTime);
      setIsScrubbing(true);
    }
  };

  // Export timeline as JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(timeline, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `timeline_${Date.now()}.json`);
    dlAnchor.click();
  };

  // Generate ruler tick marks
  const tickInterval = pxPerSec >= 60 ? 1 : pxPerSec >= 30 ? 2 : 5;
  const tickCount = Math.ceil(maxTime / tickInterval);
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * tickInterval);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl select-none">
      {/* Timeline Header Controls */}
      <div className="px-4 py-3 bg-slate-850 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-3">
          {title && <h3 className="font-semibold text-slate-200 text-sm">{title}</h3>}
          <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">
            {timeline.clips.length} clip{timeline.clips.length !== 1 ? 's' : ''} &bull; {maxTime.toFixed(1)}s total
          </span>
        </div>

        {/* Playback & Quick Editing Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Play / Reset */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold transition flex items-center gap-1"
              title="Space to toggle play/pause"
            >
              <span>{isPlaying ? '❚❚' : '▶'}</span>
              <span className="text-[11px] font-mono">{currentTime.toFixed(1)}s</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                updateTime(0);
              }}
              className="px-2 py-1 text-slate-300 hover:text-white transition"
              title="Return to start (0s)"
            >
              ⏮
            </button>
          </div>

          {/* Undo & Redo buttons */}
          {editable && (
            <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className={`px-2 py-1 rounded transition flex items-center gap-1 ${
                  undoStack.length > 0
                    ? 'text-slate-200 hover:bg-slate-700'
                    : 'text-slate-600 cursor-not-allowed'
                }`}
                title="Undo (Ctrl+Z)"
              >
                <span>↺</span>
                <span className="text-[11px]">Undo</span>
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className={`px-2 py-1 rounded transition flex items-center gap-1 ${
                  redoStack.length > 0
                    ? 'text-slate-200 hover:bg-slate-700'
                    : 'text-slate-600 cursor-not-allowed'
                }`}
                title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
              >
                <span>↻</span>
                <span className="text-[11px]">Redo</span>
              </button>
            </div>
          )}

          {/* Magnetic Snapping Toggle */}
          <button
            type="button"
            onClick={() => setSnappingEnabled(!snappingEnabled)}
            className={`px-2 py-1 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${
              snappingEnabled
                ? 'bg-cyan-950/80 border-cyan-700/80 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle magnetic snapping to clip ends and playhead"
          >
            <span>🧲</span>
            <span className="text-[11px]">Snap: {snappingEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {/* Split button */}
          {editable && onUpdateTimeline && (
            <button
              type="button"
              onClick={handleSplitAtPlayhead}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center gap-1"
              title="Split clip at playhead (Hotkey: S)"
            >
              <span>✂</span>
              <span>Split (S)</span>
            </button>
          )}

          {/* Duplicate button */}
          {editable && selectedClip && (
            <button
              type="button"
              onClick={handleDuplicateSelectedClip}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center gap-1"
              title="Duplicate selected clip (Ctrl+D)"
            >
              <span>⧉</span>
              <span>Duplicate</span>
            </button>
          )}

          {/* Delete clip buttons */}
          {editable && selectedClip && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDeleteSelectedClip}
                className="px-2 py-1 bg-rose-950/70 hover:bg-rose-900 border border-rose-800/80 text-rose-300 text-xs font-medium rounded-lg transition flex items-center gap-1"
                title="Lift Delete: removes clip and leaves blank gap (Delete / Backspace)"
              >
                <span>🗑 Lift</span>
              </button>
              <button
                type="button"
                onClick={handleRippleDeleteSelectedClip}
                className="px-2 py-1 bg-amber-950/70 hover:bg-amber-900 border border-amber-800/80 text-amber-300 text-xs font-medium rounded-lg transition flex items-center gap-1"
                title="Ripple Delete: removes clip and ripples following clips to close gap (Shift+Delete)"
              >
                <span>⇤ Ripple Del</span>
              </button>
            </div>
          )}

          {/* Close gaps button */}
          {editable && (
            <button
              type="button"
              onClick={handleCloseGaps}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition"
              title="Snap all V1 video clips one after another with no empty gaps"
            >
              Close Gaps
            </button>
          )}

          {/* Fix Overlaps button if any overlap exists */}
          {editable && hasTrackOverlaps(timeline) && (
            <button
              type="button"
              onClick={() => commitTimelineChange(preventOverlaps(timeline))}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow animate-pulse flex items-center gap-1"
              title="Fix overlapping clips on all tracks and arrange them sequentially"
            >
              <span>⚠</span>
              <span>Fix Overlaps</span>
            </button>
          )}

          {/* Zoom controls */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 text-xs text-slate-300 border border-slate-700">
            <button
              type="button"
              onClick={() => setPxPerSec((p) => Math.max(20, p - 10))}
              className="px-2 py-1 hover:bg-slate-700 rounded transition"
              title="Zoom Out"
            >
              -
            </button>
            <span className="px-1.5 font-mono text-[11px] text-slate-400">{pxPerSec}px/s</span>
            <button
              type="button"
              onClick={() => setPxPerSec((p) => Math.min(100, p + 10))}
              className="px-2 py-1 hover:bg-slate-700 rounded transition"
              title="Zoom In"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportJSON}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition"
            title="Export Timeline as JSON"
          >
            JSON
          </button>

          {editable && onUpdateTimeline && (
            <button
              type="button"
              onClick={handleOpenAddClip}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition shadow-sm"
            >
              {isAddingClip ? 'Cancel' : '+ Add Clip'}
            </button>
          )}
        </div>
      </div>

      {/* Monitor HUD preview */}
      <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center space-x-3 overflow-hidden">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider shrink-0">Playhead Monitor:</span>
          {activeVideoClip ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-200 truncate">
              <span className={`w-2 h-2 rounded-full shrink-0 ${activeVideoClip.track === 'V2' ? 'bg-purple-400' : 'bg-blue-400'}`}></span>
              <span className="truncate">[{activeVideoClip.track}] {activeVideoClip.name}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-slate-500 italic">
              <span>Black frame (gap) at {currentTime.toFixed(1)}s</span>
              {editable && timeline.clips.some((c) => c.track === 'V1' && c.start > 0) && (
                <button
                  type="button"
                  onClick={handleCloseGaps}
                  className="not-italic text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 px-2 py-0.5 rounded border border-slate-700 transition flex items-center gap-1 shadow-sm"
                  title="Remove empty gap and snap clips to start at 0.0s"
                >
                  <span>⇤ Close Gap to 0s</span>
                </button>
              )}
            </span>
          )}

          {activeAudioClip && (
            <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] shrink-0">
              <span>♫</span>
              <span>{activeAudioClip.name}</span>
            </span>
          )}

          {activeEffectClip && (
            <span className="inline-flex items-center gap-1 text-amber-400 text-[11px] shrink-0">
              <span>✦</span>
              <span>{activeEffectClip.name}</span>
            </span>
          )}
        </div>

        <div className="font-mono text-[11px] text-slate-400 shrink-0">
          Position: <strong className="text-white">{currentTime.toFixed(2)}s</strong> / {maxTime.toFixed(1)}s
        </div>
      </div>

      {/* Add clip modal/panel */}
      {isAddingClip && editable && (
        <form onSubmit={handleAddClip} className="p-4 bg-slate-950/90 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
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
              onChange={(e) => {
                const selectedId = e.target.value;
                setNewMediaId(selectedId);
                const media = mediaList.find((m) => m.id === selectedId);
                if (media) {
                  setNewDur(parseFloat(media.duration.toFixed(2)));
                  if (!newName || newName === 'New Clip' || newName === 'Untitled Clip' || mediaList.some((m) => m.name === newName)) {
                    setNewName(media.name);
                  }
                  const isAudio = media.name.toLowerCase().match(/\.(mp3|wav|ogg|m4a|aac|flac)$/);
                  if (isAudio && newTrack !== 'A1') {
                    setNewTrack('A1');
                  } else if (!isAudio && newTrack === 'A1') {
                    setNewTrack('V1');
                  }
                }
              }}
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

          <div className="flex flex-col justify-center">
            <span className="block text-slate-400 mb-1">Duration</span>
            <div className="px-2.5 py-1.5 bg-slate-900 border border-slate-700/80 rounded text-slate-200 font-mono text-xs flex items-center justify-between">
              <span>{mediaList.find((m) => m.id === newMediaId) ? `${mediaList.find((m) => m.id === newMediaId)?.duration.toFixed(1)}s` : '5.0s'}</span>
              <span className="text-[10px] text-emerald-400 font-sans font-semibold">
                {mediaList.find((m) => m.id === newMediaId) ? 'Full Media' : 'Generator'}
              </span>
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded transition shadow-sm"
            >
              + Add Clip
            </button>
          </div>
        </form>
      )}

      {/* Timeline Tracks Display */}
      <div className="overflow-x-auto relative select-none">
        <div
          ref={rulerRef}
          style={{ width: `${Math.max(800, maxTime * pxPerSec + 150)}px` }}
          className="min-w-full relative"
        >
          {/* Ruler (Click & Drag to Scrub Playhead) */}
          <div
            onMouseDown={handleRulerMouseDown}
            className="h-7 bg-slate-950 border-b border-slate-800 flex items-center relative pl-24 cursor-ew-resize hover:bg-slate-900 transition"
            title="Click or drag to scrub playhead"
          >
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-slate-950 border-r border-slate-800 text-[10px] text-slate-500 uppercase font-semibold flex items-center px-2 cursor-default">
              Time (s)
            </div>
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 bottom-0 flex flex-col justify-end text-[10px] font-mono text-slate-500 border-l border-slate-800 pl-1 pointer-events-none"
                style={{ left: `${96 + t * pxPerSec}px` }}
              >
                <span>{t}s</span>
              </div>
            ))}
          </div>

          {/* Interactive Red Playhead Line & Scrubber Handle */}
          <div
            style={{ left: `${96 + currentTime * pxPerSec}px` }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsScrubbing(true);
            }}
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-30 cursor-ew-resize hover:w-1 transition-all"
            title={`Playhead: ${currentTime.toFixed(2)}s (Drag to scrub)`}
          >
            {/* Playhead Grabber Diamond on Ruler */}
            <div className="w-3.5 h-3.5 bg-rose-500 -ml-1.5 -mt-0.5 rounded-sm rotate-45 shadow-lg border border-white/60 hover:scale-125 transition-transform cursor-grab active:cursor-grabbing"></div>
          </div>

          {/* Snapping Guide Line Indicator */}
          {dragState && snappingEnabled && (
            <div
              style={{ left: `${96 + dragState.currentStart * pxPerSec}px` }}
              className="absolute top-0 bottom-0 w-px bg-cyan-400 z-20 pointer-events-none opacity-80"
            />
          )}

          {/* Track Lanes */}
          <div ref={tracksContainerRef} className="divide-y divide-slate-800/60">
            {TRACKS.map((track) => {
              // Collect clips for this track, taking into account live dragging across tracks
              const trackClips = timeline.clips
                .filter((c) => {
                  if (dragState && c.id === dragState.clipId) {
                    return dragState.currentTrack === track.id;
                  }
                  return c.track === track.id;
                })
                .map((c) => {
                  if (dragState && c.id === dragState.clipId) {
                    return {
                      ...c,
                      start: dragState.currentStart,
                      dur: dragState.currentDur,
                      track: dragState.currentTrack,
                    };
                  }
                  return c;
                });

              return (
                <div key={track.id} className={`h-14 flex relative items-center ${track.bg}`}>
                  {/* Track Label Sidebar */}
                  <div className="sticky left-0 z-20 w-24 h-full bg-slate-900/95 border-r border-slate-800 px-2.5 py-1.5 flex flex-col justify-center shadow-md">
                    <span className="font-bold text-xs text-slate-200">{track.label}</span>
                    <span className="text-[10px] text-slate-400 truncate">{track.desc}</span>
                  </div>

                  {/* Track Lane Body */}
                  <div className="relative h-full flex-1">
                    {trackClips.map((clip) => {
                      const left = clip.start * pxPerSec;
                      const width = Math.max(30, clip.dur * pxPerSec);
                      const isSelected = clip.id === selectedClipId;
                      const isDraggingThis = dragState?.clipId === clip.id;

                      return (
                        <div
                          key={clip.id}
                          onMouseDown={(e) => handleStartClipDrag(e, clip, 'move')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedClipId(clip.id);
                          }}
                          style={{
                            left: `${left}px`,
                            width: `${width}px`,
                          }}
                          className={`absolute top-1.5 bottom-1.5 rounded-lg border px-2 py-1 transition-shadow flex flex-col justify-between text-xs overflow-hidden select-none group ${track.clipBg} ${
                            isDraggingThis
                              ? 'cursor-grabbing shadow-2xl ring-2 ring-cyan-400 z-30 opacity-95 scale-[1.01]'
                              : isSelected
                              ? 'ring-2 ring-white shadow-xl z-20 brightness-110 cursor-grab'
                              : 'opacity-90 hover:opacity-100 cursor-grab'
                          }`}
                        >
                          {/* Left Trim Handle */}
                          {editable && (
                            <div
                              onMouseDown={(e) => handleStartClipDrag(e, clip, 'trim-left')}
                              className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Trim In-point (Drag to adjust start)"
                            >
                              <div className="w-0.5 h-4 bg-white/70 rounded"></div>
                            </div>
                          )}

                          {/* Clip Body Title & Speed */}
                          <div className="flex items-center justify-between text-[11px] font-semibold text-white truncate gap-1 pointer-events-none pl-1 pr-1">
                            <span className="truncate">{clip.name}</span>
                            {clip.speed !== 1 && (
                              <span className="text-[9px] bg-black/50 px-1 rounded text-white/90 font-mono">
                                {clip.speed}x
                              </span>
                            )}
                          </div>

                          {/* Clip Timecode Footer */}
                          <div className="text-[10px] font-mono text-white/80 flex items-center justify-between pointer-events-none pl-1 pr-1">
                            <span>{clip.start.toFixed(1)}s</span>
                            <span>{clip.dur.toFixed(1)}s</span>
                          </div>

                          {/* Right Trim Handle */}
                          {editable && (
                            <div
                              onMouseDown={(e) => handleStartClipDrag(e, clip, 'trim-right')}
                              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Trim Out-point (Drag to adjust duration)"
                            >
                              <div className="w-0.5 h-4 bg-white/70 rounded"></div>
                            </div>
                          )}
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

      {/* Selected Clip Inspector */}
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

            <div className="flex items-center space-x-2">
              {editable && (
                <>
                  <button
                    type="button"
                    onClick={handleDuplicateSelectedClip}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition"
                  >
                    Duplicate (Ctrl+D)
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelectedClip}
                    className="px-2.5 py-1 bg-red-900/50 hover:bg-red-800 text-red-300 rounded border border-red-700/60 transition"
                  >
                    Delete Clip
                  </button>
                </>
              )}
            </div>
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
