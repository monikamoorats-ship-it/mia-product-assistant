import { describe, expect, it } from "vitest";
import { evaluateSafety, normaliseForSafety } from "@/lib/safety/guard";
import { SAFETY_TEXT } from "@/lib/safety/rules";

const named = { productMentioned: true };
const generic = { productMentioned: false };

const emergency = (text: string, options = generic) => evaluateSafety(text, options).kind === "emergency";

function flags(text: string, options = named) {
  const d = evaluateSafety(text, options);
  if (d.kind !== "proceed") throw new Error(`expected proceed for: ${text}`);
  return d;
}

describe("normalisation", () => {
  it("removes apostrophes and punctuation before matching", () => {
    expect(normaliseForSafety("I’m ALLERGIC to it!!")).toBe("im allergic to it");
  });
});

describe("emergency guard (highest priority)", () => {
  it.each([
    "I have chest pain and my arm is numb",
    "my arm hurts and i have chest pressure",
    "I have trouble breathing",
    "I can't breathe properly",
    "severe difficulty breathing after the tablet",
    "My throat is swelling after taking ibuprofen.",
    "my lips and face are swollen",
    "I think it was an overdose",
    "my child took too many tablets",
    "is this poisoning?",
    "he is unconscious",
    "she passed out",
    "I want to kill myself",
    "i dont want to live anymore",
    "suicidal thoughts",
  ])("stops on: %s", (text) => {
    const decision = evaluateSafety(text, named);
    expect(decision).toEqual({ kind: "emergency", response: SAFETY_TEXT.emergency });
  });

  it("wins over overlapping product keywords and other guards", () => {
    expect(emergency("I have chest pain in my arm, should I take ibuprofen?", named)).toBe(true);
    expect(emergency("I'm pregnant and my throat is swelling after paracetamol", named)).toBe(true);
  });

  it("response is only the fixed urgent message", () => {
    const d = evaluateSafety("overdose of paracetamol", named);
    expect(d.kind === "emergency" && d.response).toBe(
      "This may be urgent. Contact your local emergency number or a doctor right away.",
    );
  });
});

describe("diagnosis and personal-advice guard", () => {
  it.each([
    "Do I have hay fever?",
    "What is wrong with me?",
    "What's wrong with me",
    "Should I take ibuprofen?",
    "Is this safe for me?",
    "Which medicine should I use for this?",
    "What should I take for this pain?",
  ])("flags: %s", (text) => {
    expect(flags(text).personalAdvice).toBe(true);
  });

  it("an allowed usage question does not trigger it", () => {
    const d = flags("How should I take ibuprofen?");
    expect(d.personalAdvice).toBe(false);
    expect(d.specialGroup).toBe(false);
    expect(d.allowedUsageQuestion).toBe(true);
  });

  it.each([
    "How do I take paracetamol?",
    "How should I use xylometazoline?",
    "How do I use omeprazole",
  ])("allowed usage: %s", (text) => {
    expect(flags(text).personalAdvice).toBe(false);
  });

  it("the exception needs an identifiable product", () => {
    expect(flags("How should I take it?", generic).personalAdvice).toBe(true);
  });

  it("should I take is still blocked even when a product is named", () => {
    expect(flags("Should I take ibuprofen?").personalAdvice).toBe(true);
  });
});

describe("special-group and interaction guard", () => {
  it.each([
    "How much ibuprofen can I give my child?",
    "dosage for a baby",
    "my toddler has a fever, paracetamol?",
    "ibuprofen for a 3 year old",
    "paracetamol for an 8 months old",
    "I am pregnant, can I take omeprazole?",
    "is it ok while breastfeeding",
    "ibuprofen for elderly people",
    "my 80 year old mother",
    "I have kidney problems",
    "liver disease and paracetamol",
    "I am allergic to ibuprofen",
    "I'm allergic to aspirin",
    "my allergies are bad",
    "allergy to penicillin",
    "Can I take it with other medicines?",
    "can I combine ibuprofen and paracetamol",
    "drug interactions",
    "with alcohol",
  ])("flags: %s", (text) => {
    expect(flags(text).specialGroup).toBe(true);
  });

  it("an adult age does not count as a special group", () => {
    expect(flags("I am 35 years old, what is ibuprofen").specialGroup).toBe(false);
  });

  it("How should I take ibuprofen while pregnant? is special-group, not a normal answer", () => {
    const d = flags("How should I take ibuprofen while pregnant?");
    expect(d.specialGroup).toBe(true);
    expect(d.allowedUsageQuestion).toBe(false);
  });

  it("bare allergy topic words stay normal", () => {
    expect(flags("What helps with allergies?", generic).specialGroup).toBe(false);
    expect(flags("allergy", generic).specialGroup).toBe(false);
  });

  it("overlapping diagnosis and special-group patterns set both flags", () => {
    const d = flags("Do I have a problem? I'm pregnant and should I take ibuprofen?");
    expect(d.personalAdvice).toBe(true);
    expect(d.specialGroup).toBe(true);
  });
});

describe("normal questions", () => {
  it.each([
    ["What helps with hay fever?", generic],
    ["How should I take ibuprofen?", named],
    ["Which products contain paracetamol?", named],
    ["What helps with allergies?", generic],
    ["Which product is used for a blocked nose?", generic],
  ])("does not trigger any guard: %s", (text, options) => {
    const d = flags(text, options);
    expect(d.personalAdvice).toBe(false);
    expect(d.specialGroup).toBe(false);
  });
});

describe("fixed texts", () => {
  it("match the approved wording", () => {
    expect(SAFETY_TEXT.personalAdvice).toBe(
      "I can’t diagnose conditions or give personal medical advice. I can only show general information from the demo product catalogue.",
    );
    expect(SAFETY_TEXT.specialGroup).toBe(
      "This demo does not provide dosing or suitability advice for this situation. Please ask a pharmacist or doctor.",
    );
    expect(SAFETY_TEXT.pharmacistLine).toBe("Ask a pharmacist if you’re unsure.");
    expect(SAFETY_TEXT.noMatch).toBe(
      "I couldn’t find a matching product in this demo. Ask a pharmacist if you’re unsure.",
    );
    expect(SAFETY_TEXT.attachmentNote).toBe("I can’t read attachments in this demo version.");
  });
});
