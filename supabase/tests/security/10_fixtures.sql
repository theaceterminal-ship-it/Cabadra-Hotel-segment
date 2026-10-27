-- Fixtures for attack.sh: two hotels, an owner, a receptionist, a receptionist from the OTHER hotel, one guest in room 101.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'owner@hill.test'),
  ('a0000000-0000-0000-0000-000000000002', 'reception@hill.test'),
  ('a0000000-0000-0000-0000-000000000003', 'reception@lake.test')
on conflict do nothing;
insert into properties (id, name, location) values ('p1', 'Hill View', 'Kasauli'), ('p2', 'Lake Inn', 'Shimla') on conflict do nothing;
insert into staff_properties (user_id, property_id, role) values
  ('a0000000-0000-0000-0000-000000000001', 'p1', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', 'p1', 'receptionist'),
  ('a0000000-0000-0000-0000-000000000003', 'p2', 'receptionist')
on conflict do nothing;
insert into rooms (id, property_id, number, type, floor, price_per_night) values
  ('r101', 'p1', '101', 'Deluxe', 1, 3000), ('r102', 'p1', '102', 'Deluxe', 1, 3000), ('r901', 'p2', '901', 'Suite', 9, 9000)
on conflict do nothing;
insert into guests (id, name, phone) values ('b0000000-0000-0000-0000-000000000001', 'Asha Rao', '+919800000001') on conflict do nothing;
insert into reservations (id, property_id, room_id, guest_id, check_in, check_out, status, guest_token) values
  ('c0000000-0000-0000-0000-000000000001', 'p1', 'r101', 'b0000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '2 days', 'checked_in', '11111111-1111-1111-1111-111111111111')
on conflict do nothing;
update rooms set status = 'occupied' where id = 'r101';
insert into menu_items (id, property_id, name, category, price) values ('m1', 'p1', 'Paneer Butter Masala', 'Mains', 320) on conflict do nothing;

-- One real order from the guest's link, the way the app places it (as the anonymous role),
-- so the bill-line and order tests have something to attack.
set role anon;
select guest_place_order('11111111-1111-1111-1111-111111111111', '[{"menuItemId":"m1","quantity":2}]'::jsonb, 'no onions');
reset role;
