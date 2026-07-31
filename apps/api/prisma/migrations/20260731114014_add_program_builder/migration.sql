-- CreateEnum
CREATE TYPE "WorkoutType" AS ENUM ('STRENGTH', 'RUNNING', 'AMRAP', 'EMOM', 'CIRCUIT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LoadUnit" AS ENUM ('KG', 'PERCENT_1RM', 'RPE');

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "WorkoutType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramSection" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT,
    "type" "WorkoutType" NOT NULL,
    "order" INTEGER NOT NULL,
    "timeCapSeconds" INTEGER,
    "intervalSeconds" INTEGER,
    "rounds" INTEGER,
    "restBetweenRoundsSeconds" INTEGER,

    CONSTRAINT "ProgramSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramExercise" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sets" INTEGER,
    "reps" INTEGER,
    "loadValue" DECIMAL(6,2),
    "loadUnit" "LoadUnit",
    "loadText" TEXT,
    "restSeconds" INTEGER,
    "tempo" TEXT,
    "notes" TEXT,
    "durationSeconds" INTEGER,
    "distanceMeters" INTEGER,

    CONSTRAINT "ProgramExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Program_trainerId_idx" ON "Program"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramSection_programId_order_key" ON "ProgramSection"("programId", "order");

-- CreateIndex
CREATE INDEX "ProgramExercise_exerciseId_idx" ON "ProgramExercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramExercise_sectionId_order_key" ON "ProgramExercise"("sectionId", "order");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramSection" ADD CONSTRAINT "ProgramSection_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExercise" ADD CONSTRAINT "ProgramExercise_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ProgramSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExercise" ADD CONSTRAINT "ProgramExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
