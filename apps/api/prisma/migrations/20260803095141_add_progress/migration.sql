-- CreateTable
CREATE TABLE "ProgressVariable" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "selfLog" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressEntry" (
    "id" TEXT NOT NULL,
    "variableId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "value" DECIMAL(8,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressPhoto" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgressVariable_trainerId_idx" ON "ProgressVariable"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressVariable_clientId_name_key" ON "ProgressVariable"("clientId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressEntry_variableId_date_key" ON "ProgressEntry"("variableId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressPhoto_storageKey_key" ON "ProgressPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "ProgressPhoto_clientId_date_idx" ON "ProgressPhoto"("clientId", "date");

-- CreateIndex
CREATE INDEX "ProgressPhoto_trainerId_idx" ON "ProgressPhoto"("trainerId");

-- AddForeignKey
ALTER TABLE "ProgressVariable" ADD CONSTRAINT "ProgressVariable_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressVariable" ADD CONSTRAINT "ProgressVariable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_variableId_fkey" FOREIGN KEY ("variableId") REFERENCES "ProgressVariable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
