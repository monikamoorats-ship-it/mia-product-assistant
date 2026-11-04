/**
 * Field-length limits shared by validators, the seed and (via the schema)
 * the database column types. Keep in sync with prisma/schema.prisma.
 */
export const FIELD_LIMITS = {
  productName: 100,
  activeSubstance: 100,
  category: 50,
  useFor: 200,
  howToUse: 300,
  tip: 300,
  personaName: 40,
  personaContent: 1000,
  message: 2000,
  chatTitle: 40,
} as const;
