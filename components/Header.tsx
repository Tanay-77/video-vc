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
    <header className="border-b border-[#222226] bg-[#000000] sticky top-0 z-50 px-4 py-2.5 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <Link href="/" className="flex items-center space-x-2 text-[#ffffff] font-bold text-base hover:text-white transition-colors">
            <div className="w-7 h-7 rounded-lg bg-[#121214] border border-[#222226] flex items-center justify-center text-[#ffffff]">
              <svg className="w-3.5 h-3.5 fill-current text-[#ffffff]" viewBox="0 0 24 24">
                <path d="M4 4h10v4H4V4zm0 6h16v4H4v-4zm0 6h12v4H4v-4z" />
              </svg>
            </div>
            <span className="tracking-tight font-semibold">video-vc</span>
          </Link>

          {projectName && (
            <div className="flex items-center space-x-2 text-xs text-[#8e8e93]">
              <span className="text-[#2c2c30]">/</span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#121214] border border-[#222226] rounded-full">
                <span className="text-[#ffffff] font-medium truncate max-w-[200px] sm:max-w-xs">{projectName}</span>
                <span className="text-[10px] text-[#8e8e93] font-mono">1080P · 25 FPS</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2.5">
          {/* Neutral role badge */}
          {role && (
            <div className="flex items-center">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#1c1c20] text-[#8e8e93] border border-[#222226]">
                {role === 'Lead editor' ? 'Lead' : 'Collaborator'}
              </span>
            </div>
          )}

          {/* Quick toggle view */}
          {projectId && role && (
            <div className="flex items-center space-x-2 text-xs">
              {role === 'Lead editor' ? (
                <Link
                  href={`/join/${projectId}`}
                  className="px-3 py-1 rounded-full bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] transition-colors border border-[#222226]"
                  title="Open this project in Collaborator mode"
                >
                  View as Collaborator &rarr;
                </Link>
              ) : (
                <Link
                  href={`/lead/${projectId}`}
                  className="px-3 py-1 rounded-full bg-transparent hover:bg-[#1a1a1e] text-[#8e8e93] hover:text-[#ffffff] transition-colors border border-[#222226]"
                  title="Open this project in Lead Editor mode"
                >
                  View as Lead Editor &rarr;
                </Link>
              )}
            </div>
          )}

          {/* Broadcast channel status */}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-[#8e8e93] bg-[#121214] px-2.5 py-1 rounded-full border border-[#222226]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8e8e93]"></span>
            <span>channel: &apos;video-vc&apos;</span>
          </div>
        </div>
      </div>
    </header>
  );
}
