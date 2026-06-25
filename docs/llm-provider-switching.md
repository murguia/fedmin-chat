# Switching LLMs / Providers — How It's Done in Industry

*Reference note captured from a working conversation (June 2026). Context: weighing whether to
swap fedmin-chat's GPT-4o agent to a cheaper model/provider (e.g. DeepSeek) for cost.*

There's no single "the way," but there's a well-established **layered pattern**. Most
cost-sensitive teams land somewhere on this spectrum, from simplest to most sophisticated.

---

## The foundation: the OpenAI-compatible API is the de facto standard

The single biggest reason swapping is easy: **almost every provider exposes an
OpenAI-compatible `/v1/chat/completions` endpoint** — DeepSeek, Together, Fireworks, Groq,
Mistral, xAI, Azure OpenAI, and self-hosted via vLLM/Ollama.

So the most basic "switch" is just changing **`base_url` + `api_key` + `model`** while keeping
the same SDK.

**The catch:** feature parity isn't perfect. Tool/function calling, structured output, and
streaming behave subtly differently per provider — so you *re-validate*, you don't blindly
trust a swap.

## Layer 1 — Code against an abstraction, config-driven

Never hardcode the client. You depend on an interface and select the concrete model from
**config/env**, not source:

- **LangChain** — `init_chat_model`, the `BaseChatModel` interface
- **Vercel AI SDK** — provider packages, unified `generateText`
- **LlamaIndex**, **Pydantic AI**, etc.

## Layer 2 — Put a gateway/router in front (the dominant production pattern)

This is what "done all the time" actually looks like at scale. Instead of each app talking to
each provider, everything goes through **one LLM gateway** that speaks the OpenAI format and
fans out to any model:

- **LiteLLM** — the open-source standard. Proxy + SDK mapping 100+ providers to the OpenAI
  format; handles fallbacks, retries, load balancing, **per-key budgets**, cost tracking,
  rate limits.
- **OpenRouter** — hosted version: one key, hundreds of models, automatic failover,
  pay-through billing. Popular precisely for "try/switch models cheaply."
- **Cloud gateways** — AWS Bedrock, Azure AI, Vertex Model Garden (multi-model behind one
  API), plus **Vercel AI Gateway**, **Cloudflare AI Gateway**, **Portkey**, **Helicone**
  (these add caching + observability + guardrails).

**What the gateway buys you (why it's the standard):** swap models via config with zero app
changes, automatic **fallback chains** (primary down/rate-limited → secondary), centralized
**cost tracking + budgets**, **caching**, and one place for keys/observability. Big orgs often
build an internal "LLM gateway" microservice for exactly this.

## Layer 3 — Cost-specific patterns on top

Where cost-sensitivity actually gets addressed:

- **Model tiering / task-appropriate routing** — cheap model for easy steps, expensive for
  hard ones. (fedmin-chat already does a basic version: gpt-4o-mini for query expansion and
  reranking, GPT-4o for the agent.) Formalizing it ("use the cheapest model that passes the
  eval for each task") is the bread-and-butter cost lever.
- **Dynamic / semantic routing** — route *per request* by difficulty: easy queries → cheap
  model, hard → strong model. Tools: **RouteLLM** (LMSys), **NotDiamond**, **Martian**,
  **Unify**. A small classifier decides.
- **Caching** — prompt caching (provider-side) and semantic caching (GPTCache, gateway-level)
  cut cost without switching models at all.

## Layer 4 — The discipline that makes it safe: eval-gated swaps

The part juniors skip and seniors insist on: **you don't ship a model/provider change without
an eval that proves no regression.** Cheaper model → re-run the suite → compare quality/cost →
promote only if it holds.

Note the two dimensions:
- **Retrieval** evals (does it fetch the right context?)
- **Generation / faithfulness** evals (is the answer grounded? — often LLM-as-judge)

A model swap really wants the *generation/faithfulness* eval, since that's what a cheaper model
is most likely to regress.

---

## Mapping to a small app (e.g. fedmin-chat)

The standard-but-right-sized version for a Vercel + LangChain + TypeScript stack:

1. Keep the **LangChain abstraction** — make model id + provider **env-driven** (the model
   already lives in factory functions: `getModel()` in `lib/agent.ts`, `getAssistModel()` in
   `lib/retrieve.ts`).
2. Point it at a **gateway** — given Vercel hosting, **Vercel AI Gateway** or **OpenRouter** is
   lowest-friction (one key, swap models in config, free fallback + cost tracking). **LiteLLM**
   if you want the self-hosted/open-source flavor common in larger orgs.
3. **Gate swaps with the eval.**

**Right-sizing:** for a single low-traffic app, a gateway is mild over-engineering —
config-driven LangChain + an OpenAI-compatible base URL is genuinely enough. Gateways earn
their keep when you have *many* apps/models, need central budgets/failover, or do dynamic
routing. So adding one to a small project is best framed as a **portfolio/learning decision**
("I know the gateway pattern"), not a cost necessity.

---

## The one-sentence version (good for interviews)

> "I code against a model abstraction, route per-task by cost, front it with a gateway for
> fallback + budget control, and gate every swap with an eval."

That's exactly what AI-engineering interviewers probe for — and the eval piece is the part most
people are missing.
