// Anthropic Messages API client (server-only) for the executive "Assistant"
// tab. Model id can be overridden via ANTHROPIC_MODEL if it changes.
const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";

export async function askStoreAssistant(question: string, dataSnapshot: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable the assistant."
    );
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 1024,
      system:
        "You are the VeriCert store data assistant, used internally by executives. " +
        "Answer questions about orders, revenue, inventory, and customers using ONLY the JSON " +
        "data snapshot provided below. Be concise and use dollar amounts and counts precisely. " +
        "If the answer isn't in the data, say so plainly instead of guessing.\n\n" +
        `DATA SNAPSHOT:\n${dataSnapshot}`,
      messages: [{ role: "user", content: question }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${body}`);
  }

  const json = await res.json();
  const text = json.content?.[0]?.text;
  return typeof text === "string" ? text : "I couldn't generate a response.";
}
