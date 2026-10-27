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

echo; echo "pass=$pass fail=$fail"
