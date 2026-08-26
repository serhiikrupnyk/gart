-- CreateEnum
CREATE TYPE "FoodGroup" AS ENUM ('GRAINS', 'MEAT', 'FISH', 'DAIRY', 'EGGS', 'VEGETABLES', 'FRUIT', 'NUTS_SEEDS', 'LEGUMES', 'FATS_OILS', 'BAKERY', 'SWEETS', 'BEVERAGES', 'SAUCES', 'OTHER');

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "group" "FoodGroup" NOT NULL,
    "kcal" DECIMAL(7,2) NOT NULL,
    "protein" DECIMAL(6,2) NOT NULL,
    "fat" DECIMAL(6,2) NOT NULL,
    "carbs" DECIMAL(6,2) NOT NULL,
    "fibre" DECIMAL(6,2),
    "sugars" DECIMAL(6,2),
    "saturatedFat" DECIMAL(6,2),
    "salt" DECIMAL(6,2),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodPortion" (
    "id" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "grams" DECIMAL(7,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodPortion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Food_trainerId_idx" ON "Food"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodPortion_foodId_label_key" ON "FoodPortion"("foodId", "label");

-- AddForeignKey
ALTER TABLE "Food" ADD CONSTRAINT "Food_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodPortion" ADD CONSTRAINT "FoodPortion_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;

