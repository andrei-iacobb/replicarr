-- CreateTable
CREATE TABLE "ApprovedItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "tmdbId" INTEGER NOT NULL,
    "tvdbId" INTEGER,
    "imdbId" TEXT,
    "qualityProfileId" INTEGER NOT NULL,
    "mainArrId" INTEGER NOT NULL,
    "lowqArrId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "poster" TEXT,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovedItem_type_tmdbId_key" ON "ApprovedItem"("type", "tmdbId");
