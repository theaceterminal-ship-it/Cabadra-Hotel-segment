# Cabadra

Hotel operations & guest experience — three pages (`/owner`, `/reception`, `/guest/:token`), one Supabase project, no separate backend.

## Local setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com), then in the SQL Editor run, **in order**:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_room_ops.sql`
   - `supabase/migrations/0003_ops_and_owner.sql`
   - `supabase/migrations/0004_guest_context_name.sql`
   - `supabase/migrations/0005_staff_mgmt_and_media.sql`
   - `supabase/migrations/0006_room_folio_checkout.sql` — folio settlement + checkout
   - `supabase/migrations/0007_notifications.sql` — in-app notifications (needs Realtime, see step 3b)
   - `supabase/migrations/0008_staff_onboarding.sql` — pending invites + the trigger `invite-staff` (step 3c) relies on
   - `supabase/migrations/0009_arrival_eta.sql` — arrival delay tracking
   - `supabase/migrations/0010_property_creation_image.sql` — photo at property creation
   - `supabase/seed.sql` (demo data — optional, safe to skip for a real deployment)

   3b. **Notifications need Realtime on**: Database > Replication (or Table Editor > `notifications` > enable Realtime) — 0007 already runs `alter publication supabase_realtime add table notifications`, but double-check it stuck if the bell never lights up.

   3c. **Deploy the staff-invite Edge Function** (only needed for onboarding a brand-new staff email end-to-end — granting an existing account still works without this):
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase functions deploy invite-staff
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically for every Edge Function on a linked project — no `supabase secrets set` needed. See `supabase/functions/invite-staff/index.ts` for what it does and why it can't be plain SQL.

   3d. **Setup-fee payments (Razorpay)** — required for creating any new property since `0067_organizations_and_setup_fee.sql`, which removes free property creation. In the Razorpay dashboard (Test Mode while trying it out) go to Account & Settings > API Keys and generate a key pair, then:
   ```bash
   supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx
   supabase functions deploy create-setup-order
   supabase functions deploy verify-setup-payment
   ```
   The fee is ₹4,999 per property; set `SETUP_FEE_PAISE` the same way to change it (and `SETUP_FEE_INR` in `src/lib/setupPayment.ts`, which is display-only). Going live is replacing the two keys with the `rzp_live_` pair. Deploy the functions and set the secrets **before** applying 0067, so there's no window where nobody can add a property.

   3e. **ID photo deletion** — guest ID photos are removed from the guest record 30 days after their last stay ends (pg_cron, 03:00 UTC) and the files are deleted from Cloudinary half an hour later by the `purge-id-document-files` Edge Function, which pg_cron calls through pg_net (`0068_id_document_file_deletion.sql`). One-time setup, with a random secret of your own in place of `<secret>`:
   ```sql
   -- SQL Editor
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<secret>', 'id_document_purge_cron_secret');
   ```
   ```bash
   supabase secrets set CRON_SECRET=<secret> CLOUDINARY_CLOUD_NAME=<same as VITE_CLOUDINARY_CLOUD_NAME> CLOUDINARY_API_KEY=xxx CLOUDINARY_API_SECRET=xxx
   supabase functions deploy purge-id-document-files --no-verify-jwt
   ```
   The Cloudinary key and secret are under Cloudinary Settings > API Keys. Until they're set, files wait in `id_document_deletions` and are deleted on the first run after. Check progress with `select result, count(*) from id_document_deletions group by 1;`.

   3f. **Owner sign-up and password emails (Resend)** — owners sign up with Google only (`/signup`). After their first property is paid for, `verify-setup-payment` emails a "set a password" link; "Forgot your password?" on `/login` sends one on request (`send-password-link`). The link opens `/set-password`. Needs `0069` and `0070`, and:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM="Cabadra <hello@churmuri.com>"
   supabase functions deploy send-password-link
   supabase functions deploy verify-setup-payment
   ```
   `RESEND_FROM` must be on a domain verified in Resend (Domains > Add domain, then the DNS records it shows). Links expire after Supabase's email OTP expiry (Authentication > Email, default 1 hour); a new one can always be requested from the sign-in page. Optional `SITE_URL` (default `https://hotel.churmuri.com`) sets where links land.

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   ```
   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Project Settings > API. Cloudinary vars are optional — only needed for the photo-upload buttons.

4. **Grant yourself access** — sign up at `/owner` or `/reception` in the app, then in the SQL Editor:
   ```sql
   select id, email from auth.users;
   insert into staff_properties (user_id, property_id, role)
   values ('<your-user-id>', '<a-property-id-you-created-or-seeded>', 'owner');
   ```

5. **Run it**
   ```bash
   npm run dev
   ```

### Optional: Google sign-in

Authentication > Sign In / Providers > Google in the Supabase dashboard, using a Google Cloud OAuth client whose authorized redirect URI is `https://<your-project-ref>.supabase.co/auth/v1/callback`. Add your dev/prod URLs under Authentication > URL Configuration > Redirect URLs (e.g. `http://localhost:3000/**`).

### Optional: Cloudinary (photo uploads)

Cloudinary dashboard > Settings > Upload > Add upload preset, Signing Mode **Unsigned**. Set `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` in `.env.local`. Without these, the photo fields still work as plain URL inputs — you just won't see the upload button.

## Deploying (Vercel)

1. Import the repo into Vercel — it auto-detects Vite, no config needed beyond `vercel.json` (already in this repo; it makes client-side routes like `/guest/:token` work on refresh/direct visit).
2. Add the same env vars from `.env.local` under Project Settings > Environment Variables.
3. Once deployed, add the production URL to Supabase's Redirect URLs (Authentication > URL Configuration) and, if using Google sign-in, to the Google Cloud OAuth client's authorized redirect URIs / JavaScript origins as needed.

## What's here

- `src/pages/` — the three top-level pages (`OwnerApp`, `ReceptionApp`, `GuestApp`) plus login/landing
- `src/lib/staffApi.ts`, `src/lib/guestApi.ts` — all Supabase access; RLS in the migrations is the real authorization boundary, not the client code
- `src/hooks/useNotifications.ts`, `src/components/NotificationBell.tsx` — the notification bell, fed live by Supabase Realtime
- `src/components/RoomFolioModal.tsx` — a room's itemized bill + the checkout/settle action
- `supabase/migrations/` — schema, RLS policies, and the SECURITY DEFINER functions that back guest actions and owner-only operations
- `supabase/functions/invite-staff/` — the one operation that needs a server: creating + emailing a brand-new staff account (service_role, never in the browser)
