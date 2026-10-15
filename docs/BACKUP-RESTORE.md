# Backups and restore drill

## What is backed up
The `Nightly backup` workflow (`.github/workflows/backup.yml`, 02:17 UTC, also runnable by hand) produces, encrypted with [age](https://github.com/FiloSottile/age):
- `db-<timestamp>.dump.age`: `pg_dump --format=custom` of the `public`, `auth` and `storage` schemas (accounts, profiles, all business data, storage metadata).
- `storage-<timestamp>.tar.gz.age`: a copy of the `client-uploads` bucket (documents and signatures).
Kept as a private workflow artifact for 30 days. For a longer history, download a monthly copy to storage you control.

It does nothing until the secrets below exist, so it can be merged safely.

## One-time setup (Mo)
1. Generate a key pair on your own computer: `age-keygen -o backup-key.txt`. **Keep `backup-key.txt` safe and offline (password manager). Without it the backups cannot be read; anyone who has it can read them.** The line starting `age1...` is the public key.
2. GitHub > Settings > Secrets and variables > Actions, add as repository secrets:
   - `BACKUP_AGE_PUBLIC_KEY`: the `age1...` public key.
   - `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`: the same two secrets the deploy workflow uses. The workflow links the project with them and connects through the Supabase session pooler (GitHub runners have no IPv6), so no connection string is needed. If the database password is ever reset, update `SUPABASE_DB_PASSWORD` in GitHub too.
   The workflow stays inert until all three exist.
3. Run the workflow once by hand (Actions > Nightly backup > Run workflow) and confirm an artifact appears.
4. Paid Supabase plans also take their own daily backups (dashboard > Database > Backups); keep both.

## Restore drill (do this once before launch, then every quarter)
Always restore into a **new, empty** Supabase project, never over production, and time it.
1. Download the artifact, decrypt: `age -d -i backup-key.txt -o db.dump db-<timestamp>.dump.age` (same for storage).
2. Create a new Supabase project. Apply the repo schema first so policies and functions exist: `supabase link --project-ref <new-ref> && supabase db push`.
3. Restore the data: `pg_restore --data-only --disable-triggers --no-owner -d "<new session-pooler url>" db.dump` (use `--clean --if-exists` instead of `--data-only` to restore everything including the dump's schema objects).
4. Upload the storage copy: `supabase storage cp -r ./storage/client-uploads ss:///client-uploads --linked --experimental`.
5. Point a staging build (`VITE_SUPABASE_URL` and key of the new project) at it and log in as an accountant and a client; open a signed document.
6. Write down: how long it took, what failed, what you changed in this runbook.

## Disaster checklist
- Loss of data only: restore into a new project as above, then switch `VITE_SUPABASE_URL` / key in Cloudflare Pages and redeploy; redeploy functions.
- Accidental deletion of a few rows: restore into a scratch project and copy the rows back with SQL.
- Recovery objectives to confirm with Mo: at most 24 h of data loss (nightly), a few hours to restore.
