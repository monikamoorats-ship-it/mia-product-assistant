import { describe, expect, it } from "vitest";
import {
  QUIZ_LENGTH,
  buildCandidates,
  generateQuiz,
  isValidQuiz,
  normaliseValue,
  useForTerms,
  type QuizProduct,
} from "@/lib/quiz";
import { filterVisibleProducts } from "@/lib/matching";
import { customProduct, seededProducts } from "./fixtures";

/** Seeded RNG so selection is repeatable. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seeded = seededProducts();
const product = (over: Partial<QuizProduct> & { id: string }): QuizProduct => ({
  name: over.id,
  activeSubstance: `${over.id}-substance`,
  category: `${over.id}-category`,
  useFor: `${over.id}-use`,
  tip: `${over.id}-tip`,
  ...over,
});
const texts = (list: QuizProduct[], template?: number) =>
  buildCandidates(list).filter((c) => !template || c.template === template).map((c) => c.text);

describe("normalisation", () => {
  it("splits use-for on commas, semicolons and slashes, trims, lowercases and drops empties", () => {
    expect(useForTerms("Pain,  Fever;  Hay  Fever / Itchy eyes. , ")).toEqual(["pain", "fever", "hay fever", "itchy eyes"]);
  });
  it("normalises case, whitespace and trailing punctuation", () => {
    expect(normaliseValue("  Drink   plenty of FLUIDS. ")).toBe("drink plenty of fluids");
  });
});

describe("use-for questions", () => {
  it("do not use shared terms: pain and fever", () => {
    const t = texts(seeded, 1);
    expect(t).not.toContain("Which product is used for pain?");
    expect(t).not.toContain("Which product is used for fever?");
  });

  it("use a unique term such as inflammation (Ibuprofen)", () => {
    const candidate = buildCandidates(seeded).find((c) => c.text === "Which product is used for inflammation?");
    expect(candidate?.correct).toBe("Ibuprofen 400 mg tablets");
    expect(candidate?.distractors).not.toContain("Ibuprofen 400 mg tablets");
  });

  it("keeps a product eligible through its unique terms when other terms are shared", () => {
    const ibuprofenQuestions = buildCandidates(seeded).filter((c) => c.template === 1 && c.productId === "ibuprofen-400mg-tablets");
    expect(ibuprofenQuestions.map((c) => c.text)).toEqual(["Which product is used for inflammation?"]);
  });

  it("excludes a product with no unique term from this template only", () => {
    const a = product({ id: "a", useFor: "Cough, Cold" });
    const b = product({ id: "b", useFor: "cold; cough" });
    const rest = ["c", "d", "e"].map((id) => product({ id }));
    const list = [a, b, ...rest];
    expect(buildCandidates(list).some((c) => c.template === 1 && (c.productId === "a" || c.productId === "b"))).toBe(false);
    expect(buildCandidates(list).some((c) => c.template === 2 && c.productId === "a")).toBe(true);
  });

  it("treats equivalent duplicate use-for values as ambiguous (case, whitespace, punctuation)", () => {
    const list = [product({ id: "a", useFor: "Blocked nose" }), product({ id: "b", useFor: "blocked   NOSE." }), ...["c", "d", "e"].map((id) => product({ id }))];
    expect(texts(list, 1)).not.toContain("Which product is used for blocked nose?");
  });

  it("never offers a distractor that is also correct", () => {
    for (const c of buildCandidates(seeded).filter((x) => x.template === 1)) {
      const term = c.text.replace("Which product is used for ", "").replace("?", "");
      for (const d of c.distractors) {
        const owner = seeded.find((p) => p.name === d)!;
        expect(useForTerms(owner.useFor)).not.toContain(term);
      }
    }
  });
});

describe("tip questions", () => {
  it("are generated for unique tips", () => {
    expect(texts(seeded, 4)).toHaveLength(7);
  });

  it("exclude duplicate tips (normalised) and empty tips", () => {
    const list = [
      product({ id: "a", tip: "Take with food." }),
      product({ id: "b", tip: "take  WITH food" }),
      product({ id: "c", tip: "" }),
      ...["d", "e", "f"].map((id) => product({ id })),
    ];
    const t = buildCandidates(list).filter((c) => c.template === 4).map((c) => c.productId);
    expect(t).not.toContain("a");
    expect(t).not.toContain("b");
    expect(t).not.toContain("c");
    expect(t).toContain("d");
  });

  it("never split tips into keywords", () => {
    const list = [product({ id: "a", tip: "Take with food daily" }), product({ id: "b", tip: "Take with water daily" }), ...["c", "d", "e"].map((id) => product({ id }))];
    expect(texts(list, 4)).toHaveLength(5);
  });
});

describe("active substance and category questions", () => {
  it("duplicate active substances do not produce duplicate options", () => {
    const list = [
      product({ id: "a", activeSubstance: "Zinc" }),
      product({ id: "b", activeSubstance: "zinc " }),
      product({ id: "c" }),
      product({ id: "d" }),
      product({ id: "e" }),
    ];
    for (const c of buildCandidates(list).filter((x) => x.template === 2)) {
      const keys = [c.correct, ...c.distractors].map(normaliseValue);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("are excluded when fewer than four distinct values exist", () => {
    const list = [1, 2, 3, 4, 5].map((n) => product({ id: `p${n}`, activeSubstance: n <= 3 ? "same" : `other${n}`, category: "Same category" }));
    expect(texts(list, 3)).toEqual([]); // one category only
    // 3 distinct substances (same, other4, other5) => fewer than four values => no template-2 questions
    expect(texts(list, 2)).toEqual([]);
  });

  it("ambiguous product names do not produce substance or category questions", () => {
    const list = [product({ id: "a", name: "Balm", activeSubstance: "x" }), product({ id: "b", name: "balm", activeSubstance: "y" }), ...["c", "d", "e"].map((id) => product({ id }))];
    expect(buildCandidates(list).filter((c) => c.productId === "a" || c.productId === "b")).toEqual([]);
  });
});

describe("generateQuiz", () => {
  it("builds exactly five valid questions from the seeded catalogue", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const quiz = generateQuiz(seeded, mulberry32(seed));
      expect(quiz).not.toBeNull();
      expect(quiz).toHaveLength(QUIZ_LENGTH);
      expect(isValidQuiz(quiz!)).toBe(true);
    }
  });

  it("is repeatable for the same RNG seed", () => {
    expect(generateQuiz(seeded, mulberry32(42))).toEqual(generateQuiz(seeded, mulberry32(42)));
  });

  it("has four distinct options per question with the correct answer included once", () => {
    for (const q of generateQuiz(seeded, mulberry32(7))!) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map(normaliseValue)).size).toBe(4);
      expect(q.options[q.correctIndex]).toBeTruthy();
    }
  });

  it("builds explanations only from the product data", () => {
    for (const seed of [3, 4, 5, 6]) {
      for (const q of generateQuiz(seeded, mulberry32(seed))!) {
        // Every explanation names a real product and restates that product's own data.
        const subject = seeded.find((p) => q.explanation.includes(p.name));
        expect(subject).toBeDefined();
        const answer = q.options[q.correctIndex];
        const restated = [subject!.useFor, subject!.activeSubstance, subject!.category, subject!.tip];
        expect(restated.some((value) => q.explanation.includes(value))).toBe(true);
        expect(answer).toBeTruthy();
      }
    }
  });

  it("prefers five different products", () => {
    const quiz = generateQuiz(seeded, mulberry32(11))!;
    const subjects = quiz.map((q) => q.explanation.split(" ")[0]);
    expect(new Set(subjects).size).toBeGreaterThanOrEqual(4);
  });

  it("does not repeat question text", () => {
    const quiz = generateQuiz(seeded, mulberry32(5))!;
    expect(new Set(quiz.map((q) => q.text)).size).toBe(5);
  });

  it("returns null (quiz locked) with fewer than four visible products", () => {
    expect(generateQuiz(seeded.slice(0, 3), mulberry32(1))).toBeNull();
    expect(generateQuiz([], mulberry32(1))).toBeNull();
  });

  it("returns null with four+ products that cannot yield four distinct options or five questions", () => {
    const same = [1, 2, 3, 4, 5, 6].map((n) => product({ id: `p${n}`, name: "Same", activeSubstance: "same", category: "same", useFor: "same", tip: "same" }));
    expect(generateQuiz(same, mulberry32(1))).toBeNull();
    const fewValid = seeded.slice(0, 4);
    const quiz = generateQuiz(fewValid, mulberry32(1));
    if (quiz) expect(isValidQuiz(quiz)).toBe(true);
  });

  it("only uses products visible to the owner", () => {
    const mine = customProduct({ ownerId: "owner-a", id: "mine", name: "My unique balm", activeSubstance: "balmium", useFor: "Dry skin", tip: "Use daily" });
    const theirs = customProduct({ ownerId: "owner-b", id: "theirs", name: "Their secret balm", activeSubstance: "secretium", useFor: "Secret skin", tip: "Secret tip" });
    const visible = filterVisibleProducts([...seeded, mine, theirs], "owner-a");
    for (let seed = 1; seed <= 30; seed++) {
      const json = JSON.stringify(generateQuiz(visible, mulberry32(seed)));
      expect(json).not.toContain("Their secret balm");
      expect(json).not.toContain("secretium");
    }
    expect(buildCandidates(visible).some((c) => c.productId === "mine")).toBe(true);
  });
});
