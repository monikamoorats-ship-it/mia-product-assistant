/** Product and persona management integration tests. CI only (disposable PostgreSQL). */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_CUSTOM_PERSONAS,
  MAX_CUSTOM_PRODUCTS,
  createPersona,
  createProduct,
  deletePersona,
  deleteProduct,
  getProductDTO,
  listPersonaDTOs,
  listProductDTOs,
  updatePersona,
  updateProduct,
} from "@/server/catalog";
import { AppError } from "@/server/errors";
import { getChat, sendChatMessage } from "@/server/chats";
import { OWNER_A, OWNER_B, prisma, resetAndSeed } from "./helpers";

const valid = (over: Record<string, unknown> = {}) => ({
  name: "Zinc balm",
  activeSubstance: "zinc oxide",
  category: "Skin",
  useFor: "Dry skin",
  howToUse: "Apply thinly",
  tip: "Wash your hands afterwards",
  ...over,
});

const rejects = async (promise: Promise<unknown>, status: number) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).status).toBe(status);
  return error as AppError;
};

beforeEach(resetAndSeed);
afterAll(() => prisma.$disconnect());

describe("products: ownership and visibility", () => {
  it("custom products are visible only to their owner; seeded products to everyone", async () => {
    const mine = await createProduct(prisma, OWNER_A, valid());
    expect((await listProductDTOs(prisma, OWNER_A)).map((p) => p.id)).toContain(mine.id);
    expect((await listProductDTOs(prisma, OWNER_B)).map((p) => p.id)).not.toContain(mine.id);
    expect((await listProductDTOs(prisma, null)).every((p) => p.seeded)).toBe(true);
    expect((await listProductDTOs(prisma, OWNER_B)).filter((p) => p.seeded)).toHaveLength(7);
  });

  it("a guessed product ID never reveals another owner's product", async () => {
    const mine = await createProduct(prisma, OWNER_A, valid());
    expect(await getProductDTO(prisma, OWNER_B, mine.id)).toBeNull();
    expect(await getProductDTO(prisma, null, mine.id)).toBeNull();
    expect(await getProductDTO(prisma, OWNER_A, "does-not-exist")).toBeNull();
    await rejects(updateProduct(prisma, OWNER_B, mine.id, valid({ name: "Hacked" })), 404);
    await rejects(deleteProduct(prisma, OWNER_B, mine.id), 404);
    expect((await getProductDTO(prisma, OWNER_A, mine.id))?.name).toBe("Zinc balm");
  });

  it("seeded products cannot be edited or deleted by anyone", async () => {
    const seeded = await prisma.product.findUniqueOrThrow({ where: { seedKey: "ibuprofen-400mg-tablets" } });
    await rejects(updateProduct(prisma, OWNER_A, seeded.id, valid()), 403);
    await rejects(deleteProduct(prisma, OWNER_A, seeded.id), 403);
    expect(await prisma.product.count({ where: { ownerId: null } })).toBe(7);
  });

  it("owners can edit and delete their own products", async () => {
    const mine = await createProduct(prisma, OWNER_A, valid());
    const updated = await updateProduct(prisma, OWNER_A, mine.id, valid({ name: "Better balm" }));
    expect(updated.name).toBe("Better balm");
    await deleteProduct(prisma, OWNER_A, mine.id);
    expect(await getProductDTO(prisma, OWNER_A, mine.id)).toBeNull();
  });

  it("two products may share a name (Product.name is not unique)", async () => {
    await createProduct(prisma, OWNER_A, valid({ name: "Ibuprofen 400 mg tablets" }));
    await createProduct(prisma, OWNER_B, valid({ name: "Ibuprofen 400 mg tablets" }));
    expect(await prisma.product.count({ where: { name: "Ibuprofen 400 mg tablets" } })).toBe(3);
  });

  it("duplicating a seeded product creates an editable, unseeded copy owned by the caller", async () => {
    const seeded = await prisma.product.findUniqueOrThrow({ where: { seedKey: "ibuprofen-400mg-tablets" } });
    const copy = await createProduct(prisma, OWNER_A, { duplicateOf: seeded.id });
    expect(copy).toMatchObject({ name: "Copy of Ibuprofen 400 mg tablets", seeded: false, tip: seeded.tip });
    const row = await prisma.product.findUniqueOrThrow({ where: { id: copy.id } });
    expect(row.seedKey).toBeNull();
    expect(row.ownerId).toBe(OWNER_A);
    await updateProduct(prisma, OWNER_A, copy.id, valid({ name: "My ibuprofen" }));
    expect((await prisma.product.findUniqueOrThrow({ where: { id: seeded.id } })).name).toBe("Ibuprofen 400 mg tablets");
    await rejects(createProduct(prisma, OWNER_B, { duplicateOf: copy.id }), 404); // not visible to B
  });
});

describe("products: validation and limits", () => {
  it("rejects missing, whitespace-only and over-length fields with field errors and no write", async () => {
    const err = await rejects(createProduct(prisma, OWNER_A, valid({ name: "   ", category: "x".repeat(51) })), 422);
    expect(Object.keys(err.fields ?? {}).sort()).toEqual(["category", "name"]);
    expect(await prisma.product.count({ where: { ownerId: OWNER_A } })).toBe(0);
  });

  it("allows exactly the field-length boundary", async () => {
    await createProduct(prisma, OWNER_A, valid({ name: "n".repeat(100), activeSubstance: "a".repeat(100), category: "c".repeat(50), useFor: "u".repeat(200), howToUse: "h".repeat(300), tip: "t".repeat(300) }));
  });

  it("limits each owner to 20 custom products, without counting seeded ones or other owners", async () => {
    for (let i = 0; i < MAX_CUSTOM_PRODUCTS; i++) await createProduct(prisma, OWNER_A, valid({ name: `P${i}` }));
    await rejects(createProduct(prisma, OWNER_A, valid({ name: "One too many" })), 409);
    await rejects(createProduct(prisma, OWNER_A, { duplicateOf: (await prisma.product.findFirstOrThrow({ where: { ownerId: null } })).id }), 409);
    expect(await prisma.product.count({ where: { ownerId: OWNER_A } })).toBe(MAX_CUSTOM_PRODUCTS);
    await createProduct(prisma, OWNER_B, valid());
  });
});

describe("products: chat history keeps its snapshots", () => {
  it("editing or deleting a product does not change or remove old cards", async () => {
    const mine = await createProduct(prisma, OWNER_A, valid());
    const { sessionId } = await sendChatMessage(prisma, { ownerId: OWNER_A, sessionId: null, message: "Zinc balm", delayMs: 0 });
    await updateProduct(prisma, OWNER_A, mine.id, valid({ name: "Renamed balm", tip: "New tip" }));
    let card = (await getChat(prisma, OWNER_A, sessionId))!.messages[1].cards[0];
    expect(card).toMatchObject({ unavailable: false, linkAvailable: true, product: { name: "Zinc balm", tip: "Wash your hands afterwards" } });
    await deleteProduct(prisma, OWNER_A, mine.id);
    card = (await getChat(prisma, OWNER_A, sessionId))!.messages[1].cards[0];
    expect(card).toMatchObject({ unavailable: false, linkAvailable: false, product: { name: "Zinc balm" } });
  });
});

describe("personas", () => {
  it("custom personas are owner-only and have no seedKey", async () => {
    const mine = await createPersona(prisma, OWNER_A, { name: "Night shift", content: "Be brief." });
    expect(mine).toMatchObject({ seeded: false, seedKey: null });
    expect((await listPersonaDTOs(prisma, OWNER_A)).map((p) => p.id)).toContain(mine.id);
    expect((await listPersonaDTOs(prisma, OWNER_B)).map((p) => p.id)).not.toContain(mine.id);
    expect((await listPersonaDTOs(prisma, OWNER_B)).filter((p) => p.seeded)).toHaveLength(3);
  });

  it("seeded personas are read-only; foreign personas look nonexistent", async () => {
    const seeded = await prisma.systemPrompt.findUniqueOrThrow({ where: { seedKey: "customer-guide" } });
    await rejects(updatePersona(prisma, OWNER_A, seeded.id, { name: "Renamed", content: "c" }), 403);
    await rejects(deletePersona(prisma, OWNER_A, seeded.id), 403);
    const mine = await createPersona(prisma, OWNER_A, { name: "Mine", content: "c" });
    await rejects(updatePersona(prisma, OWNER_B, mine.id, { name: "Hacked", content: "c" }), 404);
    await rejects(deletePersona(prisma, OWNER_B, mine.id), 404);
  });

  it("rejects duplicate names with a friendly field error, including seeded names (any case)", async () => {
    await createPersona(prisma, OWNER_A, { name: "Mine", content: "c" });
    const dup = await rejects(createPersona(prisma, OWNER_A, { name: "mine", content: "c" }), 409);
    expect(dup.fields?.name).toMatch(/already exists/);
    await rejects(createPersona(prisma, OWNER_A, { name: "pharmacist", content: "c" }), 409);
    // Another owner may reuse the name.
    await createPersona(prisma, OWNER_B, { name: "Mine", content: "c" });
    const other = await createPersona(prisma, OWNER_A, { name: "Other", content: "c" });
    await rejects(updatePersona(prisma, OWNER_A, other.id, { name: "Mine", content: "c" }), 409);
    await updatePersona(prisma, OWNER_A, other.id, { name: "Other", content: "Changed" }); // own name is fine
  });

  it("validates lengths and limits custom personas to 10 per owner", async () => {
    await rejects(createPersona(prisma, OWNER_A, { name: "x".repeat(41), content: "c" }), 422);
    await rejects(createPersona(prisma, OWNER_A, { name: "ok", content: "x".repeat(1001) }), 422);
    await createPersona(prisma, OWNER_A, { name: "x".repeat(40), content: "y".repeat(1000) });
    for (let i = 1; i < MAX_CUSTOM_PERSONAS; i++) await createPersona(prisma, OWNER_A, { name: `P${i}`, content: "c" });
    await rejects(createPersona(prisma, OWNER_A, { name: "Eleventh", content: "c" }), 409);
  });

  it("duplicating a seeded persona makes an editable copy with a unique name", async () => {
    const seeded = await prisma.systemPrompt.findUniqueOrThrow({ where: { seedKey: "product-expert" } });
    const first = await createPersona(prisma, OWNER_A, { duplicateOf: seeded.id });
    const second = await createPersona(prisma, OWNER_A, { duplicateOf: seeded.id });
    expect(first.name).toBe("Copy of Pharmacist");
    expect(second.name).not.toBe(first.name);
    expect(first.seedKey).toBeNull(); // a copy never inherits the Pharmacist behaviour
  });
});
