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
