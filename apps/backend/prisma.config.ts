// Prisma 7 moved datasource connection config out of schema.prisma and
// into this file. See prisma/schema.prisma's datasource block, which now
// only declares the provider — the actual URL is wired here instead.
import { defineConfig } from 'prisma/config';
import 'dotenv/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
