import {
  ALLOWED_USAGE_PATTERNS,
  CHILD_MAX_AGE,
  ELDERLY_MIN_AGE,
  EMERGENCY_PATTERNS,
  PERSONAL_ADVICE_PATTERNS,
  SAFETY_TEXT,
  SPECIAL_GROUP_PATTERNS,
  YEARS_OLD_PATTERN,
} from "./rules";

/**
 * Normalises a message for phrase matching: lowercase, apostrophes removed
 * (so "I'm" -> "im"), all other punctuation turned into spaces, whitespace
 * collapsed. Stop words are NOT removed here.
 */
export function normaliseForSafety(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’‘`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type SafetyDecision =
  | { kind: "emergency"; response: string }
  | {
      kind: "proceed";
      /** Diagnosis / personal-advice notice must be shown. */
      personalAdvice: boolean;
      /** Special-group or interaction context: remove dosing, add notice. */
      specialGroup: boolean;
      /** The message was an allowed general "how do I take/use [product]" question. */
      allowedUsageQuestion: boolean;
    };

function matchesAny(patterns: readonly RegExp[], text: string): boolean {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0; // patterns with the g flag are stateful
    return pattern.test(text);
  });
}

function ageFlags(text: string): { child: boolean; elderly: boolean } {
  const match = YEARS_OLD_PATTERN.exec(text);
  if (!match) return { child: false, elderly: false };
  const age = Number(match[1] ?? match[2]);
  return { child: age <= CHILD_MAX_AGE, elderly: age >= ELDERLY_MIN_AGE };
}

/**
 * Evaluates a message in strict priority order:
 *   1. emergency/crisis -> stop immediately
 *   2. diagnosis / personal advice
 *   3. special group / interaction context
 *   4. normal product matching (kind "proceed" with no flags)
 *
 * `productMentioned` says whether the message names an identifiable product;
 * it only enables the allowed general-usage exception.
 */
export function evaluateSafety(message: string, options: { productMentioned: boolean }): SafetyDecision {
  const text = normaliseForSafety(message);

  if (matchesAny(EMERGENCY_PATTERNS, text)) {
    return { kind: "emergency", response: SAFETY_TEXT.emergency };
  }

  // Allowed usage phrases bypass ONLY the personal-advice check.
  let adviceText = text;
  let allowedUsageQuestion = false;
  if (options.productMentioned) {
    for (const pattern of ALLOWED_USAGE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(adviceText)) allowedUsageQuestion = true;
      pattern.lastIndex = 0;
      adviceText = adviceText.replace(pattern, " ");
    }
  }
  const personalAdvice = matchesAny(PERSONAL_ADVICE_PATTERNS, adviceText);

  const ages = ageFlags(text);
  const specialGroup = ages.child || ages.elderly || matchesAny(SPECIAL_GROUP_PATTERNS, text);

  return {
    kind: "proceed",
    personalAdvice,
    specialGroup,
    allowedUsageQuestion: allowedUsageQuestion && !personalAdvice && !specialGroup,
  };
}
