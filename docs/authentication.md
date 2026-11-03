# Account administration

Existing usernames, password hashes, and study assignments are preserved by migration `b7e230a1d952`. Existing accounts remain active. Older login tokens remain valid until their normal expiry unless the account is reset or suspended.

## Deployment

1. Back up the PostgreSQL database and verify that the backup can be read.
2. Apply the database migration before loading the updated application code: `python -m alembic upgrade head` from `backend/`, with the database environment configured.
3. Restart the backend and rebuild or restart the frontend.
4. Verify an existing account, study permissions, and the admin panel.

The migration supports an existing user table and a fresh database. It adds account fields and two tables. It does not rewrite password hashes or study assignments. The initial migration is empty, so the new migration also creates the baseline user table on fresh installations.

## Copy links and email drafts

The admin panel creates setup links without a mail service. After creating a user, use **Copy setup link** or **Open invitation email**. Existing accounts have **Prepare reset link**; pending accounts have **Prepare setup link**. Both actions use the same generated link until a replacement is requested. Replacement links invalidate previous links for that account.

**Open invitation email** uses a `mailto:` link addressed to the account email. The default mail application opens a draft with the username, setup link, expiry, and login instructions. The administrator chooses the sender account and sends it. This does not send mail automatically or select a specific Outlook mailbox. If no mail application is configured, copy the link into webmail.

Links use the address currently open in the browser. Generate links from the deployed HTTPS dashboard for remote recipients; a local-only dashboard address will not be reachable from their computers. Link values stay in page memory and are cleared on dismissal or navigation. They are not stored in browser storage; only their hashes are stored in the database. Losing the link requires generating a replacement.

## Optional SMTP configuration

Add the settings from `backend/.env.example` to the backend's runtime environment. Recreate the backend container after changing container environment settings. Keep credentials out of version control and container images.

- `DASHBOARD_PUBLIC_URL`: canonical HTTPS origin, without a path. HTTP is accepted only for localhost development.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`: approved mail relay and sender.
- `SMTP_TLS_MODE`: `starttls` for port 587, or `tls` for implicit TLS on port 465.
- `SMTP_USERNAME`, `SMTP_PASSWORD`: relay credentials, when required.

Configure sender-domain authentication with the mail administrator. The application does not send real email during automated tests.

An invitation or reset link expires after 24 hours. Only its SHA-256 digest is stored. Opening an email link does not consume it; successful password submission does. Resending a link or changing the account email invalidates previous links. Delivery failures are shown in the admin panel, leave the account saved, and invalidate the unsent link. Resend after correcting the mail configuration.

Manual user creation and manual admin password resets remain available when email is unavailable. Uncheck **Let the user set their password using a setup link** to create an account with an initial password.

## Access controls

- Study assignments can be changed only by administrators. Existing admin profile add/remove controls remain available.
- Users cannot change their own passwords or request recovery links.
- Password reset completion revokes existing sessions. Sending a reset email alone does not change a working password; suspend the account to block access immediately.
- Suspending and reactivating an account revokes its old sessions. The current administrator and the primary `admin` account cannot be suspended from the panel.
- User previews last 15 minutes, apply the selected researcher's permissions, and reject writes on the server. Other administrators cannot be previewed. Preview sessions are isolated to the current browser tab.
- Preview start and exit are recorded in `useraccessaudit`. `expires_at` records the end of validity when the tab closes without an explicit exit. Revoking the actor's or target's sessions also revokes previews.

Passwords remain bcrypt hashes. New passwords are limited to 72 UTF-8 bytes to avoid bcrypt truncation. Browser-saved credentials continue to use the existing username, login URL, and password.

## Verification

Install `backend/requirements-test.txt` in an isolated environment. From `backend/`, run `pytest`.

Tests use in-memory SQLite by default. PostgreSQL locking tests require `AUTH_TEST_DATABASE_URL` and `AUTH_TEST_SYNC_DATABASE_URL`, pointing to a disposable PostgreSQL database with asyncpg and psycopg2 URLs respectively. The suite recreates its tables; never point these settings at a development or production database containing accounts.

Run `node --test tests/invitation.test.cjs` to check the email draft formatting. Run `npm run build` from `frontend/`. The existing Next.js configuration skips type validation during builds; run `npx tsc --noEmit --incremental false` separately. Existing reporting-component type errors are outside this change.

## Rollback

The added database fields are compatible with the previous application. Reverting application code does not require removing the fields or dropping tables. The previous application does not enforce suspension or session revocation, so use maintenance access restrictions before reverting a deployment that relies on those controls. Keep the database backup until verification is complete. The migration intentionally refuses an automatic destructive downgrade.

## Separate deployment work

Login and mail-request rate limits, production port restrictions, and a migration from browser-stored tokens to HttpOnly cookies remain separate deployment changes. Cookie authentication also requires CSRF protection.
