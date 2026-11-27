'use client';

import React, { useState, useMemo } from 'react';
import { Snapshot } from '@/lib/types';
import { DiffViewer } from './DiffViewer';
import { History, Copy, GitBranch, ChevronDown, ChevronUp, Check, ArrowRight } from 'lucide-react';

interface SnapshotHistoryPanelProps {
  snapshots: Snapshot[];
  readOnly?: boolean;
  activeVariationBaseSnapshotId?: string;
  onBranchFromHere?: (snapshotId: string) => void;
}

export function SnapshotHistoryPanel({
  snapshots,
  readOnly = false,
  activeVariationBaseSnapshotId,
  onBranchFromHere,
}: SnapshotHistoryPanelProps) {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [customCompareId, setCustomCompareId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Newest snapshot in chronological array is the last item
  const latestSnapshotId = snapshots.length > 0 ? snapshots[snapshots.length - 1].id : null;

  // Selected snapshot object and its chronological index
  const selectedSnapshot = useMemo(() => {
    if (!selectedSnapshotId) return null;
    return snapshots.find((s) => s.id === selectedSnapshotId) || null;
  }, [snapshots, selectedSnapshotId]);

  const selectedIndex = useMemo(() => {
    if (!selectedSnapshot) return -1;
    return snapshots.findIndex((s) => s.id === selectedSnapshot.id);
  }, [snapshots, selectedSnapshot]);

  // Default snapshot right before the selected one
  const defaultPreviousSnapshot = useMemo(() => {
    if (selectedIndex <= 0) return null;
    return snapshots[selectedIndex - 1];
  }, [snapshots, selectedIndex]);

  // Comparison snapshot chosen by user or defaulted to previous
  const compareSnapshot = useMemo(() => {
    if (!selectedSnapshot) return null;
    if (customCompareId) {
      const found = snapshots.find((s) => s.id === customCompareId && s.id !== selectedSnapshot.id);
      if (found) return found;
    }
    return defaultPreviousSnapshot;
  }, [snapshots, selectedSnapshot, customCompareId, defaultPreviousSnapshot]);

  const handleRowClick = (snapId: string) => {
    if (selectedSnapshotId === snapId) {
      // Toggle off if already selected
      setSelectedSnapshotId(null);
      setCustomCompareId(null);
    } else {
      setSelectedSnapshotId(snapId);
      setCustomCompareId(null); // Reset custom compare to default previous
    }
  };

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <section className="bg-[#121214] border border-[#222226] rounded-2xl p-5 space-y-4">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#222226]">
        <div>
          <h2 className="text-base font-bold text-[#ffffff] flex items-center gap-2">
            <History className="w-4 h-4 text-[#8e8e93]" />
            <span>Snapshots History</span>
            <span className="text-xs bg-[#1c1c20] text-[#8e8e93] border border-[#222226] px-2.5 py-0.5 rounded-full font-mono">
              {snapshots.length}
            </span>
          </h2>
          <p className="text-xs text-[#8e8e93] mt-0.5">
            Click any snapshot row to inspect its diff against the previous version or compare with other checkpoints.
          </p>
        </div>
        <span className="text-xs text-[#8e8e93] font-mono hidden sm:inline-block">
          {readOnly ? 'Read-only log' : 'Immutable Checkpoints'}
        </span>
      </div>

      {/* Snapshots List (Newest first) */}
      <div className="space-y-3">
        {[...snapshots].reverse().map((snap) => {
          const isLatest = snap.id === latestSnapshotId;
          const isSelected = snap.id === selectedSnapshotId;
          const isCurrentBase = activeVariationBaseSnapshotId && activeVariationBaseSnapshotId === snap.id;

          return (
            <div
              key={snap.id}
              className={`rounded-xl border transition-all duration-150 overflow-hidden ${
                isSelected
                  ? 'border-[#5b8def] bg-[#161820]'
                  : 'border-[#222226] bg-[#121214] hover:border-[#2c2c30]'
              }`}
            >
              {/* Clickable Snapshot Summary Row */}
              <div
                onClick={() => handleRowClick(snap.id)}
                className="group p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isSelected || isLatest ? 'bg-[#5b8def]' : 'bg-[#8e8e93]'
                      }`}
                    />
                    <span className="font-semibold text-[#ffffff] text-xs sm:text-sm truncate">
                      {snap.message}
                    </span>

                    {/* Latest Badge */}
                    {isLatest && (
                      <span className="text-[10px] bg-[#1c1c20] text-[#8e8e93] border border-[#222226] px-2 py-0.5 rounded-full font-mono font-medium">
                        Latest
                      </span>
                    )}

                    {/* Base Snapshot Badge for Collaborator */}
                    {isCurrentBase && (
                      <span className="text-[10px] bg-[#1c1c20] text-[#8e8e93] border border-[#222226] px-2 py-0.5 rounded-full font-mono font-medium">
                        Base Snapshot
                      </span>
                    )}
                  </div>

                  {/* Metadata Row: Author, Time, Clip Count, and Copy ID */}
                  <div className="text-[11px] text-[#8e8e93] flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>by <strong className="text-[#ffffff]">{snap.author}</strong></span>
                    <span>&bull;</span>
                    <span>{new Date(snap.createdAt).toLocaleTimeString()}</span>
                    <span>&bull;</span>
                    <span className="font-mono text-[#8e8e93]">
                      {snap.timeline.clips.length} clip{snap.timeline.clips.length !== 1 ? 's' : ''}
                    </span>
                    <span>&bull;</span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyId(e, snap.id)}
                      title={`Snapshot ID: ${snap.id} (Click to copy)`}
                      className="inline-flex items-center gap-1 p-1 hover:text-[#ffffff] text-[#8e8e93] transition rounded"
                    >
                      {copiedId === snap.id ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#4aa56b] font-mono">
                          <Check className="w-3 h-3" />
                          <span>Copied</span>
                        </span>
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                  {/* Branch from here button for Collaborator */}
                  {onBranchFromHere && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBranchFromHere(snap.id);
                      }}
                      className={`px-3 py-1.5 bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] text-xs font-medium rounded-full border border-[#222226] transition flex items-center gap-1.5 ${
                        isCurrentBase ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title={`Create a variation from snapshot "${snap.message}"`}
                    >
                      <GitBranch className="w-3 h-3 text-[#8e8e93]" />
                      <span>Branch from here &rarr;</span>
                    </button>
                  )}

                  {/* Toggle Indicator */}
                  <div className="p-1 text-[#8e8e93] group-hover:text-[#ffffff] transition">
                    {isSelected ? (
                      <ChevronUp className="w-4 h-4 text-[#5b8def]" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Diff Section when Row is Selected */}
              {isSelected && (
                <div className="border-t border-[#222226] bg-[#000000] p-4 space-y-3">
                  {selectedIndex === 0 ? (
                    /* First snapshot notice */
                    <div className="p-4 bg-[#121214] border border-[#222226] rounded-xl text-center text-xs text-[#8e8e93] font-medium">
                      Initial snapshot, no earlier version
                    </div>
                  ) : (
                    /* Diff controls & DiffViewer */
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[#222226]">
                        <div className="text-xs text-[#8e8e93]">
                          Showing changes in <strong className="text-[#ffffff]">&ldquo;{snap.message}&rdquo;</strong> compared to:
                        </div>

                        {/* "Compare with..." Dropdown */}
                        <div className="flex items-center gap-2 text-xs">
                          <label htmlFor={`compare-select-${snap.id}`} className="text-[#8e8e93] text-xs shrink-0 font-medium">
                            Compare with:
                          </label>
                          <select
                            id={`compare-select-${snap.id}`}
                            value={compareSnapshot?.id || ''}
                            onChange={(e) => setCustomCompareId(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#121214] border border-[#222226] text-[#ffffff] text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#5b8def] transition cursor-pointer"
                          >
                            {[...snapshots]
                              .filter((s) => s.id !== snap.id)
                              .reverse()
                              .map((other) => {
                                const isPrev = defaultPreviousSnapshot && other.id === defaultPreviousSnapshot.id;
                                return (
                                  <option key={other.id} value={other.id}>
                                    {other.message} {isPrev ? ' (Previous snapshot)' : ''}
                                  </option>
                                );
                              })}
                          </select>
                        </div>
                      </div>

                      {compareSnapshot && (
                        <DiffViewer
                          baseTimeline={compareSnapshot.timeline}
                          variationTimeline={snap.timeline}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
