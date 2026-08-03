/*
# Create challenges table (single-tenant, no auth)

1. New Tables
- `challenges` — stores compounding challenge definitions and progress
  - `id` (uuid, primary key)
  - `name` (text, challenge name)
  - `config` (jsonb, full ChallengeConfig object)
  - `days` (jsonb, array of DayRow objects with session data)
  - `stats` (jsonb, computed ChallengeStats snapshot)
  - `status` (text, 'active' | 'paused' | 'completed' | 'stopped')
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
2. Security
- Enable RLS on `challenges`.
- Allow anon + authenticated CRUD (single-tenant app, no sign-in).
*/

CREATE TABLE IF NOT EXISTS challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Challenge',
  config jsonb NOT NULL DEFAULT '{}',
  days jsonb NOT NULL DEFAULT '[]',
  stats jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_challenges" ON challenges;
CREATE POLICY "anon_select_challenges" ON challenges FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_challenges" ON challenges;
CREATE POLICY "anon_insert_challenges" ON challenges FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_challenges" ON challenges;
CREATE POLICY "anon_update_challenges" ON challenges FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_challenges" ON challenges;
CREATE POLICY "anon_delete_challenges" ON challenges FOR DELETE
  TO anon, authenticated USING (true);
