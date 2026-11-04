import { describe, expect, it } from "vitest";
import { buildAnswer, enforceSafetyFloor, levelFor, selectFacts, type AnswerProduct } from "@/lib/response/pipeline";
import { createSnapshots, isProductSnapshot, parseSnapshots } from "@/lib/response/snapshots";
import { SAFETY_TEXT } from "@/lib/safety/rules";
import { CHAT_MODELS, type ChatModelValue } from "@/lib/validation";
import { customProduct, seededProducts } from "./fixtures";

const products = seededProducts() as AnswerProduct[];
const PHARMACIST_LINE = "Ask a pharmacist if you’re unsure.";

const PERSONAS = ["customer-guide", "learning-coach", "product-expert"] as const;
const TEMPERATURES = [0.2, 0.5, 0.9] as const; // low, medium, high
const TOP_PS = [0.2, 0.5, 0.9] as const;

const ask = (
  message: string,
  over: { persona?: string | null; model?: ChatModelValue; temperature?: number; topP?: number; hasAttachment?: boolean; list?: AnswerProduct[] } = {},
) =>
  buildAnswer({
    message,
    products: over.list ?? products,
    personaSeedKey: over.persona === undefined ? "customer-guide" : over.persona,
    settings: { model: over.model ?? "GPT4_STYLE", temperature: over.temperature ?? 0.5, topP: over.topP ?? 0.5 },
    hasAttachment: over.hasAttachment,
  });

const ibuprofen = products.find((p) => p.id === "ibuprofen-400mg-tablets")!;

describe("levels", () => {
  it("maps 0.0–0.3 / 0.4–0.7 / 0.8–1.0 to low / medium / high", () => {
    const expected: Record<string, string> = { "0": "low", "0.3": "low", "0.4": "medium", "0.7": "medium", "0.8": "high", "1": "high" };
    for (const [value, level] of Object.entries(expected)) expect(levelFor(Number(value))).toBe(level);
  });
});

describe("safety floor across all 81 combinations", () => {
  const combos = PERSONAS.flatMap((persona) =>
    CHAT_MODELS.flatMap((model) =>
      TEMPERATURES.flatMap((temperature) => TOP_PS.map((topP) => ({ persona, model, temperature, topP }))),
    ),
  );

  it("covers 81 combinations", () => expect(combos).toHaveLength(81));

  it.each(combos.map((c) => [`${c.persona} / ${c.model} / T${c.temperature} / P${c.topP}`, c] as const))(
    "%s keeps the tip and the pharmacist line",
    (_label, c) => {
      for (const message of ["Ibuprofen 400 mg tablets", "What helps with hay fever?", "How should I take paracetamol?"]) {
        const answer = ask(message, c);
        expect(answer.kind).toBe("answer");
        for (const product of answer.products) {
          expect(answer.content).toContain(product.tip);
        }
        expect(answer.content.endsWith(PHARMACIST_LINE)).toBe(true);
        expect(answer.content.split(PHARMACIST_LINE)).toHaveLength(2); // exactly once
      }
    },
  );

  it("does not fabricate a tip for a product without one, but keeps the pharmacist line", () => {
    const noTip = customProduct({ ownerId: "o", id: "nt", name: "Plain balm", activeSubstance: "plainium", useFor: "Itching", tip: "" }) as AnswerProduct;
    for (const c of combos) {
      const answer = ask("itching", { ...c, list: [noTip] });
      expect(answer.content).not.toMatch(/bTip:|Friendly tip:|Important:/);
      expect(answer.content.endsWith(PHARMACIST_LINE)).toBe(true);
    }
  });

  it("the final validation step re-adds a missing tip and the closing line", () => {
    const fixed = enforceSafetyFloor("Some text without the tip.", [ibuprofen]);
    expect(fixed).toContain(ibuprofen.tip);
    expect(fixed.endsWith(PHARMACIST_LINE)).toBe(true);
    expect(enforceSafetyFloor(`x\n\n${PHARMACIST_LINE}`, []).split(PHARMACIST_LINE)).toHaveLength(2);
  });
});

describe("Top-P detail level", () => {
  const facts = (topP: number, hide = false) => selectFacts(ibuprofen, levelFor(topP), hide).map((f) => f.key);

  it("low: intended use plus tip only", () => expect(facts(0.2)).toEqual(["useFor", "tip"]));
  it("medium: safety floor plus usage instructions", () => expect(facts(0.5)).toEqual(["useFor", "howToUse", "tip"]));
  it("high: adds active substance and category", () =>
    expect(facts(0.9)).toEqual(["activeSubstance", "category", "useFor", "howToUse", "tip"]));
  it("never shows usage instructions when dosing is hidden", () => expect(facts(0.9, true)).not.toContain("howToUse"));

  it("changes visible detail without changing the facts that are shown", () => {
    const low = ask("Ibuprofen 400 mg tablets", { topP: 0.2 }).content;
    const mid = ask("Ibuprofen 400 mg tablets", { topP: 0.5 }).content;
    const high = ask("Ibuprofen 400 mg tablets", { topP: 0.9 }).content;
    expect(low).not.toContain(ibuprofen.howToUse);
    expect(mid).toContain(ibuprofen.howToUse);
    expect(mid).not.toContain(ibuprofen.activeSubstance + "\n");
    expect(high).toContain(ibuprofen.howToUse);
    expect(high).toContain(ibuprofen.category);
    for (const text of [low, mid, high]) {
      expect(text).toContain(ibuprofen.useFor);
      expect(text).toContain(ibuprofen.tip);
    }
    expect(low.length).toBeLessThan(mid.length);
    expect(mid.length).toBeLessThan(high.length);
  });
});

describe("Temperature wording", () => {
  it("low is direct, medium conversational, high friendlier with an example", () => {
    const low = ask("Ibuprofen 400 mg tablets", { temperature: 0.2 }).content;
    const mid = ask("Ibuprofen 400 mg tablets", { temperature: 0.5 }).content;
    const high = ask("Ibuprofen 400 mg tablets", { temperature: 0.9 }).content;
    expect(low).toContain("Used for: Pain, fever, inflammation");
    expect(mid).toContain("It is used for Pain, fever, inflammation.");
    expect(high).toMatch(/Happy to help!/);
    expect(high).toMatch(/For example, it is listed for pain/);
    expect(new Set([low, mid, high]).size).toBe(3);
  });

  it("changes wording for every persona without changing the facts", () => {
    for (const persona of PERSONAS) {
      const texts = TEMPERATURES.map((temperature) => ask("Ibuprofen 400 mg tablets", { persona, temperature }).content);
      expect(new Set(texts).size).toBe(3);
      for (const text of texts) {
        expect(text).toContain(ibuprofen.useFor);
        expect(text).toContain(ibuprofen.tip);
      }
    }
  });
});

describe("simulated model style", () => {
  const get = (model: ChatModelValue) => ask("Ibuprofen 400 mg tablets", { model }).content;

  it("GPT-4 style: balanced with practical bullet points", () => expect(get("GPT4_STYLE")).toContain("• "));
  it("Claude style: more explanatory and contextual", () => {
    expect(get("CLAUDE_STYLE")).toContain("Context:");
    expect(get("CLAUDE_STYLE").length).toBeGreaterThan(get("GPT4_STYLE").length);
  });
  it("Llama style: concise, short sentences, no bullets", () => {
    expect(get("LLAMA_STYLE")).not.toContain("•");
    expect(get("LLAMA_STYLE").length).toBeLessThan(get("CLAUDE_STYLE").length);
  });
  it("never claims a real model produced the answer", () => {
    for (const model of CHAT_MODELS) expect(get(model)).not.toMatch(/GPT|Claude|Llama|OpenAI|Anthropic|Meta/i);
  });
  it("keeps the same product facts in every style", () => {
    for (const model of CHAT_MODELS) {
      expect(get(model)).toContain(ibuprofen.useFor);
      expect(get(model)).toContain(ibuprofen.tip);
    }
  });
});

describe("persona behaviour is chosen by seedKey", () => {
  it("New Employee (learning-coach) adds a counselling tip", () => {
    expect(ask("Ibuprofen 400 mg tablets", { persona: "learning-coach" }).content).toContain("Counselling tip:");
    expect(ask("Ibuprofen 400 mg tablets", { persona: "customer-guide" }).content).not.toContain("Counselling tip:");
  });

  it("Pharmacist (product-expert) gives a short structured summary", () => {
    const text = ask("Ibuprofen 400 mg tablets", { persona: "product-expert", temperature: 0.9 }).content;
    expect(text).toContain("summary:");
    expect(text).toContain("Used for: ");
    expect(text).toContain("Tip: ");
  });

  it("custom personas and null use the neutral Customer tone", () => {
    const customer = ask("Ibuprofen 400 mg tablets", { persona: "customer-guide" }).content;
    expect(ask("Ibuprofen 400 mg tablets", { persona: null }).content).toBe(customer);
    expect(ask("Ibuprofen 400 mg tablets", { persona: "not-a-reserved-key" }).content).toBe(customer);
  });
});

describe("answers are deterministic and product-led", () => {
  it("returns the identical answer for identical inputs", () => {
    expect(ask("What helps with hay fever?")).toEqual(ask("What helps with hay fever?"));
  });

  it("leads with the best match, presents several as possible matches, never recommends", () => {
    const answer = ask("pain");
    expect(answer.products.map((p) => p.name)).toEqual(["Ibuprofen 400 mg tablets", "Paracetamol 500 mg tablets"]);
    expect(answer.content).toMatch(/may be relevant|Possible matches/);
    expect(answer.content).not.toMatch(/\b(best|recommend|you should|better)\b/i);
  });

  it("returns at most three products", () => {
    expect(ask("fever").products.length).toBeLessThanOrEqual(3);
  });

  it("an unknown question says it does not know and suggests a pharmacist", () => {
    const answer = ask("xyzzy");
    expect(answer.kind).toBe("no-match");
    expect(answer.products).toEqual([]);
    expect(answer.content).toBe(SAFETY_TEXT.noMatch);
  });
});

describe("safety guard inside the pipeline", () => {
  it("emergency returns only the fixed message: no cards, dosing or styled output", () => {
    for (const model of CHAT_MODELS) {
      const answer = ask("My throat is swelling after taking ibuprofen.", { model, persona: "learning-coach", temperature: 0.9, topP: 0.9 });
      expect(answer).toEqual({ content: SAFETY_TEXT.emergency, products: [], kind: "emergency", hideDosing: true });
    }
  });

  it("emergency also ignores an attachment note", () => {
    expect(ask("I have chest pain and my arm is numb", { hasAttachment: true }).content).toBe(SAFETY_TEXT.emergency);
  });

  it("special-group questions remove dosing, keep the tip and add the notice once", () => {
    const answer = ask("How should I take ibuprofen while pregnant?", { topP: 0.9 });
    expect(answer.hideDosing).toBe(true);
    expect(answer.content).not.toContain(ibuprofen.howToUse);
    expect(answer.content).toContain(ibuprofen.tip);
    expect(answer.content.split(SAFETY_TEXT.specialGroup)).toHaveLength(2);
    expect(answer.content.endsWith(PHARMACIST_LINE)).toBe(true);
  });

  it("personal-advice questions get the notice and general info without a recommendation", () => {
    const answer = ask("Should I take ibuprofen?");
    expect(answer.content.startsWith(SAFETY_TEXT.personalAdvice) || answer.content.includes(SAFETY_TEXT.personalAdvice)).toBe(true);
    expect(answer.content).toContain(ibuprofen.tip);
    expect(answer.content).not.toMatch(/you should take|I recommend/i);
  });

  it("overlapping diagnosis and special-group rules apply both restrictions without duplicates", () => {
    const answer = ask("I am pregnant, should I take ibuprofen?", { topP: 0.9 });
    expect(answer.content.split(SAFETY_TEXT.personalAdvice)).toHaveLength(2);
    expect(answer.content.split(SAFETY_TEXT.specialGroup)).toHaveLength(2);
    expect(answer.content).not.toContain(ibuprofen.howToUse);
  });

  it("normal welcome-example questions return normal answers", () => {
    expect(ask("What helps with hay fever?").content).not.toContain(SAFETY_TEXT.personalAdvice);
    const usage = ask("How should I take ibuprofen?", { topP: 0.5 });
    expect(usage.content).not.toContain(SAFETY_TEXT.personalAdvice);
    expect(usage.content).toContain(ibuprofen.howToUse);
    expect(ask("Which products contain paracetamol?").products).toHaveLength(1);
    expect(ask("What helps with allergies?").content).not.toContain(SAFETY_TEXT.specialGroup);
  });
});

describe("attachments", () => {
  it("answer normally and add the demo note", () => {
    const answer = ask("Ibuprofen 400 mg tablets", { hasAttachment: true });
    expect(answer.content).toContain(SAFETY_TEXT.attachmentNote);
    expect(answer.content).toContain(ibuprofen.tip);
    expect(answer.content.endsWith(PHARMACIST_LINE)).toBe(true);
    expect(ask("Ibuprofen 400 mg tablets").content).not.toContain(SAFETY_TEXT.attachmentNote);
  });

  it("also adds the note to a no-match answer", () => {
    expect(ask("xyzzy", { hasAttachment: true }).content).toContain(SAFETY_TEXT.attachmentNote);
  });
});

describe("product snapshots", () => {
  const mine = customProduct({ ownerId: "owner-a", id: "m", name: "Mine" });
  const theirs = customProduct({ ownerId: "owner-b", id: "t", name: "Theirs" });

  it("snapshots only owner-visible products, at most three, labelled seeded or custom", () => {
    const shots = createSnapshots([mine, theirs, ...products], "owner-a", false);
    expect(shots).toHaveLength(3);
    expect(shots.map((s) => s.productId)).not.toContain("t");
    expect(shots[0]).toMatchObject({ productId: "m", source: "custom" });
    expect(shots[1].source).toBe("seeded");
  });

  it("withholds how-to-use when dosing is hidden", () => {
    expect(createSnapshots([ibuprofen], null, true)[0].howToUse).toBeNull();
    expect(createSnapshots([ibuprofen], null, false)[0].howToUse).toBe(ibuprofen.howToUse);
  });

  it("copies values, so later edits to the product do not change a snapshot", () => {
    const original = { ...ibuprofen };
    const [shot] = createSnapshots([original], null, false);
    original.name = "Renamed";
    original.tip = "Changed";
    expect(shot.name).toBe("Ibuprofen 400 mg tablets");
    expect(shot.tip).toBe(ibuprofen.tip);
  });

  it("validates structure and drops malformed or legacy data safely", () => {
    const [good] = createSnapshots([ibuprofen], null, false);
    expect(isProductSnapshot(good)).toBe(true);
    expect(parseSnapshots([good, { name: "bad" }, null, 7])).toEqual([good]);
    expect(parseSnapshots(null)).toEqual([]);
    expect(parseSnapshots("oops")).toEqual([]);
    expect(parseSnapshots({ not: "an array" })).toEqual([]);
    expect(parseSnapshots([good, good, good, good])).toHaveLength(3);
  });
});
