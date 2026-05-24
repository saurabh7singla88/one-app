-- CreateTable: team_member_roles
-- Stores per-project role tags for JIRA team members (DEV | QA | PM | OTHER)
CREATE TABLE "team_member_roles" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "project"   TEXT     NOT NULL,
    "name"      TEXT     NOT NULL,
    "role"      TEXT     NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- UniqueIndex: one role per member per project
CREATE UNIQUE INDEX "team_member_roles_project_name_key" ON "team_member_roles"("project", "name");

-- Index: fast lookup by project
CREATE INDEX "team_member_roles_project_idx" ON "team_member_roles"("project");
