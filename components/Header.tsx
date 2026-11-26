'use client';

import React from 'react';
import Link from 'next/link';

interface HeaderProps {
  projectId?: string;
  projectName?: string;
  role?: 'Lead editor' | 'Collaborator';
}

export function Header({ projectId, projectName, role }: HeaderProps) {
  return (
    <header className="border-b border-[#202028] bg-[#0e0e12]/95 backdrop-blur-md sticky top-0 z-50 px-4 py-2.5 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <Link href="/" className="flex items-center space-x-2 text-white font-bold text-base hover:text-white/80 transition-colors">
            <div className="w-7 h-7 rounded-lg bg-[#202028] border border-[#32323c] flex items-center justify-center text-white shadow-sm">
              <svg className="w-3.5 h-3.5 fill-current text-white" viewBox="0 0 24 24">
                <path d="M4 4h10v4H4V4zm0 6h16v4H4v-4zm0 6h12v4H4v-4z" />
              </svg>
            </div>
            <span className="tracking-tight font-semibold">video-vc</span>
          </Link>

          {projectName && (
            <div className="flex items-center space-x-2 text-xs text-zinc-400">
              <span className="text-zinc-600">/</span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#16161c] border border-[#262630] rounded-full">
                <span className="text-zinc-100 font-medium truncate max-w-[200px] sm:max-w-xs">{projectName}</span>
                <span className="text-[10px] text-zinc-500 font-mono">1080P · 25 FPS</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2.5">
          {/* Role badge */}
          {role && (
            <div className="flex items-center">
              {role === 'Lead editor' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium bg-[#5856d6]/15 text-[#a5a3ff] border border-[#5856d6]/40 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5856d6] animate-pulse" />
                  Lead editor
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium bg-[#34c759]/15 text-[#85e89d] border border-[#34c759]/40 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" />
                  Collaborator
                </span>
              )}
            </div>
          )}

          {/* Quick toggle view */}
          {projectId && role && (
            <div className="flex items-center space-x-2 text-xs">
              {role === 'Lead editor' ? (
                <Link
                  href={`/join/${projectId}`}
                  className="px-3 py-1 rounded-full bg-[#1a1a20] hover:bg-[#25252c] text-zinc-300 hover:text-white transition-colors border border-[#2a2a34]"
                  title="Open this project in Collaborator mode"
                >
                  View as Collaborator &rarr;
                </Link>
              ) : (
                <Link
                  href={`/lead/${projectId}`}
                  className="px-3 py-1 rounded-full bg-[#1a1a20] hover:bg-[#25252c] text-zinc-300 hover:text-white transition-colors border border-[#2a2a34]"
                  title="Open this project in Lead Editor mode"
                >
                  View as Lead Editor &rarr;
                </Link>
              )}
            </div>
          )}

          {/* Broadcast channel status */}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 bg-[#16161c] px-2.5 py-1 rounded-full border border-[#262630]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34c759]"></span>
            <span>channel: &apos;video-vc&apos;</span>
          </div>
        </div>
      </div>
    </header>
  );
}

