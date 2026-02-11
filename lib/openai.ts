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
minutes from 1967-1973. Answer questions based on the provided meeting excerpts.

RESPONSE FORMAT:
1. 3-5 bullet points summarizing key findings (use emojis)
2. A blank line
3. Detailed prose explanation with specific dates, attendees, and decisions

Always cite the meeting date and relevant context. If the excerpts don't
contain enough information to answer, say so clearly.`;

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
    temperature: 0.7,
    max_tokens: 1500,
  });

  return response.choices[0].message.content || 'Unable to generate response.';
}

export { getOpenAIClient };
