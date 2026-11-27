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
      <div className="p-6 bg-[#121214] border border-[#222226] rounded-xl text-center text-xs text-[#8e8e93] italic">
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
        let icon = '';

        if (item.status === 'added' && item.after) {
          title = `Added clip "${item.name}"`;
          detail = `New clip added to cut (${item.after.dur.toFixed(1)}s)`;
          track = item.after.track;
          timeRange = `${item.after.start.toFixed(1)}s &ndash; ${(item.after.start + item.after.dur).toFixed(1)}s`;
          badgeColor = 'bg-[#4aa56b]/12 text-[#4aa56b]';
          icon = '+ ADD';
        } else if (item.status === 'removed' && item.before) {
          title = `Removed clip "${item.name}"`;
          detail = `Deleted clip previously running for ${item.before.dur.toFixed(1)}s`;
          track = item.before.track;
          timeRange = `at ${item.before.start.toFixed(1)}s`;
          badgeColor = 'bg-[#c9605f]/12 text-[#c9605f]';
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
          badgeColor = isRetimed ? 'bg-[#8b7fc7]/12 text-[#8b7fc7]' : 'bg-[#c9973a]/12 text-[#c9973a]';
          icon = '~ MOD';
        }

        return (
          <div
            key={`change-${idx}`}
            className="p-3.5 rounded-xl border border-[#222226] bg-[#121214] hover:border-[#2c2c30] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded uppercase shrink-0 ${badgeColor}`}>
                  {icon}
                </span>
                <h4 className="font-semibold text-[#ffffff] text-xs sm:text-sm">
                  {title}
                </h4>
              </div>
              <p className="text-xs text-[#8e8e93] pl-7">
                {detail}
              </p>
            </div>

            <div className="shrink-0 pl-7 sm:pl-0">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-[#1c1c20] border border-[#222226] text-[#8e8e93]"
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
    <div className="bg-[#121214] border border-[#222226] rounded-2xl overflow-hidden shadow-sm text-xs">
      {/* Header bar / Toggle */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 bg-[#121214] hover:bg-[#1a1a1e] cursor-pointer flex items-center justify-between transition border-b border-[#222226]"
      >
        <div className="flex items-center space-x-2">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-[#8e8e93]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#8e8e93]" />}
          <span className="font-semibold text-[#ffffff]">Git Text Diff (renderGitText)</span>
          <span className="text-[11px] font-mono text-[#8e8e93]">
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
            className="px-2.5 py-1 bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] rounded-lg text-[11px] font-mono border border-[#222226] transition flex items-center gap-1"
          >
            {copied ? <Check className="w-3 h-3 text-[#4aa56b]" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy Diff'}</span>
          </button>
        )}
      </div>

      {/* Collapsible content */}
      {isOpen && (
        <div className="p-4 bg-[#000000] font-mono text-[11px] overflow-x-auto max-h-80 leading-relaxed">
          {gitText ? (
            <pre className="text-[#ffffff] whitespace-pre">
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
                        ? 'text-[#c9605f] bg-[#c9605f]/12 -mx-2 px-2'
                        : isPlus
                        ? 'text-[#4aa56b] bg-[#4aa56b]/12 -mx-2 px-2'
                        : 'text-[#8e8e93]'
                    }
                  >
                    {line}
                  </div>
                );
              })}
            </pre>
          ) : (
            <div className="text-[#8e8e93] text-center py-4 italic">
              Empty diff (clean match, no changes detected).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
