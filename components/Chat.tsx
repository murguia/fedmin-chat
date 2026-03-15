'use client';

import { useState, useRef, useEffect } from 'react';
import type { Message, Citation, ChatResponse } from '@/types';
import Timeline from './Timeline';

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function CitationCard({
  citation,
  index,
  isExpanded,
  onToggle,
}: {
  citation: Citation;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(citation.text_excerpt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="bg-emerald-600 text-white text-xs font-medium px-2 py-1 rounded">
            [{index + 1}]
          </span>
          <span className="text-slate-200 font-medium">{citation.date}</span>
          <span className="text-slate-400 text-sm capitalize">
            {citation.meeting_type}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 text-sm">
            {(citation.relevance_score * 100).toFixed(0)}% match
          </span>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-700">
          <div className="mt-3 flex flex-wrap gap-2 mb-3">
            {citation.attendees.slice(0, 5).map((attendee, i) => (
              <span
                key={i}
                className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded"
              >
                {attendee}
              </span>
            ))}
            {citation.attendees.length > 5 && (
              <span className="text-slate-400 text-xs py-1">
                +{citation.attendees.length - 5} more
              </span>
            )}
          </div>
          <div className="bg-slate-900/50 rounded p-3 text-sm text-slate-300 font-mono leading-relaxed">
            {citation.text_excerpt}
          </div>
          <button
            onClick={handleCopy}
            className="mt-2 text-xs text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1"
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
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            {copied ? 'Copied!' : 'Copy excerpt'}
          </button>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const [expandedCitations, setExpandedCitations] = useState<Set<number>>(
    new Set()
  );
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

  const toggleCitation = (index: number) => {
    setExpandedCitations((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-2xl rounded-br-md max-w-[80%]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="bg-slate-800 text-slate-100 px-5 py-4 rounded-2xl rounded-bl-md max-w-[90%]">
        <div className="prose prose-invert prose-sm max-w-none">
          {message.content.split('\n').map((line, i) => (
            <p key={i} className={line === '' ? 'h-4' : 'mb-2'}>
              {line}
            </p>
          ))}
        </div>
      </div>

      {message.citations && message.citations.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-slate-400 text-sm font-medium">
              Sources ({message.citations.length})
            </p>
            <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  List
                </span>
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  viewMode === 'timeline'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Timeline
                </span>
              </button>
            </div>
          </div>

          {viewMode === 'list' ? (
            <div className="space-y-2">
              {message.citations.map((citation, i) => (
                <CitationCard
                  key={i}
                  citation={citation}
                  index={i}
                  isExpanded={expandedCitations.has(i)}
                  onToggle={() => toggleCitation(i)}
                />
              ))}
            </div>
          ) : (
            <Timeline citations={message.citations} />
          )}
        </div>
      )}
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex items-center gap-2 text-slate-400 mb-4">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
        <span
          className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
          style={{ animationDelay: '0.1s' }}
        />
        <span
          className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"
          style={{ animationDelay: '0.2s' }}
        />
      </div>
      <span className="text-sm">Searching Fed minutes...</span>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.content }),
      });

      if (response.status === 429) {
        throw new Error('Too many requests. Please wait a moment and try again.');
      }

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data: ChatResponse = await response.json();

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: data.response,
        citations: data.citations,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content:
          err instanceof Error && err.message.includes('Too many requests')
            ? err.message
            : 'Sorry, the AI service is temporarily unavailable. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const sampleQuestions = [
    'How did the Fed respond to the Nixon Shock in August 1971?',
    'What were concerns about inflation in 1972?',
    'Who attended the emergency meetings in 1971?',
    'What decisions were made about interest rates in 1970?',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-4xl mx-auto">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-2xl font-semibold text-slate-200 mb-4">
              Ask about Fed Minutes (1967-1973)
            </h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto">
              Explore Federal Reserve meeting minutes from a pivotal era in
              monetary policy history. Ask about policy decisions, economic
              conditions, or specific events.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
              {sampleQuestions.map((question, i) => (
                <button
                  key={i}
                  onClick={() => setInput(question)}
                  className="text-left px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-sm transition-colors border border-slate-700"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isLoading && <LoadingIndicator />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-700 p-4 bg-slate-900/50"
      >
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about Federal Reserve policy decisions..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            disabled={isLoading}
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
