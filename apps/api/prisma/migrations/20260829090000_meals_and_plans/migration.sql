-- CreateEnum
CREATE TYPE "MealSlot" AS ENUM ('BREAKFAST', 'SNACK', 'LUNCH', 'DINNER');

-- CreateTable
CREATE TABLE "Meal" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealItem" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "grams" DECIMAL(7,2) NOT NULL,
    "portionLabel" TEXT,
    "portionCount" DECIMAL(5,2),

    CONSTRAINT "MealItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetKcal" DECIMAL(7,2),
    "targetProtein" DECIMAL(6,2),
    "targetFat" DECIMAL(6,2),
    "targetCarbs" DECIMAL(6,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanSlot" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "slot" "MealSlot" NOT NULL,
    "name" TEXT,
    "order" INTEGER NOT NULL,
    "servings" DECIMAL(5,2) NOT NULL DEFAULT 1,

    CONSTRAINT "MealPlanSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanAssignment" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sourcePlanId" TEXT,
    "name" TEXT NOT NULL,
    "targetKcal" DECIMAL(7,2),
    "targetProtein" DECIMAL(6,2),
    "targetFat" DECIMAL(6,2),
    "targetCarbs" DECIMAL(6,2),
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "daysOfWeek" INTEGER[],
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlanAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignedMeal" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "slot" "MealSlot" NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "order" INTEGER NOT NULL,
    "servings" DECIMAL(5,2) NOT NULL DEFAULT 1,

    CONSTRAINT "AssignedMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignedMealItem" (
    "id" TEXT NOT NULL,
    "assignedMealId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "grams" DECIMAL(7,2) NOT NULL,
    "portionLabel" TEXT,
    "portionCount" DECIMAL(5,2),

    CONSTRAINT "AssignedMealItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meal_trainerId_idx" ON "Meal"("trainerId");

-- CreateIndex
CREATE INDEX "MealItem_foodId_idx" ON "MealItem"("foodId");

-- CreateIndex
CREATE UNIQUE INDEX "MealItem_mealId_order_key" ON "MealItem"("mealId", "order");

-- CreateIndex
CREATE INDEX "MealPlan_trainerId_idx" ON "MealPlan"("trainerId");

-- CreateIndex
CREATE INDEX "MealPlanSlot_mealId_idx" ON "MealPlanSlot"("mealId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanSlot_planId_order_key" ON "MealPlanSlot"("planId", "order");

-- CreateIndex
CREATE INDEX "MealPlanAssignment_trainerId_idx" ON "MealPlanAssignment"("trainerId");

-- CreateIndex
CREATE INDEX "MealPlanAssignment_clientId_idx" ON "MealPlanAssignment"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignedMeal_assignmentId_order_key" ON "AssignedMeal"("assignmentId", "order");

-- CreateIndex
CREATE INDEX "AssignedMealItem_foodId_idx" ON "AssignedMealItem"("foodId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignedMealItem_assignedMealId_order_key" ON "AssignedMealItem"("assignedMealId", "order");

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealItem" ADD CONSTRAINT "MealItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealItem" ADD CONSTRAINT "MealItem_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanSlot" ADD CONSTRAINT "MealPlanSlot_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanSlot" ADD CONSTRAINT "MealPlanSlot_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanAssignment" ADD CONSTRAINT "MealPlanAssignment_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanAssignment" ADD CONSTRAINT "MealPlanAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanAssignment" ADD CONSTRAINT "MealPlanAssignment_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "MealPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignedMeal" ADD CONSTRAINT "AssignedMeal_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MealPlanAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignedMealItem" ADD CONSTRAINT "AssignedMealItem_assignedMealId_fkey" FOREIGN KEY ("assignedMealId") REFERENCES "AssignedMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignedMealItem" ADD CONSTRAINT "AssignedMealItem_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

