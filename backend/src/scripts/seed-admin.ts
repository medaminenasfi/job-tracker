import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DbService } from '../db/db.service';
import * as bcrypt from 'bcrypt';

// Seeds the first ADMIN from env. Nobody can register as admin through the API —
// this script (or an existing admin's invite) is the only path to the role.
//   ADMIN_EMAIL, ADMIN_PASSWORD, optional ADMIN_NAME
async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Admin';

  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed an admin',
    );
  }
  if (password.length < 6) {
    throw new Error('ADMIN_PASSWORD must be at least 6 characters');
  }

  // Creating the app context runs DbService.onModuleInit → initSchema(), so the
  // users table, role enum, etc. exist before we insert. Reuses the real schema.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const db = app.get(DbService);
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash, role, account_status)
       VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE
         SET role = 'ADMIN', account_status = 'ACTIVE', password_hash = EXCLUDED.password_hash
       RETURNING id, email, role`,
      [name, email, hash],
    );
    const admin = result.rows[0] as { id: string; email: string; role: string };
    // Intentionally logs identity only — never the password or hash.
    console.log(`Seeded admin: ${admin.email} (${admin.id}) as ${admin.role}`);
  } finally {
    // app.close() can hang if a provider keeps an open handle (e.g. the pg pool);
    // bound it so this one-shot script always terminates.
    await Promise.race([
      app.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
}

seedAdmin().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : 'Failed to seed admin');
    process.exit(1);
  },
);
