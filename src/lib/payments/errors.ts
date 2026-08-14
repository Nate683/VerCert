// Thrown by payment providers for expected, user-facing failures (e.g.
// missing API keys, upstream API errors) — callers can show `message`
// directly instead of a generic "something went wrong".
export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
