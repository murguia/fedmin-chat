'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface MeetingData {
  meeting_id: string;
  date: string;
  meeting_type: string;
  attendees: string[];
  text: string;
}

export default function MeetingReader({
  meetingId,
  date,
  meetingType,
  onClose,
}: {
  meetingId: string;
  date: string;
  meetingType: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<MeetingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/meeting/${encodeURIComponent(meetingId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Could not load this meeting.');
        }
        return res.json();
      })
      .then((d: MeetingData) => {
        if (active) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [meetingId]);

  const pdfUrl = `https://files.crisesnotes.com/${meetingId.replace(
    '.txt',
    '.pdf'
  )}?ref=fedmin-chat`;

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-[101] flex items-start justify-center min-h-full p-4 pt-16 pointer-events-none">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-xl mb-8 pointer-events-auto">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                {date}{' '}
                <span className="capitalize font-normal text-slate-400 text-base">
                  · {meetingType}
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{meetingId}</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors shrink-0"
              aria-label="Close"
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
          </div>

          {data && data.attendees.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {data.attendees.slice(0, 12).map((a, i) => (
                <span
                  key={i}
                  className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded"
                >
                  {a}
                </span>
              ))}
              {data.attendees.length > 12 && (
                <span className="text-slate-400 text-xs py-0.5">
                  +{data.attendees.length - 12} more
                </span>
              )}
            </div>
          )}

          <div className="max-h-[60vh] overflow-y-auto bg-slate-900/50 rounded p-4 text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
            {loading && <span className="text-slate-500">Loading full meeting…</span>}
            {error && <span className="text-slate-400">{error}</span>}
            {data && data.text}
          </div>

          <div className="mt-3">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-emerald-400 transition-colors"
            >
              View original PDF →
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
