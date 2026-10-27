# Phone (SMS) codes through Twilio: built, NOT deployed

Nothing in this folder is applied or deployed by the normal steps. It sits here until the SMS option is switched on.
Email codes and the stay link (migration 0091, the `stay-access-code` function) work without any of this.

## What it adds
The same stay code as the email one, delivered as a text message to the guest's phone number (with country code).
A guest can still ask for a new one from the QR page; the code only ever goes to the number on file.

## Pieces
- `0092_stay_code_sms.sql`: lets `system_issue_stay_code` and `system_guest_resend_stay_code` take channel `sms`, and adds the `+91•••••••21` mask.
- `stay-access-code-sms/index.ts`: Edge Function (copy to `supabase/functions/` to deploy). Staff-triggered 'issue' and guest 'resend', through Twilio.
- `smsTwilio.ts`: the Twilio call (copy to `supabase/functions/_shared/`).
- Client: `SMS_OTP_ENABLED` in `src/lib/stayAccess.ts` (false now). Turning it on enables the "Text code" choice in the check-in box and the QR page's resend by SMS.

## To switch it on (in this order)
1. Twilio: an account, a sender (a Messaging Service, or a number / alphanumeric sender), and for India the DLT registration of the template below.
2. `supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_MESSAGING_SERVICE_SID=...` (or `TWILIO_FROM=+1...`).
3. Apply `0092_stay_code_sms.sql` (move it into `supabase/migrations/` first).
4. Copy the function and the shared file into `supabase/functions/`, then `supabase functions deploy stay-access-code-sms`.
5. Set `SMS_OTP_ENABLED = true`, build, deploy the site. Run `supabase/tests/security/attack.sh` first.

## Message template (register this for DLT in India)
`{#var#} is your room service code for {#var#}, Room {#var#}. Scan the QR in your room and enter it once. Do not share it. - Cabadra`

## Cost and risk notes
- One text per stay at check-in plus any "send again" (limited to 3 an hour per stay and 10 an hour per caller address by the database).
- Numbers outside India cost more; email or WhatsApp is cheaper for those guests.
- Unlike Firebase's built-in SMS, this sends only from the server to the number on the booking, so strangers can't make it text arbitrary numbers.
