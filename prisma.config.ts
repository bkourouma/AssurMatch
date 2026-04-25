import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "backend/prisma/schema.prisma",
  migrations: {
    path: "backend/prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});
