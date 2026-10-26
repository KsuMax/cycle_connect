---
name: create-migration
description: Create a new Supabase SQL migration file with standard naming convention and RLS template
disable-model-invocation: true
---

Create a new migration file in supabase/migrations/ with the format:
NNN_<name>.sql — NNN is the next three-digit number after the highest existing file (e.g. 066 → 067).

Steps:
1. Ask the user for the migration name (snake_case) and the SQL DDL if not provided in the arguments
2. Find the highest existing number: `ls supabase/migrations | sort | tail -1`
3. Create the file at supabase/migrations/<NNN>_<name>.sql with this structure:

```sql
-- Migration: <name>
-- Created: <date>
-- Description: <brief description>

-- ============================================================
-- UP
-- ============================================================

<SQL DDL here>

-- Enable RLS (if creating a new table)
-- ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;

-- RLS Policies (add as needed)
-- CREATE POLICY "Users can view their own data"
--   ON public.<table_name> FOR SELECT
--   USING (auth.uid() = user_id);

-- ============================================================
-- ROLLBACK (run manually if needed)
-- ============================================================

-- DROP TABLE IF EXISTS public.<table_name>;
```

4. After creating the file, show the user the full path and remind them that migrations are NOT applied by the deploy workflow — they are applied by hand on the VPS (see docs/RUNBOOK.md, «Миграции»). Never use the Supabase MCP: it only reaches the obsolete cloud project.
