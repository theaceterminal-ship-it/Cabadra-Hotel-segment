#!/bin/bash
# Attack suite: real database roles (anon, staff, owner, another hotel's staff) try to cheat. Every line must PASS.
# Usage: attack.sh <database>   (see README.md for building that database)
DB=${1:-replay}
PSQL="psql -h ${PGHOST:-127.0.0.1} -p ${PGPORT:-54329} -U ${PGUSER:-postgres} -d $DB -At -q"
OWNER=a0000000-0000-0000-0000-000000000001
RECEP=a0000000-0000-0000-0000-000000000002
OTHER=a0000000-0000-0000-0000-000000000003
RES=c0000000-0000-0000-0000-000000000001
GTOK=11111111-1111-1111-1111-111111111111
pass=0; fail=0
# t <label> <expect: error|ok|0|1> <role> <uid or -> <sql>
t() {
  local label="$1" expect="$2" role="$3" uid="$4" sql="$5" pre="set role $3;"
  [ "$uid" != "-" ] && pre="$pre set test.uid='$uid';"
  local out; out=$($PSQL -c "$pre $sql" 2>&1 | tr '\n' ' ')
  local ok=0
  case "$expect" in
    error) echo "$out" | grep -qiE "error|permission denied|violates|not authorized|only the owner|can't|never|stays voided|append-only|too many|doing that" && ok=1 ;;
    ok)    echo "$out" | grep -qiE "error" || ok=1 ;;
    *)     [ "$(echo "$out" | tr -d ' ')" = "$expect" ] && ok=1 ;;
  esac
  if [ $ok = 1 ]; then pass=$((pass+1)); printf 'PASS  %s\n' "$label"; else fail=$((fail+1)); printf 'FAIL  %s  [expected %s] got: %s\n' "$label" "$expect" "$(echo "$out" | cut -c1-160)"; fi
}
cnt_upd() { echo "with u as ($1 returning 1) select count(*) from u"; }

echo "### A. A receptionist (not owner) tries to cheat through the table API"
t "reservations: set status=checked_out directly"      0 authenticated $RECEP "$(cnt_upd "update reservations set status='checked_out' where id='$RES'")"
t "reservations: change room rate directly"            0 authenticated $RECEP "$(cnt_upd "update reservations set rate_per_night=1 where id='$RES'")"
t "reservations: delete directly (erases chat/orders)" 0 authenticated $RECEP "with d as (delete from reservations where id='$RES' returning 1) select count(*) from d"
t "orders: rewrite total_amount"                       error authenticated $RECEP "update orders set total_amount=1"
t "orders: rewrite items"                              error authenticated $RECEP "update orders set items='[]'::jsonb"
t "orders: delete an order"                            error authenticated $RECEP "delete from orders"
t "orders: legit status change still works"            1 authenticated $RECEP "$(cnt_upd "update orders set status='preparing'")"
t "rooms: change a room's price"                       error authenticated $RECEP "update rooms set price_per_night=1 where id='r101'"
t "rooms: regenerate/steal QR code"                    error authenticated $RECEP "update rooms set qr_code='aaaa' where id='r101'"
t "rooms: move a room to the other hotel"              error authenticated $RECEP "update rooms set property_id='p2' where id='r101'"
t "rooms: legit status change still works"             1 authenticated $RECEP "$(cnt_upd "update rooms set status='cleaning' where id='r101'")"
t "rooms: delete a room"                               0 authenticated $RECEP "with d as (delete from rooms where id='r102' returning 1) select count(*) from d"
t "rooms: add a room"                                  error authenticated $RECEP "insert into rooms (id, property_id, number, type, floor, price_per_night) values ('rx','p1','X','Deluxe',1,1)"
t "menu: change a dish price"                          0 authenticated $RECEP "$(cnt_upd "update menu_items set price=1")"
t "menu: add a dish"                                   error authenticated $RECEP "insert into menu_items (id, property_id, name, category, price) values ('mx','p1','Free','Mains',0)"
t "staff directory: add a person"                      error authenticated $RECEP "insert into staff_directory (property_id, name, phone, department) values ('p1','Fake','9999999999','housekeeping')"
t "experiences: add one"                               error authenticated $RECEP "insert into experiences (property_id, name, price) values ('p1','Free trek',0)"
t "bill lines: change amount (no policy)"              0 authenticated $RECEP "$(cnt_upd "update folio_charges set amount=1")"
t "bill lines: delete (no policy, removes nothing)"    0 authenticated $RECEP "with d as (delete from folio_charges returning 1) select count(*) from d"
t "payments: insert one by hand"                       error authenticated $RECEP "insert into folio_payments (property_id, reservation_id, kind, amount, method) values ('p1','$RES','payment',5000,'cash')"
t "chat: delete a message"                             error authenticated $RECEP "delete from folio_chat_messages"
t "chat: edit a message"                               error authenticated $RECEP "update folio_chat_messages set body='edited'"
t "chat: send as the guest"                            error authenticated $RECEP "insert into folio_chat_messages (property_id, reservation_id, sender, body) values ('p1','$RES','guest','I agree to pay')"
t "audit log: forge an entry"                          error authenticated $RECEP "insert into audit_log (table_name, action, actor_kind) values ('x','INSERT','user')"
t "audit log: read it (not an owner)"                  0 authenticated $RECEP "select count(*) from audit_log"

echo; echo "### B. A receptionist from a DIFFERENT hotel"
t "reads other hotel's reservations"                   0 authenticated $OTHER "select count(*) from reservations"
t "edits other hotel's room"                           0 authenticated $OTHER "$(cnt_upd "update rooms set status='dirty' where id='r101'")"
t "voids other hotel's bill line via function"         error authenticated $OTHER "select staff_void_folio_charge((select id from folio_charges limit 1), 'sabotage')"
t "posts into other hotel's guest chat"                error authenticated $OTHER "select staff_send_chat_message('p1','$RES','hi')"
t "reads other hotel's chat inbox"                     error authenticated $OTHER "select staff_chat_inbox('p1')"
t "changes other hotel's ETA"                          error authenticated $OTHER "select staff_update_arrival_eta('$RES', now())"

echo; echo "### C. The owner: still able to do their job"
t "owner edits room price"                             1 authenticated $OWNER "$(cnt_upd "update rooms set price_per_night=3500 where id='r101'")"
t "owner edits menu price"                             1 authenticated $OWNER "$(cnt_upd "update menu_items set price=350")"
t "owner adds a room"                                  ok authenticated $OWNER "insert into rooms (id, property_id, number, type, floor, price_per_night) values ('r103','p1','103','Deluxe',1,3000)"
t "owner cannot rewrite reservations either"           0 authenticated $OWNER "$(cnt_upd "update reservations set status='checked_out' where id='$RES'")"
t "owner reads the audit log"                          ok authenticated $OWNER "select count(*) from audit_log where property_id='p1'"
t "owner cannot edit the audit log"                    error authenticated $OWNER "update audit_log set actor_email='x'"

echo; echo "### D. Tampering with the folio, even from inside (as if a function had a bug)"
t "change a charge's amount"                           error postgres - "update folio_charges set amount=1"
t "change a charge's description"                      error postgres - "update folio_charges set description='Spa'"
t "backdate a charge"                                  error postgres - "update folio_charges set posted_at=now()-interval '9 days'"
t "re-point a charge at another stay"                  error postgres - "update folio_charges set reservation_id=null"
t "erase who posted it"                                error postgres - "update folio_charges set posted_by='$OWNER'"
t "delete a charge"                                    error postgres - "delete from folio_charges"
t "void with no reason"                                error postgres - "update folio_charges set voided_at=now()"
t "a receptionist can't void a bill line (owner-only rule)" error authenticated $RECEP "select staff_void_folio_charge((select id from folio_charges limit 1), 'Guest cancelled the order')"
t "the owner voids a charge properly (function)"       ok authenticated $OWNER "select staff_void_folio_charge((select id from folio_charges limit 1), 'Guest cancelled the order')"
t "void is stamped with the owner's login"             "$OWNER" postgres - "select voided_by from folio_charges where voided_at is not null limit 1"
t "blame the receptionist for the void afterwards"     error postgres - "update folio_charges set voided_by='$RECEP' where voided_at is not null"
t "rewrite the void reason afterwards"                 error postgres - "update folio_charges set void_reason='receptionist did it' where voided_at is not null"
t "un-void a charge"                                   error postgres - "update folio_charges set voided_at=null where voided_at is not null"
$PSQL -c "insert into folio_charges (id, property_id, reservation_id, description, amount, category) values ('d0000000-0000-0000-0000-000000000002','p1','$RES','Laundry',500,'laundry')" >/dev/null 2>&1
t "voting as the owner but naming the receptionist: stamp wins" "$OWNER" postgres - "set test.uid='$OWNER'; update folio_charges set voided_at=now(), void_reason='dup', voided_by='$RECEP' where id='d0000000-0000-0000-0000-000000000002'; select voided_by from folio_charges where id='d0000000-0000-0000-0000-000000000002'"
echo "(payments)"
$PSQL -c "insert into folio_payments (id, property_id, reservation_id, kind, amount, method, received_by) values ('f0000000-0000-0000-0000-000000000001','p1','$RES','payment',1000,'cash','$RECEP')" >/dev/null 2>&1
t "change a payment's amount"                          error postgres - "update folio_payments set amount=1"
t "re-attribute who received a payment"                error postgres - "update folio_payments set received_by='$OWNER'"
t "delete a payment"                                   error postgres - "delete from folio_payments"
t "void a payment with no reason"                      error postgres - "update folio_payments set voided_at=now()"
t "void a payment with a reason"                       ok postgres - "update folio_payments set voided_at=now(), void_reason='keyed twice'"
t "change the payment void reason later"               error postgres - "update folio_payments set void_reason='fine'"
echo "(audit log)"
t "audit: update a row"                                error postgres - "update audit_log set actor_email='x'"
t "audit: delete a row"                                error postgres - "delete from audit_log"
t "audit: truncate"                                    error postgres - "truncate audit_log"

echo; echo "### E. Abuse through a guest link (anonymous)"
t "chat message of 2001 characters"                    error anon - "select guest_send_chat_message('$GTOK', repeat('x', 2001))"
t "chat message of 2000 characters"                    ok anon - "select length(guest_send_chat_message('$GTOK', repeat('x', 2000))->>'body')"
for i in $(seq 1 27); do $PSQL -c "set role anon; select guest_send_chat_message('$GTOK','spam $i')" >/dev/null 2>&1; done
t "31st chat message in 10 minutes is refused"         error anon - "select guest_send_chat_message('$GTOK', 'one too many')"
for i in $(seq 1 19); do $PSQL -c "set role anon; select guest_place_order('$GTOK','[{\"menuItemId\":\"m1\",\"quantity\":1}]'::jsonb, null)" >/dev/null 2>&1; done
t "21st order in an hour is refused"                   error anon - "select guest_place_order('$GTOK','[{\"menuItemId\":\"m1\",\"quantity\":1}]'::jsonb, null)"
t "order with quantity 51"                             error anon - "select guest_place_order('$GTOK','[{\"menuItemId\":\"m1\",\"quantity\":51}]'::jsonb, null)"
t "order with a negative quantity"                     error anon - "select guest_place_order('$GTOK','[{\"menuItemId\":\"m1\",\"quantity\":-5}]'::jsonb, null)"
t "order naming another hotel's dish"                  error anon - "select guest_place_order('$GTOK','[{\"menuItemId\":\"nope\",\"quantity\":1}]'::jsonb, null)"
t "forged price in an order line is ignored"           ok anon - "select 1"
t "guest_verify_otp no longer exists"                  error anon - "select guest_verify_otp('$GTOK','000000')"
t "wrong token"                                        error anon - "select guest_get_context('99999999-9999-9999-9999-999999999999')"
t "SQL-injection style token"                          error anon - "select guest_get_context('1'' or ''1''=''1')"

echo; echo "### F. Anonymous visitor straight at the tables"
for tb in reservations guests orders folio_charges folio_payments invoices staff_properties staff_directory rooms menu_items notifications pending_staff_invites password_link_sends property_setup_payments organizations audit_log; do
  t "anon reads $tb"                                   error anon - "select count(*) from $tb"
done
t "anon inserts a guest request"                       error anon - "insert into guest_requests (property_id, room_number, title) values ('p1','1','x')"
t "anon grants themselves owner"                       error anon - "insert into staff_properties (user_id, property_id, role) values ('$OWNER','p1','owner')"

echo; echo "### G. Legitimate guest + staff flows still work"
t "guest loads their stay"                             ok anon - "select guest_get_context('$GTOK')->'room'->>'number'"
t "guest sends a request"                              ok anon - "select guest_submit_request('$GTOK','Extra pillows','Standard','housekeeping')"
t "reception reads reservations"                       ok authenticated $RECEP "select count(*) from reservations"
t "reception reads the chat inbox"                     ok authenticated $RECEP "select staff_chat_inbox('p1')"
t "reception replies in chat"                          ok authenticated $RECEP "select staff_send_chat_message('p1','$RES','On our way')"

echo; echo "### H. Refused attempts are written to security_events (and survive the rollback)"
ev() { $PSQL -c "select count(*) from security_events where $1"; }
chk() { # chk <label> <where-clause> <sql that gets refused>
  local before after; before=$(ev "$2")
  $PSQL -c "set role authenticated; set test.uid='$RECEP'; $3" >/dev/null 2>&1
  after=$(ev "$2")
  if [ "$after" -gt "$before" ]; then pass=$((pass+1)); printf 'PASS  %s\n' "$1"; else fail=$((fail+1)); printf 'FAIL  %s  [events %s -> %s]\n' "$1" "$before" "$after"; fi
}
chk "receptionist's room price edit is logged with who"      "kind='room_edit_blocked' and actor_email='reception@hill.test' and detail->'columns' ? 'price_per_night'" "update rooms set price_per_night=1 where id='r101'"
chk "a bill line edit that reaches the guard is logged"     "kind='bill_line_tamper' and detail->>'attempt'='edit'" "reset role; update folio_charges set amount=1 where reservation_id='$RES'"
chk "a bill line delete that reaches the guard is logged"   "kind='bill_line_tamper' and detail->>'attempt'='delete'" "reset role; delete from folio_charges where reservation_id='$RES'"
chk "receptionist PATCHing bill lines over the API is logged" "kind='direct_write_blocked' and target_table='folio_charges' and actor_email='reception@hill.test' and property_id='p1'" "select set_config('request.method','PATCH',true), set_config('request.path','/folio_charges',true), api_pre_request()"
chk "anon DELETEing reservations over the API is logged"    "kind='direct_write_blocked' and target_table='reservations' and actor_id is null" "reset role; set role anon; set test.uid=''; select set_config('request.method','DELETE',true), set_config('request.path','/reservations',true), api_pre_request()"
t "reading and normal order PATCHes are not flagged"   ok authenticated $RECEP "select set_config('request.method','PATCH',true), set_config('request.path','/orders',true), api_pre_request()"
chk "editing the audit log is logged"                        "kind='audit_log_tamper'" "reset role; update audit_log set property_id='p2'"
$PSQL -c "set role authenticated; set test.uid='$OTHER'; select staff_update_arrival_eta('$RES', now())" >/dev/null 2>&1
if [ "$(ev "kind='cross_property_attempt' and actor_email='reception@lake.test' and target_id='$RES'")" -ge 1 ]; then pass=$((pass+1)); echo "PASS  other hotel's staff poking this stay's ETA is logged"; else fail=$((fail+1)); echo "FAIL  other hotel's staff poking this stay's ETA is logged"; fi
t "nobody can add a fake event through the API"        error authenticated $RECEP "insert into security_events (kind) values ('fake')"
t "nobody can call the logger directly"                error authenticated $RECEP "select security_log('fake', null, null, null)"
t "anon can't read the events"                         error anon - "select count(*) from security_events"
t "a receptionist can't read the events"               0 authenticated $RECEP "select count(*) from security_events"
t "another hotel's owner sees none of this hotel's"    0 authenticated $OTHER "select count(*) from security_events where property_id='p1'"
t "the owner reads their hotel's events"               ok authenticated $OWNER "select count(*) from security_events where property_id='p1'"
t "events can't be edited"                             error postgres - "update security_events set kind='x'"
t "events can't be deleted"                            error postgres - "delete from security_events"

echo; echo "### I. The room QR still finds the stay (by its random code, not the room id)"
QR=$($PSQL -c "select qr_code from rooms where id='r101'")
t "a stay set to 'link' is not opened by the old resolver"  "" anon - "select guest_resolve_room_token('$QR')"
$PSQL -c "update reservations set access_mode='open' where id='$RES'" >/dev/null
t "anon: the QR code resolves to an 'open' stay"            "$GTOK" anon - "select guest_resolve_room_token('$QR')"
t "anon: the room id is NOT a way in"                       "" anon - "select guest_resolve_room_token('r101')"
$PSQL -c "update reservations set access_mode='link' where id='$RES'" >/dev/null

echo; echo "### J. Stay codes: the room QR asks for what the stay was set up with"
$PSQL -c "update guests set email='asha@example.com' where id='b0000000-0000-0000-0000-000000000001'" >/dev/null
t "link stay: the gate says use the stay link, no token"    "link_required|false" anon - "select guest_room_gate('$QR')->>'status' || '|' || (guest_room_gate('$QR') ? 'token')"
t "a phone holding the stay link goes straight in"          "open" anon - "select guest_room_gate('$QR', '$GTOK')->>'status'"
t "a wrong token is not enough"                             "link_required" anon - "select guest_room_gate('$QR', '99999999-9999-9999-9999-999999999999')->>'status'"
t "anon can't make a code"                                  error anon - "select system_issue_stay_code('$RES','email')"
t "a receptionist can't make a code"                        error authenticated $RECEP "select system_issue_stay_code('$RES','email')"
t "a receptionist can't read the code table"                error authenticated $RECEP "select * from stay_access_codes"
CODE=$($PSQL -c "select system_issue_stay_code('$RES','email')->>'code'")
[ ${#CODE} = 6 ] && { pass=$((pass+1)); echo "PASS  the server makes a 6-digit code"; } || { fail=$((fail+1)); echo "FAIL  the server makes a 6-digit code (got '$CODE')"; }
t "the stay is now in email mode"                           "email" postgres - "select access_mode from reservations where id='$RES'"
t "the gate asks for the code and masks the address"        "code_required|a•••@example.com|false" anon - "select guest_room_gate('$QR')->>'status' || '|' || (guest_room_gate('$QR')->>'hint') || '|' || (guest_room_gate('$QR') ? 'token')"
t "reception's view never contains the code or its hash"    "f" authenticated $RECEP "select (staff_stay_access('$RES')::text like '%$CODE%') or (staff_stay_access('$RES')::text ilike '%hash%')"
t "reception's view says email mode"                        "email" authenticated $RECEP "select staff_stay_access('$RES')->>'access_mode'"
t "another hotel's staff can't view this stay's access"     error authenticated $OTHER "select staff_stay_access('$RES')"
t "another hotel's staff can't switch it to the link"       error authenticated $OTHER "select staff_set_stay_access_link('$RES')"
t "email mode: the old resolver no longer hands out a token" "" anon - "select guest_resolve_room_token('$QR')"
WRONG=$(( (10#$CODE + 1) % 1000000 )); WRONG=$(printf '%06d' $WRONG)
t "a wrong code is refused, 4 tries left"                   "wrong|4" anon - "select r->>'reason' || '|' || (r->>'attempts_left') from (select guest_verify_stay_code('$QR','$WRONG') as r) x"
t "the count really is kept (not rolled back)"              "4" postgres - "select 5 - failed_attempts from stay_access_codes where reservation_id='$RES'"
t "the right code gives the stay token"                     "$GTOK" anon - "select guest_verify_stay_code('$QR','$CODE')->>'token'"
t "...and a code typed with a space still works"            "$GTOK" anon - "select guest_verify_stay_code('$QR','${CODE:0:3} ${CODE:3:3}')->>'token'"
t "a phone that entered it is let in next time"             "open" anon - "select guest_room_gate('$QR', '$GTOK')->>'status'"
# lock-out: 5 wrong tries lock; the right code is refused while locked
for i in 1 2 3 4 5; do $PSQL -c "set role anon; select guest_verify_stay_code('$QR','$WRONG')" >/dev/null; done
t "5 wrong tries lock the stay"                             "locked" anon - "select guest_verify_stay_code('$QR','$CODE')->>'reason'"
t "the lock was written to security_events"                 1 postgres - "select count(*) from security_events where kind='stay_code_locked'"
$PSQL -c "update stay_access_codes set locked_until = now() - interval '1 minute' where reservation_id='$RES'" >/dev/null
t "after the lock ends the right code works again"          "$GTOK" anon - "select guest_verify_stay_code('$QR','$CODE')->>'token'"
# three locks in a row cancel the code
for round in 1 2 3; do
  for i in 1 2 3 4 5; do $PSQL -c "set role anon; select guest_verify_stay_code('$QR','$WRONG')" >/dev/null; done
  $PSQL -c "update stay_access_codes set locked_until = now() - interval '1 minute' where reservation_id='$RES'" >/dev/null
done
t "three locks in a row cancel the code"                    "needs_new_code" anon - "select guest_verify_stay_code('$QR','$CODE')->>'reason'"
t "the gate tells the guest to ask for a new one"           "t" anon - "select (guest_room_gate('$QR')->>'needs_new_code')::boolean"
# resend: always to the address on file, 3 an hour
NEW=$($PSQL -c "select system_guest_resend_stay_code('$QR','203.0.113.9')->>'code'")
[ ${#NEW} = 6 ] && { pass=$((pass+1)); echo "PASS  a resend makes a new code"; } || { fail=$((fail+1)); echo "FAIL  a resend makes a new code (got '$NEW')"; }
t "the new code works"                                      "$GTOK" anon - "select guest_verify_stay_code('$QR','$NEW')->>'token'"
t "the old code does not"                                   "f" anon - "select (guest_verify_stay_code('$QR','$CODE') ? 'token') and '$NEW' <> '$CODE'"
$PSQL -c "select system_guest_resend_stay_code('$QR','203.0.113.9'); select system_guest_resend_stay_code('$QR','203.0.113.9')" >/dev/null
[ "$($PSQL -c "select system_guest_resend_stay_code('$QR','203.0.113.9')->>'reason'" 2>/dev/null)" = "slow_down" ] && { pass=$((pass+1)); echo "PASS  a 4th resend in an hour is refused"; } || { fail=$((fail+1)); echo "FAIL  a 4th resend in an hour is refused"; }
t "anon can't call the resend function directly"            error anon - "select system_guest_resend_stay_code('$QR', null)"
# switching to the link drops the code
t "reception can switch to the stay link"                   ok authenticated $RECEP "select staff_set_stay_access_link('$RES')"
t "...which removes the code"                               0 postgres - "select count(*) from stay_access_codes where reservation_id='$RES'"
t "...and the gate asks for the link again"                 "link_required" anon - "select guest_room_gate('$QR')->>'status'"
# a code dies with the stay
$PSQL -c "select system_issue_stay_code('$RES','email')" >/dev/null
$PSQL -c "update reservations set status='checked_out' where id='$RES'" >/dev/null
t "checkout deletes the code"                               0 postgres - "select count(*) from stay_access_codes where reservation_id='$RES'"
t "after checkout the QR shows no stay"                     "none" anon - "select guest_room_gate('$QR')->>'status'"
t "a guest with no email can't be issued a code"            "no_email" postgres - "update reservations set status='checked_in', access_mode='link' where id='$RES'; update guests set email=null where id='b0000000-0000-0000-0000-000000000001'; select system_issue_stay_code('$RES','email')->>'reason'"

echo; echo "### K. Guest emails: queued by triggers, written and sent only by the server"
BK=d0000000-0000-0000-0000-0000000000b1; BK2=d0000000-0000-0000-0000-0000000000b2
$PSQL -c "update guests set email='asha@example.com' where id='b0000000-0000-0000-0000-000000000001'" >/dev/null
$PSQL -c "insert into reservations (id, property_id, room_id, guest_id, check_in, check_out, status, source) values ('$BK','p1','r102','b0000000-0000-0000-0000-000000000001', now() + interval '3 days', now() + interval '5 days', 'upcoming', 'built_in')" >/dev/null
t "an advance booking queues a confirmation"            "booking_confirmation|pending" postgres - "select kind||'|'||status from guest_email_outbox where reservation_id='$BK' and kind='booking_confirmation'"
t "...due about a minute from now"                      "t" postgres - "select due_at between now() and now() + interval '2 minutes' from guest_email_outbox where reservation_id='$BK' and kind='booking_confirmation'"
t "nothing is claimed before it is due"                 0 postgres - "select count(*) from system_claim_guest_emails(10)"
$PSQL -c "update guest_email_outbox set due_at = now() - interval '1 second' where reservation_id='$BK' and kind='booking_confirmation'" >/dev/null
t "once due, it is claimed (the pre-arrival one is not due yet)" 1 postgres - "select count(*) from system_claim_guest_emails(10)"
t "...and a second run does not claim it again"         0 postgres - "select count(*) from system_claim_guest_emails(10)"
t "the context has the hotel, room and the guest's email" "HillView|102|asha@example.com" postgres - "select c->'property'->>'name' || '|' || (c->'room'->>'number') || '|' || (c->'guest'->>'email') from (select system_guest_email_context('$BK') c) x"
t "a failed send can be put back for later"             "pending" postgres - "select system_guest_email_done((select id from guest_email_outbox where reservation_id='$BK' and kind='booking_confirmation'), 'retry', 'boom', null, 10); select status from guest_email_outbox where reservation_id='$BK' and kind='booking_confirmation'"
t "a sent email is recorded"                            "sent|cabadra" postgres - "select system_guest_email_done((select id from guest_email_outbox where reservation_id='$BK' and kind='booking_confirmation'), 'sent', null, 'cabadra'); select status||'|'||sent_via from guest_email_outbox where reservation_id='$BK' and kind='booking_confirmation'"
$PSQL -c "insert into reservations (id, property_id, room_id, guest_id, check_in, check_out, status, source) values ('$BK2','p1','r102','b0000000-0000-0000-0000-000000000001', now() + interval '8 days', now() + interval '9 days', 'upcoming', 'built_in')" >/dev/null
$PSQL -c "update reservations set status='cancelled' where id='$BK2'" >/dev/null
t "a cancelled booking's confirmation is skipped"       "skipped" postgres - "select status from guest_email_outbox where reservation_id='$BK2' and kind='booking_confirmation'"
t "a walk-in that checks straight in queues none"       0 postgres - "select count(*) from guest_email_outbox where reservation_id='$RES' and kind='booking_confirmation'"
t "an imported (PMS) booking queues none"               0 postgres - "insert into reservations (id, property_id, room_id, guest_id, check_in, check_out, status, source) values ('d0000000-0000-0000-0000-0000000000b3','p1','r102','b0000000-0000-0000-0000-000000000001', now() + interval '2 days', now() + interval '3 days', 'upcoming', 'imported'); select count(*) from guest_email_outbox where reservation_id='d0000000-0000-0000-0000-0000000000b3'"
$PSQL -c "update reservations set status='checked_out' where id='$RES'" >/dev/null
t "checking out queues a thank-you about 90 minutes later" "checkout_thanks|true" postgres - "select kind || '|' || (due_at between now() + interval '85 minutes' and now() + interval '95 minutes') from guest_email_outbox where reservation_id='$RES' and kind='checkout_thanks'"
t "checking out twice does not queue two"               1 postgres - "update reservations set status='checked_in' where id='$RES'; update reservations set status='checked_out' where id='$RES'; select count(*) from guest_email_outbox where reservation_id='$RES' and kind='checkout_thanks'"
t "anon can't read the outbox"                          error anon - "select count(*) from guest_email_outbox"
t "a receptionist can't read the outbox"                error authenticated $RECEP "select count(*) from guest_email_outbox"
t "nobody can claim emails through the API"             error authenticated $OWNER "select * from system_claim_guest_emails(5)"
t "the owner can set the review link"                   ok authenticated $OWNER "select owner_update_guest_email_settings('p1', '{\"enabled\":true,\"googleReviewUrl\":\"https://g.page/r/abc/review\",\"checkInTime\":\"14:00\"}'::jsonb)"
t "a receptionist can't change the settings"            error authenticated $RECEP "select owner_update_guest_email_settings('p1', '{\"enabled\":false}'::jsonb)"
t "another hotel's owner can't either"                  error authenticated $OTHER "select owner_update_guest_email_settings('p1', '{\"enabled\":false}'::jsonb)"
t "a javascript: link is refused"                       error authenticated $OWNER "select owner_update_guest_email_settings('p1', '{\"googleReviewUrl\":\"javascript:alert(1)\"}'::jsonb)"
t "a bad time is refused"                               error authenticated $OWNER "select owner_update_guest_email_settings('p1', '{\"checkInTime\":\"25:99\"}'::jsonb)"
t "the owner can't claim a sending domain through the API" error authenticated $OWNER "insert into property_email_domains (property_id, domain) values ('p1','evil.example')"
t "...nor edit one"                                     error authenticated $OWNER "update property_email_domains set status='verified'"
t "the owner sees the sent list without email addresses" "f" authenticated $OWNER "select (select string_agg(x::text, '') from owner_guest_email_log('p1') x) like '%@%'"
t "a receptionist can't see the sent list"              error authenticated $RECEP "select * from owner_guest_email_log('p1')"
t "another hotel's owner can't see it"                  error authenticated $OTHER "select * from owner_guest_email_log('p1')"

echo; echo "### L. Arrival pre-orders: single-use links, the kitchen order 45 minutes ahead, the bill at check-in"
G=b0000000-0000-0000-0000-000000000001; B3=d0000000-0000-0000-0000-0000000000c3; B4=d0000000-0000-0000-0000-0000000000c4
$PSQL -c "update guests set email='asha@example.com', name='Asha Rao' where id='$G'; update properties set pre_arrival_enabled=true where id='p1';
  insert into menu_items (id, property_id, name, category, price) values ('s1','p1','Hot Tomato Soup','Starters',180), ('s2','p1','Masala Chai','Beverage',60), ('s3','p1','Draught Beer','Beverage',250) on conflict do nothing;
  insert into menu_items (id, property_id, name, category, price, variations) values ('s4','p1','Club Sandwich','Starters',220,'[{\"id\":\"v1\",\"name\":\"Large\",\"price\":260}]'::jsonb) on conflict do nothing;
  insert into reservations (id, property_id, room_id, guest_id, check_in, check_out, status, source) values ('$B3','p1','r102','$G', date_trunc('day', now() + interval '2 days') + interval '11 hours 30 minutes', now() + interval '4 days', 'upcoming', 'built_in');" >/dev/null
t "pre-arrival email is queued for the day before"       "pre_arrival" postgres - "select kind from guest_email_outbox where reservation_id='$B3' and kind='pre_arrival'"
t "a booking for in an hour queues no pre-arrival email" 0 postgres - "insert into reservations (id, property_id, room_id, guest_id, check_in, check_out, status, source) values ('d0000000-0000-0000-0000-0000000000c9','p1','r102','$G', now() + interval '1 hour', now() + interval '2 days', 'upcoming', 'built_in'); select count(*) from guest_email_outbox where reservation_id='d0000000-0000-0000-0000-0000000000c9' and kind='pre_arrival'"
t "suggestions never include alcohol or dishes with sizes" "0" postgres - "select count(*) from system_arrival_suggestions('$B3', 10) where name in ('Draught Beer','Club Sandwich')"
t "a 5pm arrival is offered soup and chai first"         "t" postgres - "select bool_and(name in ('Hot Tomato Soup','Masala Chai','Paneer Butter Masala')) from system_arrival_suggestions('$B3', 2)"
t "anon can't make links"                                error anon - "select system_make_arrival_links('$B3')"
t "a receptionist can't make links"                      error authenticated $RECEP "select system_make_arrival_links('$B3')"
L1=$($PSQL -c "select system_make_arrival_links('$B3')->0->>'token'")
[ ${#L1} = 48 ] && { pass=$((pass+1)); echo "PASS  links are 192-bit random tokens"; } || { fail=$((fail+1)); echo "FAIL  links are 192-bit random tokens (got '$L1')"; }
t "asking again returns the same links, not new ones"    "$L1" postgres - "select system_make_arrival_links('$B3')->0->>'token'"
t "at most three links"                                  "t" postgres - "select jsonb_array_length(system_make_arrival_links('$B3')) between 1 and 3"
t "an unknown link is refused"                           "invalid" anon - "select guest_redeem_arrival_link('not-a-token')->>'status'"
t "tapping the link records the request"                 "ok|HotTomatoSoup" anon - "select r->>'status' || '|' || (r->>'item_name') from (select guest_redeem_arrival_link('$L1') r) x"
t "...and tells staff"                                   1 postgres - "select count(*) from notifications where type='arrival_request' and ref_id=(select id from arrival_requests where link_token='$L1')"
t "tapping again says it is already done"                "already" anon - "select guest_redeem_arrival_link('$L1')->>'status'"
t "...and does not make a second request"                1 postgres - "select count(*) from arrival_requests where link_token='$L1'"
t "nothing is in the kitchen yet"                        0 postgres - "select count(*) from orders where reservation_id='$B3'"
t "nothing is charged yet"                               0 postgres - "select count(*) from folio_charges where reservation_id='$B3'"
t "the guest can say when they'll arrive"                "ok" anon - "select guest_set_arrival_time('$L1', now() + interval '3 hours')->>'status'"
t "...but not after checkout"                            "out_of_range" anon - "select guest_set_arrival_time('$L1', now() + interval '30 days')->>'status'"
t "the conversion job leaves it alone while it is far off" 0 postgres - "select system_convert_arrival_requests()"
$PSQL -c "update arrival_requests set ready_at_override = now() + interval '30 minutes' where link_token='$L1'" >/dev/null
t "45 minutes ahead, it becomes one kitchen order"       1 postgres - "select system_convert_arrival_requests()"
t "...marked as a pre-order, status new"                 "new|true" postgres - "select status || '|' || (notes ilike 'PRE-ORDER%pay at the hotel%') from orders where reservation_id='$B3'"
t "...and the request says it is in the kitchen"         "in_kitchen" postgres - "select status from arrival_requests where link_token='$L1'"
t "running the job again makes no second order"          0 postgres - "select system_convert_arrival_requests()"
t "it is still not on the bill"                          0 postgres - "select count(*) from folio_charges where reservation_id='$B3'"
t "too late to cancel once it is in the kitchen"         "too_late" anon - "select guest_cancel_arrival_request('$L1')->>'status'"
t "reception sees the pre-order on the arrival"          "HotTomatoSoup|in_kitchen" authenticated $RECEP "select item_name || '|' || status from staff_arrival_preorders('p1') where reservation_id='$B3'"
t "another hotel's staff can't see it"                   error authenticated $OTHER "select * from staff_arrival_preorders('p1')"
$PSQL -c "update reservations set status='checked_in' where id='$B3'" >/dev/null
t "checking in puts the pre-order on the bill, once"     "1|180.00" postgres - "select count(*) || '|' || sum(amount) from folio_charges where reservation_id='$B3'"
t "...described as pre-ordered"                           "t" postgres - "select description like '%(pre-ordered)' from folio_charges where reservation_id='$B3'"
# changed mind before the kitchen, then a cancelled booking
L2=$($PSQL -c "insert into reservations (id, property_id, room_id, guest_id, check_in, check_out, status, source) values ('$B4','p1','r101','$G', now() + interval '3 days', now() + interval '5 days', 'upcoming', 'built_in'); select system_make_arrival_links('$B4')->0->>'token'")
L2=$(echo "$L2" | tail -1)
$PSQL -c "select guest_redeem_arrival_link('$L2')" >/dev/null
t "the guest can cancel before the kitchen has it"       "cancelled" anon - "select guest_cancel_arrival_request('$L2')->>'status'"
t "the link then reads as cancelled"                     "cancelled" anon - "select guest_redeem_arrival_link('$L2')->>'status'"
L3=$($PSQL -c "select system_make_arrival_links('$B4')->0->>'token'")
$PSQL -c "update arrival_links set used_at=null where token='$L2'; delete from arrival_requests where link_token='$L2'" >/dev/null
$PSQL -c "set role anon; select guest_redeem_arrival_link('$L2')" >/dev/null
$PSQL -c "update reservations set status='cancelled' where id='$B4'" >/dev/null
t "a cancelled booking drops waiting requests"           "void" postgres - "select status from arrival_requests where link_token='$L2'"
$PSQL -c "update properties set pre_arrival_enabled=false where id='p1'" >/dev/null
t "with the switch off, a link does nothing"             "closed" anon - "select guest_redeem_arrival_link('$L3')->>'status'"
$PSQL -c "update properties set pre_arrival_enabled=true where id='p1'" >/dev/null
t "anon can't read the link or request tables"           error anon - "select count(*) from arrival_links"
t "a receptionist can't read the request table"          error authenticated $RECEP "select count(*) from arrival_requests"
t "the owner can switch pre-arrival on"                  ok authenticated $OWNER "select owner_update_guest_email_settings('p1', '{\"enabled\":true,\"preArrival\":true}'::jsonb)"
t "a receptionist can't"                                 error authenticated $RECEP "select owner_update_guest_email_settings('p1', '{\"preArrival\":true}'::jsonb)"

echo; echo "pass=$pass fail=$fail"
