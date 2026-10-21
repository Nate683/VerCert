import Anthropic from "@anthropic-ai/sdk";

// Claude client (server-only) for the executive "Assistant" tab. The model can
// be overridden with ANTHROPIC_MODEL; the old default, claude-3-5-sonnet-20241022,
// has been retired.
const DEFAULT_MODEL = "claude-opus-5-5";

// Models that accept the server-side refusal fallback. A safety classifier
// can decline a request; with fallbacks on, the API re-runs it on a fallback
// model inside the same call instead of stopping.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local to enable the assistant.");
  }
  client ??= new Anthropic();
  return client;
}

export async function askStoreAssistant(question: string, dataSnapshot: string): Promise<string> {
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const response = await getClient().beta.messages.create({
    model,
    // Opus 5.5 always thinks, and thinking counts toward max_tokens, so this
    // leaves room for both; the answers themselves stay short.
    max_tokens: 16000,
    // Effort is the only depth control on Opus 5.5 (default "medium"); set
    // explicitly. Precise lookups over a snapshot don't need more.
    output_config: { effort: "medium" },
    ...(FALLBACK_MODELS.has(model)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
    system:
      "You are the VeriCert store data assistant, used internally by executives. " +
      "Answer questions about orders, revenue, inventory, and customers using ONLY the JSON " +
      "data snapshot provided below. Be concise and use dollar amounts and counts precisely. " +
      "If the answer isn't in the data, say so plainly instead of guessing.\n\n" +
      `DATA SNAPSHOT:\n${dataSnapshot}`,
    messages: [{ role: "user", content: question }],
  });

  if (response.stop_reason === "refusal") {
    return "The assistant declined to answer that question. Try rephrasing it.";
  }
  // Thinking blocks come before the answer, so read the text blocks, not
  // content[0].
  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text || "I couldn't generate a response.";
}
