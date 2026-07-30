-- CreateEnum
CREATE TYPE "MuscleGroup" AS ENUM ('CHEST', 'BACK', 'SHOULDERS', 'ARMS', 'LEGS', 'GLUTES', 'CORE', 'CALVES', 'FULL_BODY');

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "primaryMuscleGroup" "MuscleGroup" NOT NULL,
    "muscleGroups" "MuscleGroup"[],
    "categoryId" TEXT,
    "videoUrl" TEXT,
    "audioUrl" TEXT,
    "textInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exercise_trainerId_idx" ON "Exercise"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_trainerId_name_key" ON "Category"("trainerId", "name");

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
