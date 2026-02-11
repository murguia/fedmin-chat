// TypeScript interfaces for fedmin-chat

export interface ChunkMetadata {
  text: string;
  meeting_id: string;
  date: string;
  meeting_type: string;
  attendees: string;
  topics: string;
  decisions_summary: string;
  chunk_index: number;
  total_chunks: number;
  [key: string]: string | number | boolean | string[];
}

export interface MeetingData {
  filename: string;
  date: string;
  meeting_type?: string;
  attendees?: string[];
  topics?: { title: string; content: string }[];
  decisions_summary?: string;
  content: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: Date;
}

export interface Citation {
  meeting_id: string;
  date: string;
  meeting_type: string;
  attendees: string[];
  relevance_score: number;
  text_excerpt: string;
}

export interface ChatRequest {
  query: string;
}

export interface ChatResponse {
  response: string;
  citations: Citation[];
}

export interface PineconeMatch {
  id: string;
  score: number;
  metadata: ChunkMetadata;
}
