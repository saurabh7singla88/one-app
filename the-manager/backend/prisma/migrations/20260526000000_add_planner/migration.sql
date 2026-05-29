-- CreateTable
CREATE TABLE "planner_entries" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "date"         TEXT NOT NULL,
    "slot"         TEXT NOT NULL,
    "position"     INTEGER NOT NULL DEFAULT 0,
    "customTitle"  TEXT,
    "note"         TEXT,
    "initiativeId" TEXT,
    "userId"       TEXT NOT NULL,
    "dayNote"      TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL,
    CONSTRAINT "planner_entries_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "initiatives" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "planner_entries_userId_fkey"       FOREIGN KEY ("userId")       REFERENCES "users"        ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "planner_entries_userId_date_idx" ON "planner_entries"("userId", "date");
CREATE INDEX "planner_entries_initiativeId_idx" ON "planner_entries"("initiativeId");
