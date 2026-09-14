// Set by the storefront age gate (components/AgeGate.tsx) once a visitor
// confirms they're 21 or older. Registration requires it and records when —
// the attestation is how age is handled; no date of birth is ever collected.
export const AGE_GATE_COOKIE = "vericert_age_ack";
