'use client';

import { useState } from 'react';
import type { Citation } from '@/types';

interface TimelineProps {
  citations: Citation[];
}

interface TimelineEvent {
  date: string;
  dateObj: Date;
  meeting_id: string;
  meeting_type: string;
  attendees: string[];
  text_excerpt: string;
  relevance_score: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function Timeline({ citations }: TimelineProps) {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  // Convert citations to timeline events and sort by date
  const events: TimelineEvent[] = citations
    .map((c) => ({
      date: c.date,
      dateObj: new Date(c.date),
      meeting_id: c.meeting_id,
      meeting_type: c.meeting_type,
      attendees: c.attendees,
      text_excerpt: c.text_excerpt,
      relevance_score: c.relevance_score,
    }))
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  if (events.length === 0) {
    return null;
  }

  // Group events by year for better visualization
  const eventsByYear: Record<string, TimelineEvent[]> = {};
  events.forEach((event) => {
    const year = event.dateObj.getFullYear().toString();
    if (!eventsByYear[year]) {
      eventsByYear[year] = [];
    }
    eventsByYear[year].push(event);
  });

  const years = Object.keys(eventsByYear).sort();
  const minYear = parseInt(years[0]);
  const maxYear = parseInt(years[years.length - 1]);
  const yearSpan = maxYear - minYear + 1;

  return (
    <div className="mt-4 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
      <h4 className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
        <svg
          className="w-4 h-4 text-emerald-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        Timeline ({events.length} meetings from {minYear} to {maxYear})
      </h4>

      {/* Year markers */}
      {yearSpan <= 10 && (
        <div className="flex justify-between text-xs text-slate-500 mb-2 px-1">
          {years.map((year) => (
            <span key={year}>{year}</span>
          ))}
        </div>
      )}

      {/* Timeline bar */}
      <div className="relative h-2 bg-slate-700 rounded-full mb-4">
        {events.map((event, idx) => {
          const position =
            yearSpan === 1
              ? ((idx + 1) / (events.length + 1)) * 100
              : ((event.dateObj.getFullYear() - minYear) / Math.max(yearSpan - 1, 1)) * 100;

          return (
            <button
              key={`${event.meeting_id}-${idx}`}
              className={`absolute w-3 h-3 rounded-full -top-0.5 transform -translate-x-1/2 transition-all hover:scale-150 ${
                expandedEvent === `${event.meeting_id}-${idx}`
                  ? 'bg-emerald-400 scale-150'
                  : 'bg-emerald-500 hover:bg-emerald-400'
              }`}
              style={{ left: `${Math.min(Math.max(position, 2), 98)}%` }}
              onClick={() =>
                setExpandedEvent(
                  expandedEvent === `${event.meeting_id}-${idx}`
                    ? null
                    : `${event.meeting_id}-${idx}`
                )
              }
              title={`${formatDate(event.date)} - ${event.meeting_type}`}
            />
          );
        })}
      </div>

      {/* Event list */}
      <div className="space-y-2">
        {events.map((event, idx) => {
          const isExpanded = expandedEvent === `${event.meeting_id}-${idx}`;

          return (
            <div
              key={`${event.meeting_id}-${idx}`}
              className={`border-l-2 pl-3 py-1 transition-all ${
                isExpanded
                  ? 'border-emerald-500 bg-slate-700/50 rounded-r-lg pr-3'
                  : 'border-slate-600'
              }`}
            >
              <button
                className="w-full text-left"
                onClick={() =>
                  setExpandedEvent(isExpanded ? null : `${event.meeting_id}-${idx}`)
                }
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 text-sm font-medium">
                      {formatDate(event.date)}
                    </span>
                    <span className="text-slate-400 text-xs capitalize">
                      {event.meeting_type}
                    </span>
                  </div>
                  <span className="text-slate-500 text-xs">
                    {(event.relevance_score * 100).toFixed(0)}% match
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="mt-2 text-sm">
                  {event.attendees.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {event.attendees.slice(0, 6).map((attendee, i) => (
                        <span
                          key={i}
                          className="bg-slate-600 text-slate-300 text-xs px-2 py-0.5 rounded"
                        >
                          {attendee}
                        </span>
                      ))}
                      {event.attendees.length > 6 && (
                        <span className="text-slate-400 text-xs py-0.5">
                          +{event.attendees.length - 6} more
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-slate-300 text-xs leading-relaxed bg-slate-800 rounded p-2">
                    {event.text_excerpt}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
