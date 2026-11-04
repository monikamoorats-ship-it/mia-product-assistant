-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "ChatModel" AS ENUM ('GPT4_STYLE', 'CLAUDE_STYLE', 'LLAMA_STYLE');

-- CreateTable
CREATE TABLE "SystemPrompt" (
    "id" TEXT NOT NULL,
    "seedKey" TEXT,
    "ownerId" VARCHAR(64),
    "name" VARCHAR(40) NOT NULL,
    "content" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "seedKey" TEXT,
    "ownerId" VARCHAR(64),
    "name" VARCHAR(100) NOT NULL,
    "activeSubstance" VARCHAR(100) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "useFor" VARCHAR(200) NOT NULL,
    "howToUse" VARCHAR(300) NOT NULL,
    "tip" VARCHAR(300) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "ownerId" VARCHAR(64) NOT NULL,
    "title" VARCHAR(40) NOT NULL DEFAULT 'New chat',
    "model" "ChatModel" NOT NULL DEFAULT 'GPT4_STYLE',
    "systemPromptId" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "topP" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productSnapshots" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizResult" (
    "id" TEXT NOT NULL,
    "ownerId" VARCHAR(64) NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemPrompt_seedKey_key" ON "SystemPrompt"("seedKey");

-- CreateIndex
CREATE INDEX "SystemPrompt_ownerId_idx" ON "SystemPrompt"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemPrompt_ownerId_name_key" ON "SystemPrompt"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_seedKey_key" ON "Product"("seedKey");

-- CreateIndex
CREATE INDEX "Product_ownerId_idx" ON "Product"("ownerId");

-- CreateIndex
CREATE INDEX "ChatSession_ownerId_updatedAt_idx" ON "ChatSession"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_sessionId_createdAt_idx" ON "Message"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "QuizResult_ownerId_createdAt_idx" ON "QuizResult"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_systemPromptId_fkey" FOREIGN KEY ("systemPromptId") REFERENCES "SystemPrompt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written constraints (not expressible in schema.prisma)
-- ---------------------------------------------------------------------------

-- Seeded personas (ownerId IS NULL) must have unique names. The Prisma
-- composite unique (ownerId, name) does not cover NULL owners.
CREATE UNIQUE INDEX "SystemPrompt_name_global_key" ON "SystemPrompt"("name") WHERE "ownerId" IS NULL;

-- Seeded records must carry a seedKey; user-created records must not.
ALTER TABLE "SystemPrompt" ADD CONSTRAINT "SystemPrompt_seedKey_owner_check"
  CHECK (("ownerId" IS NULL AND "seedKey" IS NOT NULL) OR ("ownerId" IS NOT NULL AND "seedKey" IS NULL));
ALTER TABLE "Product" ADD CONSTRAINT "Product_seedKey_owner_check"
  CHECK (("ownerId" IS NULL AND "seedKey" IS NOT NULL) OR ("ownerId" IS NOT NULL AND "seedKey" IS NULL));

-- Required text must not be blank.
ALTER TABLE "SystemPrompt" ADD CONSTRAINT "SystemPrompt_text_check"
  CHECK (btrim("name") <> '' AND btrim("content") <> '');
ALTER TABLE "Product" ADD CONSTRAINT "Product_text_check"
  CHECK (btrim("name") <> '' AND btrim("activeSubstance") <> '' AND btrim("category") <> ''
     AND btrim("useFor") <> '' AND btrim("howToUse") <> '');

-- Generation settings are always within range.
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_temperature_check"
  CHECK ("temperature" >= 0 AND "temperature" <= 1);
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_topP_check"
  CHECK ("topP" >= 0 AND "topP" <= 1);

-- Message counter stays within the per-chat limit (200).
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_messageCount_check"
  CHECK ("messageCount" >= 0 AND "messageCount" <= 200);

-- At most one empty (hidden) chat session per owner, even across concurrent tabs.
CREATE UNIQUE INDEX "ChatSession_one_empty_per_owner_key" ON "ChatSession"("ownerId") WHERE "messageCount" = 0;

-- Product snapshots: at most three per message.
ALTER TABLE "Message" ADD CONSTRAINT "Message_snapshots_check"
  CHECK ("productSnapshots" IS NULL
     OR (jsonb_typeof("productSnapshots") = 'array' AND jsonb_array_length("productSnapshots") <= 3));

-- Quiz results: the quiz always has five questions and a sane score.
ALTER TABLE "QuizResult" ADD CONSTRAINT "QuizResult_score_check"
  CHECK ("total" = 5 AND "score" >= 0 AND "score" <= "total");
