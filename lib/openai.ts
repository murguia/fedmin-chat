import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text,
  });
  return response.data[0].embedding;
}

export async function generateChatResponse(
  query: string,
  context: string
): Promise<string> {
  const openai = getOpenAIClient();
  const systemPrompt = `You are a research assistant helping users explore Federal Reserve meeting
minutes from 1967-1973. Answer questions based ONLY on the provided meeting excerpts.

Key context: This period covers the collapse of Bretton Woods, the Nixon Shock (Aug 1971),
rising inflation, and the shift from fixed to floating exchange rates.

RULES:
- Do NOT infer facts, names, or decisions that are not explicitly stated in the excerpts.
- If only one or two excerpts are relevant, focus on those — do not pad the response.
- Always cite the meeting date and relevant context.
- If the excerpts don't contain enough information to answer, say so clearly.

RESPONSE FORMAT:
- Start with a concise summary (bullet points if the question is broad, direct answer if narrow)
- Follow with detailed prose using specific dates, attendees, and decisions from the excerpts`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Based on the following Federal Reserve meeting excerpts, answer the question.

MEETING EXCERPTS:
${context}

QUESTION: ${query}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 1500,
  });

  return response.choices[0].message.content || 'Unable to generate response.';
}

export { getOpenAIClient };
