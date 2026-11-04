/**
 * Owner-scoped product and persona management.
 *
 * Seeded records (ownerId NULL) are global and read-only. Users can create
 * custom records (limited per owner), edit/delete only their own, and
 * duplicate any visible record into their own editable copy.
 */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { FIELD_LIMITS } from "@/lib/limits";
import { validatePersonaInput, validateProductInput } from "@/lib/validation";
import { AppError } from "./errors";

export const MAX_CUSTOM_PRODUCTS = 20;
export const MAX_CUSTOM_PERSONAS = 10;

type Db = PrismaClient | Prisma.TransactionClient;

const visibleTo = (ownerId: string) => ({ OR: [{ ownerId: null }, { ownerId }] });

export const SEEDED_READ_ONLY_PRODUCT =
  "Seeded products are read-only. Duplicate it to make your own editable copy.";
export const SEEDED_READ_ONLY_PERSONA =
  "Seeded personas are read-only. Duplicate it to make your own editable copy.";
const PRODUCT_NOT_FOUND = "We couldn’t find that product.";
const PERSONA_NOT_FOUND = "We couldn’t find that persona.";

export type ProductDTO = {
  id: string;
  name: string;
  activeSubstance: string;
  category: string;
  useFor: string;
  howToUse: string;
  tip: string;
  seeded: boolean;
};

export type PersonaDTO = { id: string; name: string; content: string; seeded: boolean; seedKey: string | null };

type ProductRow = Awaited<ReturnType<PrismaClient["product"]["findFirstOrThrow"]>>;
export const toProductDTO = (p: ProductRow): ProductDTO => ({
  id: p.id,
  name: p.name,
  activeSubstance: p.activeSubstance,
  category: p.category,
  useFor: p.useFor,
  howToUse: p.howToUse,
  tip: p.tip,
  seeded: p.ownerId === null,
});

// ---------------------------------------------------------------- products

export async function listProductDTOs(db: Db, ownerId: string | null): Promise<ProductDTO[]> {
  const rows = await db.product.findMany({
    where: ownerId ? visibleTo(ownerId) : { ownerId: null },
    orderBy: { name: "asc" },
  });
  return rows.map(toProductDTO);
}

/** Unknown, foreign and (for non-owners) custom products all resolve to null. */
export async function getProductDTO(db: Db, ownerId: string | null, id: string): Promise<ProductDTO | null> {
  const row = await db.product.findFirst({
    where: { id, ...(ownerId ? visibleTo(ownerId) : { ownerId: null }) },
  });
  return row ? toProductDTO(row) : null;
}

async function assertProductCapacity(db: Db, ownerId: string) {
  const count = await db.product.count({ where: { ownerId } });
  if (count >= MAX_CUSTOM_PRODUCTS) {
    throw new AppError(409, `You can have at most ${MAX_CUSTOM_PRODUCTS} custom products. Please delete one first.`);
  }
}

export async function createProduct(prisma: PrismaClient, ownerId: string, body: Record<string, unknown>): Promise<ProductDTO> {
  // Duplicate an existing visible product into an editable custom copy.
  if (typeof body.duplicateOf === "string") {
    const source = await getProductDTO(prisma, ownerId, body.duplicateOf);
    if (!source) throw new AppError(404, PRODUCT_NOT_FOUND);
    const copyName = `Copy of ${source.name}`.slice(0, FIELD_LIMITS.productName);
    const checked = validateProductInput({ ...source, name: copyName });
    if (!checked.ok) throw new AppError(422, Object.values(checked.errors)[0], checked.errors);
    return prisma.$transaction(async (tx) => {
      await assertProductCapacity(tx, ownerId);
      return toProductDTO(await tx.product.create({ data: { ownerId, ...checked.value } }));
    });
  }
  const checked = validateProductInput(body);
  if (!checked.ok) throw new AppError(422, Object.values(checked.errors)[0], checked.errors);
  return prisma.$transaction(async (tx) => {
    await assertProductCapacity(tx, ownerId);
    return toProductDTO(await tx.product.create({ data: { ownerId, ...checked.value } }));
  });
}

/** Loads a product the owner may edit; seeded products give a clear read-only error. */
async function editableProduct(db: Db, ownerId: string, id: string) {
  const row = await db.product.findFirst({ where: { id, ...visibleTo(ownerId) } });
  if (!row) throw new AppError(404, PRODUCT_NOT_FOUND);
  if (row.ownerId === null) throw new AppError(403, SEEDED_READ_ONLY_PRODUCT);
  return row;
}

export async function updateProduct(db: Db, ownerId: string, id: string, body: unknown): Promise<ProductDTO> {
  await editableProduct(db, ownerId, id);
  const checked = validateProductInput(body);
  if (!checked.ok) throw new AppError(422, Object.values(checked.errors)[0], checked.errors);
  const result = await db.product.updateMany({ where: { id, ownerId }, data: { ...checked.value, updatedAt: new Date() } });
  if (result.count === 0) throw new AppError(404, PRODUCT_NOT_FOUND);
  return toProductDTO(await db.product.findFirstOrThrow({ where: { id, ownerId } }));
}

/** Deleting never rewrites chat history: messages keep their snapshots. */
export async function deleteProduct(db: Db, ownerId: string, id: string): Promise<void> {
  await editableProduct(db, ownerId, id);
  await db.product.deleteMany({ where: { id, ownerId } });
}

// ---------------------------------------------------------------- personas

const toPersonaDTO = (p: { id: string; name: string; content: string; ownerId: string | null; seedKey: string | null }): PersonaDTO => ({
  id: p.id,
  name: p.name,
  content: p.content,
  seeded: p.ownerId === null,
  seedKey: p.seedKey,
});

export async function listPersonaDTOs(db: Db, ownerId: string | null): Promise<PersonaDTO[]> {
  const rows = await db.systemPrompt.findMany({
    where: ownerId ? visibleTo(ownerId) : { ownerId: null },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  });
  return rows.map(toPersonaDTO);
}

const DUPLICATE_NAME = "A persona with this name already exists. Please choose a different name.";

async function assertPersonaNameFree(db: Db, ownerId: string, name: string, exceptId?: string) {
  const clash = await db.systemPrompt.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...visibleTo(ownerId), ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new AppError(409, DUPLICATE_NAME, { name: DUPLICATE_NAME });
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function uniqueName(db: Db, ownerId: string, base: string): Promise<string> {
  for (let n = 0; n < 10; n++) {
    const candidate = (n === 0 ? `Copy of ${base}` : `Copy ${n + 1} of ${base}`).slice(0, FIELD_LIMITS.personaName);
    const clash = await db.systemPrompt.findFirst({
      where: { name: { equals: candidate, mode: "insensitive" }, ...visibleTo(ownerId) },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new AppError(409, DUPLICATE_NAME, { name: DUPLICATE_NAME });
}

export async function createPersona(prisma: PrismaClient, ownerId: string, body: Record<string, unknown>): Promise<PersonaDTO> {
  let input: { name: string; content: string };
  if (typeof body.duplicateOf === "string") {
    const source = await prisma.systemPrompt.findFirst({ where: { id: body.duplicateOf, ...visibleTo(ownerId) } });
    if (!source) throw new AppError(404, PERSONA_NOT_FOUND);
    input = { name: await uniqueName(prisma, ownerId, source.name), content: source.content };
  } else {
    const checked = validatePersonaInput(body);
    if (!checked.ok) throw new AppError(422, Object.values(checked.errors)[0], checked.errors);
    input = checked.value;
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const count = await tx.systemPrompt.count({ where: { ownerId } });
      if (count >= MAX_CUSTOM_PERSONAS) {
        throw new AppError(409, `You can have at most ${MAX_CUSTOM_PERSONAS} custom personas. Please delete one first.`);
      }
      await assertPersonaNameFree(tx, ownerId, input.name);
      // Custom personas never carry a seedKey: they use the neutral Customer tone.
      return toPersonaDTO(await tx.systemPrompt.create({ data: { ownerId, ...input } }));
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, DUPLICATE_NAME, { name: DUPLICATE_NAME });
    throw error;
  }
}

async function editablePersona(db: Db, ownerId: string, id: string) {
  const row = await db.systemPrompt.findFirst({ where: { id, ...visibleTo(ownerId) } });
  if (!row) throw new AppError(404, PERSONA_NOT_FOUND);
  if (row.ownerId === null) throw new AppError(403, SEEDED_READ_ONLY_PERSONA);
  return row;
}

export async function updatePersona(prisma: PrismaClient, ownerId: string, id: string, body: unknown): Promise<PersonaDTO> {
  await editablePersona(prisma, ownerId, id);
  const checked = validatePersonaInput(body);
  if (!checked.ok) throw new AppError(422, Object.values(checked.errors)[0], checked.errors);
  try {
    await assertPersonaNameFree(prisma, ownerId, checked.value.name, id);
    const result = await prisma.systemPrompt.updateMany({ where: { id, ownerId }, data: checked.value });
    if (result.count === 0) throw new AppError(404, PERSONA_NOT_FOUND);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, DUPLICATE_NAME, { name: DUPLICATE_NAME });
    throw error;
  }
  return toPersonaDTO(await prisma.systemPrompt.findFirstOrThrow({ where: { id, ownerId } }));
}

/** Chats using the persona fall back to Customer via ON DELETE SET NULL; messages are kept. */
export async function deletePersona(db: Db, ownerId: string, id: string): Promise<void> {
  await editablePersona(db, ownerId, id);
  await db.systemPrompt.deleteMany({ where: { id, ownerId } });
}
