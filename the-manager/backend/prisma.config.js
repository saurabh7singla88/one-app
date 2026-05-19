import { defineConfig } from 'prisma/config';

// This config is used only by Prisma CLI tools (migrate, studio, generate).
// At runtime the connection is established via the libsql adapter in src/lib/prisma.js.
// DATABASE_URL should be a file: path pointing to a local SQLite file for migrations.
export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
});
