/**
 * Server-side validators. All error messages are plain English and safe to
 * show in the UI. Nothing here logs or echoes request content.
 */
import { FIELD_LIMITS } from "./limits";

export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const CHAT_MODELS = ["GPT4_STYLE", "CLAUDE_STYLE", "LLAMA_STYLE"] as const;
export type ChatModelValue = (typeof CHAT_MODELS)[number];

export const MODEL_LABELS: Record<ChatModelValue, string> = {
  GPT4_STYLE: "GPT-4 style (simulated)",
  CLAUDE_STYLE: "Claude style (simulated)",
  LLAMA_STYLE: "Local Llama style (simulated)",
};

export const DEFAULT_SETTINGS = { model: "GPT4_STYLE" as ChatModelValue, temperature: 0.5, topP: 0.5 };

// Control characters except tab and newline.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Removes control characters and trims. Keeps newlines inside the text. */
export function cleanText(input: unknown): string {
  return typeof input === "string" ? input.replace(CONTROL_CHARS, "").trim() : "";
}

export function validateMessage(input: unknown): Validated<string> {
  if (typeof input !== "string") return { ok: false, errors: { message: "Please enter a message." } };
  const text = cleanText(input);
  if (text === "") return { ok: false, errors: { message: "Please enter a message before sending." } };
  if (text.length > FIELD_LIMITS.message) {
    return {
      ok: false,
      errors: {
        message: `That message is a little too long. Please keep it under ${FIELD_LIMITS.message} characters.`,
      },
    };
  }
  return { ok: true, value: text };
}

/**
 * Chat title from the first accepted message: whitespace and line breaks
 * collapsed, control characters removed, at most 40 characters (39 + "…").
 */
export function makeChatTitle(message: string): string {
  const collapsed = message.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
  if (collapsed === "") return "New chat";
  const chars = Array.from(collapsed); // count code points, not UTF-16 units
  return chars.length <= FIELD_LIMITS.chatTitle
    ? collapsed
    : `${chars.slice(0, FIELD_LIMITS.chatTitle - 1).join("")}…`;
}

export type ChatSettings = { model: ChatModelValue; temperature: number; topP: number };

function isUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Validates complete or partial settings. Omitted keys are left undefined. */
export function validateSettings(input: unknown, partial = false): Validated<Partial<ChatSettings>> {
  const errors: FieldErrors = {};
  const out: Partial<ChatSettings> = {};
  const data = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

  if (data.model !== undefined || !partial) {
    if (typeof data.model === "string" && (CHAT_MODELS as readonly string[]).includes(data.model)) {
      out.model = data.model as ChatModelValue;
    } else {
      errors.model = "Please choose one of the available model styles.";
    }
  }
  if (data.temperature !== undefined || !partial) {
    if (isUnit(data.temperature)) out.temperature = data.temperature;
    else errors.temperature = "Temperature must be a number between 0.0 and 1.0.";
  }
  if (data.topP !== undefined || !partial) {
    if (isUnit(data.topP)) out.topP = data.topP;
    else errors.topP = "Top-P must be a number between 0.0 and 1.0.";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: out };
}

function requiredField(
  data: Record<string, unknown>,
  key: string,
  label: string,
  max: number,
  errors: FieldErrors,
  required = true,
): string {
  const raw = data[key];
  if (raw !== undefined && typeof raw !== "string") {
    errors[key] = `${label} must be text.`;
    return "";
  }
  const value = cleanText(raw);
  if (required && value === "") errors[key] = `${label} is required.`;
  else if (value.length > max) errors[key] = `${label} must be at most ${max} characters.`;
  return value;
}

export type ProductInput = {
  name: string;
  activeSubstance: string;
  category: string;
  useFor: string;
  howToUse: string;
  tip: string;
};

export function validateProductInput(input: unknown): Validated<ProductInput> {
  const errors: FieldErrors = {};
  const data = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const value: ProductInput = {
    name: requiredField(data, "name", "Product name", FIELD_LIMITS.productName, errors),
    activeSubstance: requiredField(data, "activeSubstance", "Active substance", FIELD_LIMITS.activeSubstance, errors),
    category: requiredField(data, "category", "Category", FIELD_LIMITS.category, errors),
    useFor: requiredField(data, "useFor", "Use for", FIELD_LIMITS.useFor, errors),
    howToUse: requiredField(data, "howToUse", "How to use", FIELD_LIMITS.howToUse, errors),
    tip: requiredField(data, "tip", "Tip", FIELD_LIMITS.tip, errors, false),
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export type PersonaInput = { name: string; content: string };

export function validatePersonaInput(input: unknown): Validated<PersonaInput> {
  const errors: FieldErrors = {};
  const data = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const value: PersonaInput = {
    name: requiredField(data, "name", "Persona name", FIELD_LIMITS.personaName, errors),
    content: requiredField(data, "content", "Persona content", FIELD_LIMITS.personaContent, errors),
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export const QUIZ_TOTAL = 5;

/** Strict quiz-result body: exactly { score, total }, integers, total === 5. */
export function validateQuizResult(input: unknown): Validated<{ score: number; total: number }> {
  const bad = (message: string): Validated<never> => ({ ok: false, errors: { result: message } });
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return bad("The quiz result is not valid.");
  }
  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("score") || !keys.includes("total")) {
    return bad("The quiz result is not valid.");
  }
  const { score, total } = input as Record<string, unknown>;
  if (!Number.isInteger(score) || !Number.isInteger(total)) return bad("The quiz result is not valid.");
  if (total !== QUIZ_TOTAL) return bad("The quiz result is not valid.");
  if ((score as number) < 0 || (score as number) > QUIZ_TOTAL) return bad("The quiz result is not valid.");
  return { ok: true, value: { score: score as number, total: total as number } };
}
