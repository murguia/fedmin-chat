import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import {
  SystemMessage,
  HumanMessage,
  isAIMessage,
  isToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { tools } from './tools';
import type { PineconeMatch } from '@/types';

// Max tool-calling turns before the agent is forced to answer with what it has.
const MAX_TOOL_TURNS = 4;

const AGENT_SYSTEM_PROMPT = `You are a research assistant exploring Federal Reserve Board
meeting minutes from 1967-1973. You answer questions by searching the minutes with the
tools provided.

Historical context: this period covers the collapse of Bretton Woods, the Nixon Shock
(Aug 1971), rising inflation, and the shift from fixed to floating exchange rates.

HOW TO RESEARCH:
- Always search before answering. Never answer from prior knowledge.
- Issue multiple searches when a question spans several topics, people, or time periods,
  or when the first results are thin.
- Use search_within_meeting to drill into a specific meeting you found relevant.

GROUNDING RULES:
- Base every claim ONLY on returned excerpts. Do NOT infer facts, names, or decisions
  that are not explicitly stated in them.
- If the excerpts don't contain enough information to answer, say so clearly.

WHEN YOU HAVE ENOUGH EVIDENCE, write the answer:
- Start with a concise summary (bullet points if the question is broad, a direct answer
  if it is narrow).
- Follow with detailed prose using specific dates, attendees, and decisions from the
  excerpts.`;

let baseModel: ChatOpenAI | null = null;

function getModel(): ChatOpenAI {
  if (!baseModel) {
    baseModel = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.3, maxTokens: 1500 });
  }
  return baseModel;
}

function countToolTurns(messages: BaseMessage[]): number {
  return messages.filter((m) => isAIMessage(m) && (m.tool_calls?.length ?? 0) > 0).length;
}

// Agent node: calls the model, varying tool availability by how far the loop has run.
async function callModel(state: typeof MessagesAnnotation.State) {
  const { messages } = state;
  const toolTurns = countToolTurns(messages);
  const model = getModel();

  let response;
  if (toolTurns === 0) {
    // Force a search on the very first turn so every answer is grounded.
    response = await model.bindTools(tools, { tool_choice: 'any' }).invoke(messages);
  } else if (toolTurns >= MAX_TOOL_TURNS) {
    // Step budget exhausted: force a final textual answer with no further tools.
    response = await model.invoke(messages);
  } else {
    response = await model.bindTools(tools).invoke(messages);
  }

  return { messages: [response] };
}

// Continue into the tools node while the model is still requesting tool calls.
function shouldContinue(state: typeof MessagesAnnotation.State) {
  const last = state.messages[state.messages.length - 1];
  if (isAIMessage(last) && (last.tool_calls?.length ?? 0) > 0) return 'tools';
  return END;
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', callModel)
  .addNode('tools', new ToolNode(tools))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', shouldContinue, ['tools', END])
  .addEdge('tools', 'agent')
  .compile();

// Pull the raw matches that tools attached as ToolMessage artifacts, so they can
// become user-facing citations.
function collectMatches(messages: BaseMessage[]): PineconeMatch[] {
  const out: PineconeMatch[] = [];
  for (const m of messages) {
    if (isToolMessage(m) && Array.isArray(m.artifact)) {
      out.push(...(m.artifact as PineconeMatch[]));
    }
  }
  return out;
}

function messageText(content: BaseMessage['content']): string {
  if (typeof content === 'string') return content;
  // Array content (rare for these responses): concatenate text parts.
  return content
    .map((part) => (typeof part === 'string' ? part : 'text' in part ? part.text : ''))
    .join('');
}

/**
 * Runs the LangGraph research agent: the model plans and issues searches against
 * the minutes (forced on the first turn for grounding), reads the results, and
 * decides when it has enough evidence to answer — falling back to a forced answer
 * once the tool-turn budget is spent. Returns the final answer plus every match
 * retrieved along the way (for citations).
 */
export async function runAgentLoop(
  query: string
): Promise<{ response: string; matches: PineconeMatch[] }> {
  const result = await graph.invoke({
    messages: [new SystemMessage(AGENT_SYSTEM_PROMPT), new HumanMessage(query)],
  });

  const messages = result.messages;
  const last = messages[messages.length - 1];

  return {
    response: messageText(last.content) || 'Unable to generate response.',
    matches: collectMatches(messages),
  };
}
