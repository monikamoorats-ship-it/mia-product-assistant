/**
 * Quiz generation from the products visible to the owner. Pure and
 * deterministic for a given random-number generator (inject a seeded RNG in
 * tests). No database access.
 *
 * Templates:
 *   1. "Which product is used for [use for term]?"      -> product name
 *   2. "What is the active substance of [product name]?" -> active substance
 *   3. "Which category does [product name] belong to?"   -> category
 *   4. "Which product has this tip: [tip]?"              -> product name
 *
 * A question is only generated when there is exactly one intended correct
 * answer among ALL visible products, the correct answer is non-empty, four
 * distinct answer values are available and no distractor is also correct.
 * Uniqueness uses normalised COMPLETE values only: no prefix, substring or
 * fuzzy matching.
 */

export type QuizProduct = {
  id: string;
  name: string;
  activeSubstance: string;
  category: string;
  useFor: string;
  tip: string;
};

export type QuizQuestion = {
  text: string;
  options: string[];
  /** Index into options. Sent to the browser for instant feedback, never displayed before answering. */
  correctIndex: number;
  /** Built only from the visible product data. */
  explanation: string;
};

export const QUIZ_LENGTH = 5;
export const OPTION_COUNT = 4;
export const QUIZ_UNAVAILABLE_MESSAGE = "Add more varied products to unlock the quiz.";

export type Rng = () => number;

/** Lowercase, collapse whitespace, strip trailing punctuation. */
export function normaliseValue(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().replace(/[\s.,;:!?]+$/u, "");
}

/** Splits a use-for value on commas, semicolons and slashes into normalised, non-empty terms. */
export function useForTerms(useFor: string): string[] {
  return [...new Set(useFor.split(/[,;/]/).map(normaliseValue).filter((t) => t !== ""))];
}

type Candidate = {
  template: 1 | 2 | 3 | 4;
  productId: string;
  text: string;
  correct: string;
  /** Distinct values (by normalised form) that are all wrong for this question. */
  distractors: string[];
  explanation: string;
};

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function distinctBy(values: readonly string[], exclude: string): string[] {
  const seen = new Set<string>([normaliseValue(exclude)]);
  const out: string[] = [];
  for (const value of values) {
    const key = normaliseValue(value);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** All valid candidate questions for the visible products. */
export function buildCandidates(products: readonly QuizProduct[]): Candidate[] {
  const candidates: Candidate[] = [];
  const nameCount = new Map<string, number>();
  for (const p of products) nameCount.set(normaliseValue(p.name), (nameCount.get(normaliseValue(p.name)) ?? 0) + 1);

  // Template 1: use-for terms that belong to exactly one visible product.
  const termOwners = new Map<string, Set<string>>();
  for (const p of products) {
    for (const term of useForTerms(p.useFor)) {
      if (!termOwners.has(term)) termOwners.set(term, new Set());
      termOwners.get(term)!.add(p.id);
    }
  }
  for (const p of products) {
    if (normaliseValue(p.name) === "" || nameCount.get(normaliseValue(p.name))! > 1) continue; // answer must be unambiguous
    for (const term of useForTerms(p.useFor)) {
      if (termOwners.get(term)!.size !== 1) continue;
      const distractors = distinctBy(
        products.filter((o) => o.id !== p.id && !useForTerms(o.useFor).includes(term)).map((o) => o.name),
        p.name,
      );
      if (distractors.length < OPTION_COUNT - 1) continue;
      candidates.push({
        template: 1,
        productId: p.id,
        text: `Which product is used for ${term}?`,
        correct: p.name,
        distractors,
        explanation: `${p.name} is used for ${p.useFor}.`,
      });
    }
  }

  // Template 4: tips that belong to exactly one visible product (whole sentence).
  const tipOwners = new Map<string, Set<string>>();
  for (const p of products) {
    const tip = normaliseValue(p.tip);
    if (tip === "") continue;
    if (!tipOwners.has(tip)) tipOwners.set(tip, new Set());
    tipOwners.get(tip)!.add(p.id);
  }
  for (const p of products) {
    const tip = normaliseValue(p.tip);
    if (tip === "" || tipOwners.get(tip)!.size !== 1) continue;
    if (nameCount.get(normaliseValue(p.name))! > 1) continue;
    const distractors = distinctBy(
      products.filter((o) => o.id !== p.id && normaliseValue(o.tip) !== tip).map((o) => o.name),
      p.name,
    );
    if (distractors.length < OPTION_COUNT - 1) continue;
    candidates.push({
      template: 4,
      productId: p.id,
      text: `Which product has this tip: ${p.tip.trim()}`.replace(/[.!?]*$/u, "") + "?",
      correct: p.name,
      distractors,
      explanation: `The tip for ${p.name} is: ${p.tip.trim()}`,
    });
  }

  // Templates 2 and 3: need an unambiguous product name and 4 distinct values to choose from.
  for (const p of products) {
    if (normaliseValue(p.name) === "" || nameCount.get(normaliseValue(p.name))! > 1) continue;
    const substanceOptions = distinctBy(products.map((o) => o.activeSubstance), p.activeSubstance);
    if (normaliseValue(p.activeSubstance) !== "" && substanceOptions.length >= OPTION_COUNT - 1) {
      candidates.push({
        template: 2,
        productId: p.id,
        text: `What is the active substance of ${p.name}?`,
        correct: p.activeSubstance,
        distractors: substanceOptions,
        explanation: `The active substance of ${p.name} is ${p.activeSubstance}.`,
      });
    }
    const categoryOptions = distinctBy(products.map((o) => o.category), p.category);
    if (normaliseValue(p.category) !== "" && categoryOptions.length >= OPTION_COUNT - 1) {
      candidates.push({
        template: 3,
        productId: p.id,
        text: `Which category does ${p.name} belong to?`,
        correct: p.category,
        distractors: categoryOptions,
        explanation: `${p.name} belongs to the category "${p.category}".`,
      });
    }
  }
  return candidates;
}

/**
 * Picks five valid questions with no repeated question text, preferring five
 * different products (correctness matters more than product variety).
 * Returns null when five valid questions cannot be built.
 */
export function generateQuiz(products: readonly QuizProduct[], rng: Rng = Math.random): QuizQuestion[] | null {
  const shuffled = shuffle(buildCandidates(products), rng);
  const chosen: Candidate[] = [];
  const texts = new Set<string>();
  const productsUsed = new Set<string>();

  for (const c of shuffled) {
    if (chosen.length === QUIZ_LENGTH) break;
    if (texts.has(c.text) || productsUsed.has(c.productId)) continue;
    chosen.push(c);
    texts.add(c.text);
    productsUsed.add(c.productId);
  }
  for (const c of shuffled) {
    if (chosen.length === QUIZ_LENGTH) break;
    if (texts.has(c.text)) continue;
    chosen.push(c);
    texts.add(c.text);
  }
  if (chosen.length < QUIZ_LENGTH) return null;

  return shuffle(chosen, rng).map((c) => {
    const options = shuffle([c.correct, ...shuffle(c.distractors, rng).slice(0, OPTION_COUNT - 1)], rng);
    return { text: c.text, options, correctIndex: options.indexOf(c.correct), explanation: c.explanation };
  });
}

/** Structural check used by tests and the API before sending a quiz. */
export function isValidQuiz(quiz: readonly QuizQuestion[]): boolean {
  if (quiz.length !== QUIZ_LENGTH) return false;
  if (new Set(quiz.map((q) => q.text)).size !== QUIZ_LENGTH) return false;
  return quiz.every((q) => {
    const keys = q.options.map(normaliseValue);
    return (
      q.options.length === OPTION_COUNT &&
      new Set(keys).size === OPTION_COUNT &&
      keys.every((k) => k !== "") &&
      q.correctIndex >= 0 &&
      q.correctIndex < OPTION_COUNT
    );
  });
}
