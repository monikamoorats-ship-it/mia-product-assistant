/**
 * ALL safety patterns and fixed responses live in this one file.
 *
 * Patterns run against NORMALISED text (see normaliseForSafety) BEFORE stop
 * words are removed. Apostrophes are deleted during normalisation, so write
 * "im allergic", "whats wrong with me" and "is this safe for me".
 *
 * LIMITATIONS: this is a conservative keyword net, not a medical triage tool.
 * It will miss some phrasings (typos, other languages, indirect wording) and
 * prefers false positives over unsafe product suggestions. It does not detect
 * every medical risk.
 *
 * Priority (highest first): emergency > diagnosis/personal advice >
 * special group/interaction > normal product matching.
 */

export const SAFETY_TEXT = {
  emergency:
    "This may be urgent. Contact your local emergency number or a doctor right away.",
  personalAdvice:
    "I can’t diagnose conditions or give personal medical advice. I can only show general information from the demo product catalogue.",
  specialGroup:
    "This demo does not provide dosing or suitability advice for this situation. Please ask a pharmacist or doctor.",
  pharmacistLine: "Ask a pharmacist if you’re unsure.",
  noMatch:
    "I couldn’t find a matching product in this demo. Ask a pharmacist if you’re unsure.",
  attachmentNote: "I can’t read attachments in this demo version.",
} as const;

/** Emergency or crisis. A match stops all processing. */
export const EMERGENCY_PATTERNS: readonly RegExp[] = [
  // chest pain with arm/jaw symptoms (either order)
  /\bchest (pain|pains|pressure|tightness)\b.*\b(arm|arms|jaw|shoulder)\b/,
  /\b(arm|arms|jaw|shoulder)\b.*\bchest (pain|pains|pressure|tightness)\b/,
  /\bheart attack\b/,
  /\bstroke\b/,
  // severe breathing difficulty
  /\b(trouble|difficulty|struggling|hard|unable|not able|cant|cannot|severe|serious)\b.{0,25}\bbreath(e|ing)?\b/,
  /\b(cant|cannot) breathe\b/,
  /\bshort(ness)? of breath\b/,
  /\bgasping\b/,
  // overdose and poisoning
  /\boverdos(e|ed|ing)\b/,
  /\btook too (many|much)\b/,
  /\b(swallowed|taken|ate|eaten) too (many|much)\b/,
  /\bpoison(ed|ing|ous)?\b/,
  // severe allergic swelling
  /\b(throat|tongue|lip|lips|face|mouth)\b.{0,30}\b(swell|swells|swelling|swollen|closing)\b/,
  /\b(swell|swells|swelling|swollen)\b.{0,30}\b(throat|tongue|lip|lips|face|mouth)\b/,
  /\banaphyla(xis|ctic)\b/,
  // unconsciousness and collapse
  /\b(unconscious|unresponsive|passed out|collapsed|not responding|wont wake|wont wake up|seizure|seizures|convulsion|convulsions)\b/,
  /\bsevere bleeding\b|\bbleeding (heavily|badly)\b/,
  // immediate self-harm or suicide risk
  /\bsuicid(e|al)\b/,
  /\b(kill|hurt|harm|end) (myself|my life)\b/,
  /\bwant to die\b|\bdont want to (live|be alive)\b|\bself harm\b/,
];

/** Diagnosis or personal medical advice. */
export const PERSONAL_ADVICE_PATTERNS: readonly RegExp[] = [
  /\bdo i have\b/,
  /\bwhat is wrong with me\b|\bwhats wrong with me\b|\bwhat is wrong with my\b/,
  /\bshould i take\b/,
  /\bis (this|it|that) safe for me\b/,
  /\bwhich (medicine|medicines|medication|medications|drug|drugs|product|products|tablet|tablets|pill|pills) should i (use|take)\b/,
  /\bwhat should i (take|use)\b/,
];

/**
 * Allowed general usage questions. When the message names an identifiable
 * product, these phrases are removed BEFORE the personal-advice patterns run,
 * so only the diagnosis/personal-choice guard is bypassed. They never bypass
 * the emergency guard, special-group rules, interactions or other personal
 * risk context.
 */
export const ALLOWED_USAGE_PATTERNS: readonly RegExp[] = [
  /\bhow should i take\b/g,
  /\bhow do i take\b/g,
  /\bhow should i use\b/g,
  /\bhow do i use\b/g,
];

/** Special-group and medicine-interaction context. */
export const SPECIAL_GROUP_PATTERNS: readonly RegExp[] = [
  // children
  /\b(child|children|kid|kids|baby|babies|toddler|toddlers|infant|infants|newborn|newborns|my son|my daughter|teenager)\b/,
  /\b\d{1,2} ?(month|months|week|weeks) old\b/,
  // pregnancy and breastfeeding
  /\b(pregnant|pregnancy|breastfeed|breastfeeding|breast feeding|nursing mother|lactating|expecting a baby)\b/,
  // elderly
  /\b(elderly|older adult|older adults|senior|seniors|pensioner|old age)\b/,
  // kidney and liver conditions
  /\b(kidney|kidneys|renal|liver|hepatic|hepatitis|cirrhosis)\b/,
  // personal allergy (the bare topic words "allergy"/"allergies" do NOT match)
  /\b(im|i am) allergic\b|\ballergic to\b|\bmy allergy\b|\bmy allergies\b|\ballergy to\b|\ballergies to\b/,
  // other medicines, combinations, interactions, alcohol
  /\binteract(s|ion|ions)?\b/,
  /\bother (medicine|medicines|medication|medications|drug|drugs|pill|pills|tablet|tablets)\b/,
  /\b(combine|combined|combining|mix|mixed|mixing)\b.*\b(with|and)\b/,
  /\b(together with|at the same time|alongside|on top of|while taking)\b/,
  /\balcohol\b/,
];

/** "<n> years old" style ages, handled separately because the limits are numeric. */
export const YEARS_OLD_PATTERN = /\b(\d{1,3}) ?(?:year|years|yr|yrs|yo) ?old\b|\baged (\d{1,3})\b/;
export const CHILD_MAX_AGE = 17;
export const ELDERLY_MIN_AGE = 65;
