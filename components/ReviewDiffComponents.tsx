'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Copy } from 'lucide-react';
import { DiffResult, ClipDiffItem, renderGitText } from '../lib/diff';

interface ChangeCardsProps {
  diffResult: DiffResult;
}

export function ChangeCards({ diffResult }: ChangeCardsProps) {
  const changedItems = diffResult.items.filter((item) => item.status !== 'unchanged');

  if (changedItems.length === 0) {
    return (
      <div className="p-6 bg-[#131317] border border-[#22222a] rounded-xl text-center text-xs text-zinc-400 italic">
        No differences between the base cut and this variation.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {changedItems.map((item, idx) => {
        let title = '';
        let detail = '';
        let track = '';
        let timeRange = '';
        let badgeColor = '';
        let cardBg = '';
        let icon = '';

        if (item.status === 'added' && item.after) {
          title = `Added clip "${item.name}"`;
          detail = `New clip added to cut (${item.after.dur.toFixed(1)}s)`;
          track = item.after.track;
          timeRange = `${item.after.start.toFixed(1)}s &ndash; ${(item.after.start + item.after.dur).toFixed(1)}s`;
          badgeColor = 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60';
          cardBg = 'bg-emerald-950/20 border-emerald-800/40 hover:border-emerald-600/70';
          icon = '+ ADD';
        } else if (item.status === 'removed' && item.before) {
          title = `Removed clip "${item.name}"`;
          detail = `Deleted clip previously running for ${item.before.dur.toFixed(1)}s`;
          track = item.before.track;
          timeRange = `at ${item.before.start.toFixed(1)}s`;
          badgeColor = 'bg-rose-950/80 text-rose-300 border-rose-700/60';
          cardBg = 'bg-rose-950/20 border-rose-800/40 hover:border-rose-600/70';
          icon = '- DEL';
        } else if (item.status === 'modified' && item.before && item.after) {
          const isTrimmed = item.flags.includes('trimmed');
          const isMoved = item.flags.includes('moved');
          const isRetimed = item.flags.includes('retimed');

          if (isTrimmed) {
            const diffDur = item.before.dur - item.after.dur;
            if (diffDur > 0) {
              title = `Trimmed clip "${item.name}"`;
              detail = `Shortened by ${diffDur.toFixed(1)}s (from ${item.before.dur.toFixed(1)}s down to ${item.after.dur.toFixed(1)}s)`;
            } else {
              title = `Extended clip "${item.name}"`;
              detail = `Lengthened by ${Math.abs(diffDur).toFixed(1)}s (from ${item.before.dur.toFixed(1)}s up to ${item.after.dur.toFixed(1)}s)`;
            }
          } else if (isMoved) {
            title = `Moved clip "${item.name}"`;
            detail = `Repositioned start time from ${item.before.start.toFixed(1)}s to ${item.after.start.toFixed(1)}s`;
          } else if (isRetimed) {
            title = `Retimed clip "${item.name}"`;
            detail = `Changed playback speed from ${item.before.speed}x to ${item.after.speed}x`;
          } else {
            title = `Modified clip "${item.name}"`;
            detail = `Updated clip attributes on track ${item.after.track}`;
          }

          track = item.after.track;
          timeRange = `${item.after.start.toFixed(1)}s &ndash; ${(item.after.start + item.after.dur).toFixed(1)}s`;
          badgeColor = 'bg-amber-950/80 text-amber-300 border-amber-700/60';
          cardBg = 'bg-amber-950/20 border-amber-800/40 hover:border-amber-600/70';
          icon = '~ MOD';
        }

        return (
          <div
            key={`change-${idx}`}
            className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${cardBg}`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${badgeColor}`}>
                  {icon}
                </span>
                <h4 className="font-semibold text-zinc-100 text-xs sm:text-sm">
                  {title}
                </h4>
              </div>
              <p className="text-xs text-zinc-400 pl-7">
                {detail}
              </p>
            </div>

            <div className="shrink-0 pl-7 sm:pl-0">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-[#18181f] border border-[#2a2a36] text-zinc-300"
                dangerouslySetInnerHTML={{ __html: `Track ${track} &bull; ${timeRange}` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface GitTextPanelProps {
  diffResult: DiffResult;
}

export function GitTextPanel({ diffResult }: GitTextPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const gitText = renderGitText(diffResult);

  const handleCopy = () => {
    if (!gitText) return;
    navigator.clipboard.writeText(gitText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#131317] border border-[#22222a] rounded-2xl overflow-hidden shadow-sm text-xs">
      {/* Header bar / Toggle */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 bg-[#18181f] hover:bg-[#202028] cursor-pointer flex items-center justify-between transition border-b border-[#242430]"
      >
        <div className="flex items-center space-x-2">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
          <span className="font-semibold text-zinc-200">Git Text Diff (renderGitText)</span>
          <span className="text-[11px] font-mono text-zinc-500">
            ({diffResult.addedCount > 0 ? `+${diffResult.addedCount} ` : ''}
            {diffResult.modifiedCount > 0 ? `~${diffResult.modifiedCount} ` : ''}
            {diffResult.removedCount > 0 ? `-${diffResult.removedCount}` : ''})
          </span>
        </div>

        {isOpen && gitText && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="px-2.5 py-1 bg-[#22222c] hover:bg-[#2c2c38] text-zinc-200 rounded-lg text-[11px] font-mono border border-[#323242] transition flex items-center gap-1"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy Diff'}</span>
          </button>
        )}
      </div>

      {/* Collapsible content */}
      {isOpen && (
        <div className="p-4 bg-[#0d0d10] font-mono text-[11px] overflow-x-auto max-h-80 leading-relaxed">
          {gitText ? (
            <pre className="text-zinc-200 whitespace-pre">
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
                        ? 'text-rose-400 bg-rose-950/40 -mx-2 px-2'
                        : isPlus
                        ? 'text-emerald-400 bg-emerald-950/40 -mx-2 px-2'
                        : 'text-zinc-400'
                    }
                  >
                    {line}
                  </div>
                );
              })}
            </pre>
          ) : (
            <div className="text-zinc-500 text-center py-4 italic">
              Empty diff (clean match, no changes detected).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
