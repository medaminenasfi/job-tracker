import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  async onModuleInit() {
    await this.pool.connect();
    await this.initSchema();
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  get query() {
    return this.pool.query.bind(this.pool);
  }

  private async initSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        email text UNIQUE NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz DEFAULT now()
      );

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
          CREATE TYPE job_status AS ENUM (
            'SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'
          );
        END IF;
      END
      $$;

      CREATE TABLE IF NOT EXISTS jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        title text NOT NULL,
        company text NOT NULL,
        location text,
        url text,
        source text,
        description text,
        salary text,
        employment_type text,
        status job_status NOT NULL DEFAULT 'SAVED',
        notes text,
        saved_at timestamptz DEFAULT now(),
        applied_at timestamptz,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_user_url ON jobs(user_id, url) WHERE url IS NOT NULL;

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
          CREATE TYPE user_role AS ENUM ('USER', 'ADMIN');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
          CREATE TYPE account_status AS ENUM ('ACTIVE', 'SUSPENDED');
        END IF;
      END
      $$;

      -- ADD COLUMN IF NOT EXISTS so already-provisioned user tables gain the
      -- admin columns without a destructive migration.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'USER';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status account_status NOT NULL DEFAULT 'ACTIVE';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

      -- Google sign-in (Phase 9): google_id/avatar_url/auth_provider, and a
      -- nullable password_hash so Google-only users can exist without a password.
      -- The partial unique index enforces one account per Google id while allowing
      -- many NULLs (local-only users).
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'local';
      ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS admin_invites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash text UNIQUE NOT NULL,
        created_by uuid REFERENCES users(id),
        expires_at timestamptz NOT NULL,
        used_at timestamptz
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id uuid REFERENCES users(id),
        action text NOT NULL,
        target_type text,
        target_id uuid,
        created_at timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    `);
  }
}
