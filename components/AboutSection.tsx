'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

function AboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-[101] flex items-start justify-center min-h-full p-4 pt-24 pointer-events-none">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-xl mb-8 pointer-events-auto">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <h2 className="text-lg font-semibold text-slate-100 mb-4">
            How Fed Minutes Chat Works
          </h2>

          <div className="space-y-4 text-sm text-slate-300">
            <p>
              This app lets you explore Federal Reserve meeting minutes from
              1967&ndash;1973 using natural language. Instead of keyword search, it
              uses <span className="text-emerald-400">semantic search</span> to
              find passages by meaning.
            </p>

            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="bg-emerald-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <p>
                  Your question is converted into a vector embedding that
                  captures its semantic meaning.
                </p>
              </div>
              <div className="flex gap-3">
                <span className="bg-emerald-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <p>
                  The embedding is matched against 61,000+ document chunks
                  in a vector database to find the most relevant meeting excerpts.
                </p>
              </div>
              <div className="flex gap-3">
                <span className="bg-emerald-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <p>
                  GPT-4o synthesizes an answer grounded in those excerpts,
                  with citations you can verify.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-slate-200 font-medium mb-2">Why this era?</h3>
              <p>
                1967&ndash;1973 covers the collapse of Bretton Woods, the Nixon
                Shock of August 1971, rising inflation, and the shift from fixed
                to floating exchange rates &mdash; one of the most consequential
                periods in modern monetary policy.
              </p>
            </div>

            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-slate-200 font-medium mb-2">Data source</h3>
              <p>
                Approximately 30,000 pages of meeting minutes obtained via FOIA
                by{' '}
                <a
                  href="https://www.crisesnotes.com/database/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline"
                >
                  Crisis Notes / Nathan Tankus
                </a>
                .
              </p>
            </div>

            <p className="text-slate-500 text-xs pt-2">
              Responses are AI-generated from historical documents and may
              contain errors. Always verify against primary sources.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function AboutSection() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-slate-400 hover:text-emerald-400 transition-colors text-sm flex items-center gap-1"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        How it works
      </button>

      {isOpen && <AboutModal onClose={() => setIsOpen(false)} />}
    </>
  );
}
