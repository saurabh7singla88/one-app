-- CreateTable: bookmark_folders (self-referential nested folder tree)
CREATE TABLE "bookmark_folders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "icon" TEXT NOT NULL DEFAULT '📁',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bookmark_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "bookmark_folders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bookmark_folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: bookmarks
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "favicon" TEXT,
    "image" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "folderId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bookmarks_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "bookmark_folders" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bookmark_folders_userId_idx" ON "bookmark_folders"("userId");
CREATE INDEX "bookmark_folders_parentId_idx" ON "bookmark_folders"("parentId");
CREATE INDEX "bookmarks_userId_idx" ON "bookmarks"("userId");
CREATE INDEX "bookmarks_folderId_idx" ON "bookmarks"("folderId");
