/**
 * Deterministic keyword matching of a user message against the products
 * visible to the current owner. Pure: no database, no randomness.
 *
 * Rules:
 *  - lowercase; punctuation and hyphens become spaces; split into words;
 *  - duplicate query words are removed (repeating a word never adds score);
 *  - STOP_WORDS and words shorter than 3 characters are ignored;
 *  - a word matches a field word when they are equal, or share a prefix of at
 *    least 4 characters ("allergy"/"allergies"); no fuzzy or substring matching;
 *  - per query word a product scores the highest weight of any field it
 *    matches (WEIGHTS), and the product score is the sum over query words;
 *  - if the query contains a product's complete name, only that product is
 *    returned (the longest such name wins);
 *  - otherwise up to MAX_RESULTS products with score > 0, sorted by score
 *    descending, then by name alphabetically.
 */

export const WEIGHTS = {
  name: 3,
  activeSubstance: 3,
  useFor: 2,
  category: 1,
} as const;

export const MAX_RESULTS = 3;
export const MIN_WORD_LENGTH = 3;
export const MIN_SHARED_PREFIX = 4;

/** Fixed list of ignored words. Edit here to tune matching. */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  // articles, pronouns, prepositions, conjunctions
  "the", "and", "for", "with", "without", "from", "into", "onto", "about", "that", "this", "these", "those",
  "its", "you", "your", "yours", "our", "ours", "they", "them", "their", "his", "her", "him", "she", "was",
  "were", "are", "been", "being", "has", "have", "had", "having", "did", "does", "doing", "done", "can",
  "could", "should", "would", "will", "shall", "may", "might", "must", "not", "nor", "but", "yet", "also",
  "than", "then", "there", "here", "when", "where", "which", "who", "whom", "whose", "what", "why", "how",
  "any", "all", "some", "such", "only", "own", "same", "too", "very", "just", "more", "most", "much",
  "many", "other", "another", "each", "every", "both", "few", "per", "via", "etc", "off", "out", "over",
  "under", "again", "once", "ever", "even", "still", "now", "get", "got", "let",
  // conversational filler
  "please", "tell", "show", "explain", "need", "want", "like", "know", "give", "find", "look", "looking",
  "ask", "asking", "thanks", "thank", "hello", "hey", "mia", "can't", "cant", "dont", "does", "help",
  "helps", "helping", "helped", "good", "best", "work", "works", "working",
  // generic product words
  "product", "products", "medicine", "medicines", "medication", "medications", "drug", "drugs",
  "contain", "contains", "containing", "contained", "use", "used", "uses", "using", "take", "taking",
  "takes", "taken", "name", "names",
  // dosage forms and units (generic, would match nearly every product)
  "tablet", "tablets", "capsule", "capsules", "spray", "sprays", "mg", "iu", "ml", "mcg",
]);

/** Lowercase, punctuation/hyphens to spaces, collapse whitespace. */
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  const normalised = normaliseText(text);
  return normalised === "" ? [] : normalised.split(" ");
}

/** Query words after de-duplication, stop-word and length filtering. */
export function queryKeywords(query: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words(query)) {
    if (word.length < MIN_WORD_LENGTH || STOP_WORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    result.push(word);
  }
  return result;
}

function sharedPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

export function wordsMatch(queryWord: string, fieldWord: string): boolean {
  return queryWord === fieldWord || sharedPrefixLength(queryWord, fieldWord) >= MIN_SHARED_PREFIX;
}

export type MatchableProduct = {
  id: string;
  name: string;
  activeSubstance: string;
  category: string;
  useFor: string;
};

function fieldKeywords(text: string): string[] {
  return words(text).filter((w) => w.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(w));
}

function bestWeight(queryWord: string, product: MatchableProduct): number {
  const fields: [keyof typeof WEIGHTS, string][] = [
    ["name", product.name],
    ["activeSubstance", product.activeSubstance],
    ["useFor", product.useFor],
    ["category", product.category],
  ];
  let best = 0;
  for (const [field, value] of fields) {
    if (WEIGHTS[field] > best && fieldKeywords(value).some((fw) => wordsMatch(queryWord, fw))) {
      best = WEIGHTS[field];
    }
  }
  return best;
}

export function scoreProduct(keywords: readonly string[], product: MatchableProduct): number {
  return keywords.reduce((sum, word) => sum + bestWeight(word, product), 0);
}

const byScoreThenName = <T extends { score: number; product: { name: string } }>(a: T, b: T) =>
  b.score - a.score || a.product.name.localeCompare(b.product.name, "en");

export type MatchResult<P extends MatchableProduct> = {
  mode: "exact-name" | "scored" | "none";
  matches: { product: P; score: number }[];
};

/** True when the message contains the complete name of one of the products. */
export function findCompleteProductName<P extends MatchableProduct>(query: string, products: readonly P[]): P | null {
  const haystack = ` ${normaliseText(query)} `;
  let best: P | null = null;
  for (const product of products) {
    const name = normaliseText(product.name);
    if (name !== "" && haystack.includes(` ${name} `) && (!best || name.length > normaliseText(best.name).length)) {
      best = product;
    }
  }
  return best;
}

export function matchProducts<P extends MatchableProduct>(query: string, products: readonly P[]): MatchResult<P> {
  const exact = findCompleteProductName(query, products);
  if (exact) return { mode: "exact-name", matches: [{ product: exact, score: Number.MAX_SAFE_INTEGER }] };

  const keywords = queryKeywords(query);
  const scored = products
    .map((product) => ({ product, score: scoreProduct(keywords, product) }))
    .filter((entry) => entry.score > 0)
    .sort(byScoreThenName)
    .slice(0, MAX_RESULTS);
  return { mode: scored.length ? "scored" : "none", matches: scored };
}

/** Seeded (ownerId null) and the current owner's custom products only. */
export function filterVisibleProducts<P extends { ownerId: string | null }>(products: readonly P[], ownerId: string | null): P[] {
  return products.filter((p) => p.ownerId === null || (ownerId !== null && p.ownerId === ownerId));
}

/** Whether the message names an identifiable product (name or active substance). */
export function mentionsIdentifiableProduct<P extends MatchableProduct>(query: string, products: readonly P[]): boolean {
  if (findCompleteProductName(query, products)) return true;
  const keywords = queryKeywords(query);
  return products.some((product) =>
    keywords.some((word) => {
      const fields = [...fieldKeywords(product.name), ...fieldKeywords(product.activeSubstance)];
      return fields.some((fw) => wordsMatch(word, fw));
    }),
  );
}
