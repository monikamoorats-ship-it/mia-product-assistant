/**
 * Deterministic mock-AI response pipeline. No randomness, no I/O, no database.
 * Same message + products + persona + settings => identical answer.
 *
 * Pipeline:
 *   0. safety guard (emergency stops everything)
 *   1. retrieve factual content from the visible product data (matching)
 *   2. apply persona behaviour, chosen by seedKey only (never the editable name)
 *   3. apply the simulated model format
 *   4. apply the Temperature wording level
 *   5. apply the Top-P detail level
 *   6. enforce the safety floor as a final validation step
 *
 * Product facts are always copied verbatim from the product data. Persona,
 * model style and Temperature change presentation only; Top-P adds detail
 * above the safety floor (tip + pharmacist line), never below it.
 */
import { evaluateSafety } from "../safety/guard";
import { SAFETY_TEXT } from "../safety/rules";
import { matchProducts, mentionsIdentifiableProduct, type MatchableProduct } from "../matching";
import type { ChatModelValue, ChatSettings } from "../validation";

export type AnswerProduct = MatchableProduct & {
  ownerId: string | null;
  howToUse: string;
  tip: string;
};

export type PersonaKey = "customer-guide" | "learning-coach" | "product-expert";
export type Level = "low" | "medium" | "high";

export type AnswerInput = {
  message: string;
  /** Products visible to the current owner (seeded + own custom). */
  products: readonly AnswerProduct[];
  /** Persona seedKey, or null for custom personas / no persona (Customer tone). */
  personaSeedKey: string | null;
  settings: ChatSettings;
  hasAttachment?: boolean;
};

export type AnswerOutput = {
  content: string;
  /** Products the answer refers to (at most 3), used for cards and snapshots. */
  products: AnswerProduct[];
  kind: "emergency" | "answer" | "no-match";
  /** True when dosing/usage instructions were removed (special-group context). */
  hideDosing: boolean;
};

/** Rounded to one decimal so slider steps map cleanly: 0.0–0.3, 0.4–0.7, 0.8–1.0. */
export function levelFor(value: number): Level {
  const v = Math.round(value * 10) / 10;
  if (v <= 0.3) return "low";
  if (v <= 0.7) return "medium";
  return "high";
}

export function personaKeyFor(seedKey: string | null): PersonaKey {
  return seedKey === "learning-coach" || seedKey === "product-expert" ? seedKey : "customer-guide";
}

type FactKey = "activeSubstance" | "category" | "useFor" | "howToUse" | "tip";
type Fact = { key: FactKey; label: string; value: string };

const LABELS: Record<FactKey, string> = {
  activeSubstance: "Active substance",
  category: "Category",
  useFor: "Used for",
  howToUse: "How to use",
  tip: "Tip",
};

/** Steps 1+5: which facts to show. The safety floor (use + tip) is always present. */
export function selectFacts(product: AnswerProduct, topP: Level, hideDosing: boolean): Fact[] {
  const wanted: FactKey[] = [];
  if (topP === "high") wanted.push("activeSubstance", "category");
  wanted.push("useFor");
  if (topP !== "low" && !hideDosing) wanted.push("howToUse");
  if (product.tip.trim() !== "") wanted.push("tip");
  return wanted.map((key) => ({ key, label: LABELS[key], value: product[key] }));
}

const firstTerm = (useFor: string) => useFor.split(/[,;/]/)[0].trim().toLowerCase();

/** Step 4: Temperature wording for one fact. */
function phrase(fact: Fact, level: Level, structured: boolean): string {
  if (structured || level === "low") return `${fact.label}: ${fact.value}`;
  const v = fact.value;
  if (level === "medium") {
    switch (fact.key) {
      case "activeSubstance": return `The active substance is ${v}.`;
      case "category": return `It belongs to the category "${v}".`;
      case "useFor": return `It is used for ${v}.`;
      case "howToUse": return `How to use: ${v}.`;
      case "tip": return `Tip: ${v}.`;
    }
  }
  switch (fact.key) {
    case "activeSubstance": return `It contains ${v} as the active substance.`;
    case "category": return `You will find it under "${v}".`;
    case "useFor": return `It is used for ${v}. For example, it is listed for ${firstTerm(v)}.`;
    case "howToUse": return `Good to know, here is how to use it: ${v}.`;
    case "tip": return `Friendly tip: ${v}.`;
  }
}

/** Steps 2+4: persona-specific opening line, worded by Temperature level. */
function opener(persona: PersonaKey, level: Level, multiple: boolean): string {
  if (persona === "product-expert") {
    return { low: "Summary:", medium: "Short summary:", high: "Happy to share a short summary:" }[level];
  }
  const single = {
    low: "Here is what I found.",
    medium: "Here is what I can tell you.",
    high: "Happy to help! Here is what I found.",
  }[level];
  const many = {
    low: "Possible matches:",
    medium: "These products may be relevant for learning:",
    high: "Happy to help! These products may be relevant for learning:",
  }[level];
  const base = multiple ? many : single;
  return persona === "learning-coach" ? `Good question. ${base}` : base;
}

/** Step 3: simulated model format for one product block. */
function block(product: AnswerProduct, facts: string[], model: ChatModelValue): string {
  switch (model) {
    case "GPT4_STYLE":
      return [product.name, ...facts.map((f) => `• ${f}`)].join("\n");
    case "CLAUDE_STYLE":
      return [
        product.name,
        ...facts.map((f) => `• ${f}`),
        "Context: this is general information from the demo product catalogue and may not apply to your personal situation.",
      ].join("\n");
    case "LLAMA_STYLE":
      return [`${product.name}.`, ...facts.map((f) => (/[.!?]$/.test(f) ? f : `${f}.`))].join("\n");
  }
}

function counsellingTip(product: AnswerProduct): string {
  return product.tip.trim() !== ""
    ? `Counselling tip: when talking with a customer about ${product.name}, mention this: ${product.tip}`
    : `Counselling tip: when talking with a customer about ${product.name}, explain what it is used for and suggest they ask a pharmacist about anything unclear.`;
}

/** Step 6: the safety floor, enforced as a final validation step. */
export function enforceSafetyFloor(content: string, shown: readonly AnswerProduct[]): string {
  let text = content.replace(/\s+$/, "");
  const line = SAFETY_TEXT.pharmacistLine;
  // Remove an existing closing line so it is not duplicated, then re-add it last.
  while (text.endsWith(line)) text = text.slice(0, -line.length).replace(/\s+$/, "");
  for (const product of shown) {
    const tip = product.tip.trim();
    if (tip !== "" && !text.includes(tip)) text += `\n\nImportant: ${tip}`;
  }
  return `${text}\n\n${line}`;
}

export function buildAnswer(input: AnswerInput): AnswerOutput {
  const { message, products, settings } = input;

  // Step 0: safety guard. An emergency returns ONLY the fixed urgent message.
  const decision = evaluateSafety(message, { productMentioned: mentionsIdentifiableProduct(message, products) });
  if (decision.kind === "emergency") {
    return { content: decision.response, products: [], kind: "emergency", hideDosing: true };
  }

  const notices: string[] = [];
  if (decision.personalAdvice) notices.push(SAFETY_TEXT.personalAdvice);
  if (decision.specialGroup) notices.push(SAFETY_TEXT.specialGroup);
  const attachment = input.hasAttachment ? [SAFETY_TEXT.attachmentNote] : [];

  // Step 1: retrieve facts.
  const { matches } = matchProducts(message, products);
  if (matches.length === 0) {
    const content = [...notices, ...attachment, SAFETY_TEXT.noMatch].join("\n\n");
    return { content, products: [], kind: "no-match", hideDosing: decision.specialGroup };
  }

  const shown = matches.map((m) => m.product);
  const persona = personaKeyFor(input.personaSeedKey);
  const temperature = levelFor(settings.temperature);
  const topP = levelFor(settings.topP);
  const hideDosing = decision.specialGroup;

  const parts: string[] = [opener(persona, temperature, shown.length > 1)];
  for (const product of shown) {
    const facts = selectFacts(product, topP, hideDosing).map((fact) =>
      phrase(fact, temperature, persona === "product-expert"),
    );
    parts.push(block(product, facts, settings.model));
  }
  if (persona === "learning-coach") parts.push(counsellingTip(shown[0]));
  parts.push(...attachment, ...notices);

  return {
    content: enforceSafetyFloor(parts.join("\n\n"), shown),
    products: shown,
    kind: "answer",
    hideDosing,
  };
}
