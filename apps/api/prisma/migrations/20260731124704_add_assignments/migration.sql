-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sourceProgramId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "WorkoutType" NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "daysOfWeek" INTEGER[],
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentSection" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "name" TEXT,
    "type" "WorkoutType" NOT NULL,
    "order" INTEGER NOT NULL,
    "timeCapSeconds" INTEGER,
    "intervalSeconds" INTEGER,
    "rounds" INTEGER,
    "restBetweenRoundsSeconds" INTEGER,

    CONSTRAINT "AssignmentSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentExercise" (
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

    CONSTRAINT "AssignmentExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assignment_trainerId_idx" ON "Assignment"("trainerId");

-- CreateIndex
CREATE INDEX "Assignment_clientId_idx" ON "Assignment"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSection_assignmentId_order_key" ON "AssignmentSection"("assignmentId", "order");

-- CreateIndex
CREATE INDEX "AssignmentExercise_exerciseId_idx" ON "AssignmentExercise"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentExercise_sectionId_order_key" ON "AssignmentExercise"("sectionId", "order");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_sourceProgramId_fkey" FOREIGN KEY ("sourceProgramId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSection" ADD CONSTRAINT "AssignmentSection_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentExercise" ADD CONSTRAINT "AssignmentExercise_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "AssignmentSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentExercise" ADD CONSTRAINT "AssignmentExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
