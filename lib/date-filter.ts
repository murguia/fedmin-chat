import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { traceable } from 'langsmith/traceable';
import { z } from 'zod';

export interface DateRange {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
}

const DateRangeSchema = z.object({
  hasConstraint: z
    .boolean()
    .describe('true only when the question explicitly scopes to a date or period'),
  start: z.string().nullable().describe('inclusive start date YYYY-MM-DD, or null'),
  end: z.string().nullable().describe('inclusive end date YYYY-MM-DD, or null'),
});

let model: ChatOpenAI | null = null;

function getModel() {
  if (!model) {
    model = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });
  }
  return model;
}

/**
 * Extracts an explicit temporal constraint from a question and converts it to an
 * inclusive date range over the 1967-1973 corpus. Returns null when the question
 * has no time scope (most questions). This is the "self-query" step that turns
 * "in August 1971" into a SQL date filter the vector store can apply.
 */
export const extractDateRange = traceable(
  async function extractDateRange(query: string): Promise<DateRange | null> {
    const structured = getModel().withStructuredOutput(DateRangeSchema, {
      name: 'extract_date_range',
    });

    const res = await structured.invoke([
      new SystemMessage(
        `Extract an explicit time constraint from a question about Federal Reserve
Board meeting minutes. The corpus spans 1967-1973.

- Set hasConstraint=true ONLY when the question clearly scopes to a time period:
  a year, month, quarter, season, or a relative bound ("before/after X",
  "between X and Y").
- Convert to an inclusive range:
  "August 1971" -> 1971-08-01 .. 1971-08-31
  "in 1969" -> 1969-01-01 .. 1969-12-31
  "before 1970" -> 1967-01-01 .. 1969-12-31
  "after the Nixon Shock" -> 1971-08-15 .. 1973-12-31
  "second half of 1972" -> 1972-07-01 .. 1972-12-31
- Clamp to the corpus: never produce dates before 1967-01-01 or after 1973-12-31.
- If there is NO temporal constraint, set hasConstraint=false and leave dates null.
- Never invent a constraint that isn't in the question.`
      ),
      new HumanMessage(query),
    ]);

    if (!res.hasConstraint || !res.start || !res.end) return null;
    return { start: res.start, end: res.end };
  },
  { name: 'extractDateRange' }
);
