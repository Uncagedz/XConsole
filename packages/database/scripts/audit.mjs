import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const [database] = await prisma.$queryRawUnsafe(
    'SELECT current_database() AS name, pg_size_pretty(pg_database_size(current_database())) AS size',
  );
  const tables = await prisma.$queryRawUnsafe(
    `SELECT schemaname AS schema, relname AS table, n_live_tup::bigint AS estimated_rows
       FROM pg_stat_user_tables
      ORDER BY schemaname, relname`,
  );

  console.log(JSON.stringify({
    database,
    tables: tables.map((table) => ({
      ...table,
      estimated_rows: Number(table.estimated_rows),
    })),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
