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
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <Link href="/" className="flex items-center space-x-2 text-white font-bold text-lg hover:text-indigo-400 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M4 4h10v4H4V4zm0 6h16v4H4v-4zm0 6h12v4H4v-4z" />
              </svg>
            </div>
            <span>video-vc</span>
          </Link>

          {projectName && (
            <div className="flex items-center space-x-2 text-sm text-slate-400">
              <span>/</span>
              <span className="text-slate-200 font-medium truncate max-w-[200px] sm:max-w-xs">{projectName}</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {/* Role badge */}
          {role && (
            <div className="flex items-center">
              {role === 'Lead editor' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-950/80 text-purple-300 border border-purple-500/50 shadow-sm shadow-purple-900/20">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  Lead editor
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 shadow-sm shadow-emerald-900/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
                  title="Open this project in Collaborator mode"
                >
                  View as Collaborator &rarr;
                </Link>
              ) : (
                <Link
                  href={`/lead/${projectId}`}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
                  title="Open this project in Lead Editor mode"
                >
                  View as Lead Editor &rarr;
                </Link>
              )}
            </div>
          )}

          {/* Broadcast channel status */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800/60 px-2 py-1 rounded border border-slate-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>channel: &apos;video-vc&apos;</span>
          </div>
        </div>
      </div>
    </header>
  );
}
