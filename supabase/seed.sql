-- Demo data — same two properties/rooms as the earlier SQLite prototype, so
-- nothing about the guest/owner/reception demo flow changes, only where the
-- data lives. Run this after 0001_init.sql (Supabase CLI runs it
-- automatically on `supabase db reset`; in the SQL Editor, just run it once
-- by hand after the migration).

insert into properties (id, name, location, status) values
  ('grand-horizon', 'Grand Horizon', 'New York City, NY', 'active'),
  ('the-azure', 'The Azure', 'Miami, FL', 'active');

insert into rooms (id, property_id, number, type, floor, status, price_per_night) values
  ('grand-horizon-101', 'grand-horizon', '101', 'King Suite', 1, 'occupied', 280),
  ('grand-horizon-102', 'grand-horizon', '102', 'Double Queen', 1, 'ready', 195),
  ('grand-horizon-105', 'grand-horizon', '105', 'Penthouse', 1, 'occupied_vip', 850),
  ('grand-horizon-201', 'grand-horizon', '201', 'Deluxe King', 2, 'occupied', 310),
  ('the-azure-101', 'the-azure', '101', 'King Suite', 1, 'occupied', 280),
  ('the-azure-102', 'the-azure', '102', 'Double Queen', 1, 'ready', 195),
  ('the-azure-105', 'the-azure', '105', 'Penthouse', 1, 'occupied_vip', 850),
  ('the-azure-201', 'the-azure', '201', 'Deluxe King', 2, 'occupied', 310);

-- Same catalog seeded into both properties for the demo. A real onboarding
-- flow would let each hotel define its own menu instead.
insert into menu_items (id, property_id, name, category, price, description, image, is_veg, tags, prep_time)
select m.id, p.id, m.name, m.category, m.price, m.description, m.image, m.is_veg, m.tags, m.prep_time
from (values
  ('biryani-01', 'Awadhi Chicken Biryani', 'Indian', 24.00, 'Fragrant basmati rice slow-cooked with tender chicken, saffron, and traditional Indian spices. Served with cooling raita.', 'https://lh3.googleusercontent.com/aida-public/AB6AXuDh0Y__DEnvSDPUOaYnFtNSntnc_7fvMMJVBDp7K5-k7fT0E1mKMEqJy1t_4fGNC8dnP7VsKHCwvdXTPiUX7Vovj04wJQ3fuaFXCiiq78j-OV5CTwRqBIKdykqMV9WxEjsVdUneOEKKQ7AWNo5Hmtt5I4oYl51IEYTl-vUv9zgYSP_uWpz1acrSSoxGzvzItZ8Bq7QR5ftuL67bz78ZCCcFi_9iCAkX5HwFyahqIv92cZDD6yXC30xH', false, array['Spicy','Popular'], null),
  ('paneer-02', 'Paneer Butter Masala', 'Indian', 18.50, 'Cottage cheese cubes simmered in a rich, creamy tomato and cashew nut gravy. Served with choice of Indian breads.', 'https://lh3.googleusercontent.com/aida-public/AB6AXuBHsK_YVSGD8c31Ong059TVOSOJc7M27ALEMWZRC3j2x3Dj9Hf0i8XqN9Ztlyw0trhegE9c5peLjs98V-BPqlsb99lA2AR2FpkC9YQiYGIyQx_QzkAmVJKhiisGSyhFMalU2ADPXuFv6Nly9CKpqOmSSx_Leyxf_G33cT7wZkVhzP1ngOHFU4HbG5VbY9Vdk5EYjH12egNddtAbt_lV4OkfZaaLH-uT4Z6MY1JEqYBMX0rZ3716SUV7', true, array['Nuts','Dairy'], null),
  ('dal-03', 'Signature Dal Makhani', 'Indian', 16.00, 'Overnight simmered black lentils finished with fresh cream and cultured butter. A comforting classic.', 'https://lh3.googleusercontent.com/aida-public/AB6AXuAYPjWY-xi1HaSUIWYD_OHsXU51SOHzxMp5c__wgr7lFYPlr_vz8hAnwUmHNJuI6Y4fiPqTLpiIe2_W6XyyB7MSwjl-nFZwcMuAJxfwNTb7RAzLPB44HWKPPk32CQrAV7rhAKdzWORomzmrGc91Ixf_eOvAI3xBmtGa6Jwt8zax33gBZNbEMAfq1_k5ikdS3FFBRePKlHlHxxiJQFqN3HbUNAPGQPBQ2dKZy_71R_GlNImwKb1YqajB', true, array['Dairy'], null),
  ('naan-04', 'Tandoori Garlic Naan (2 pcs)', 'Indian', 6.50, 'Crisp artisan flatbread baked in clay oven brushed with roasted garlic butter and cilantro.', 'https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=600&q=80', true, array['Dairy','Tandoor'], null),
  ('breakfast-01', 'Continental Breakfast Board', 'Breakfast', 22.00, 'Flaky warm croissants, sourdough toast, cultured butter, organic berry preserves, sliced seasonal fruit, and artisan cappuccino.', 'https://lh3.googleusercontent.com/aida-public/AB6AXuDFn_TeCi5piq666qSWt3Hro67LM4aqJ3KOdCqcFwqj8IEsLL71l8pBEB0NAnUCJ1VetsgipFB4eIYXBUv4plasCoux9XaBg5ik93465PeiTVB4IeF8AUK983CQ9arBB9nZCHCDSEduj6yBSIPDvkHUtJ-LkkW2QTv-SelsUmKzC9aaeVY4FIUsVs6IlKfACSjlKXtcYIQm_-VC6aE-6sTLm5kW2FWww-KStayTJXgRSxrXYooZOu1e', true, array['Chef Special','Fresh'], null),
  ('salmon-01', 'Pan-Seared Atlantic Salmon', 'Continental', 28.00, 'Wild-caught Atlantic salmon with lemon dill emulsion, roasted asparagus, and truffle-infused mashed potatoes.', 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80', false, array['Gluten-Free','Healthy'], null),
  ('caesar-01', 'Crispy Romaine Caesar Salad', 'Continental', 14.00, 'Shaved aged Parmigiano-Reggiano, garlic brioche croutons, creamy white anchovy dressing.', 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&w=600&q=80', true, array['Crispy','Classic'], null),
  ('lassi-01', 'Alphonso Mango Lassi', 'Beverages', 7.00, 'Handcrafted with ripe Ratnagiri Alphonso mango pulp, creamy yogurt, and a sprinkle of crushed green cardamom.', 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80', true, array['Chilled','Signature'], null),
  ('dessert-01', 'Valrhona Chocolate Fondant', 'Desserts', 12.50, 'Warm molten dark chocolate cake served with Madagascar vanilla bean gelato and gold leaf garnish.', 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80', true, array['Decadent','Hot'], null)
) as m(id, name, category, price, description, image, is_veg, tags, prep_time)
cross join (values ('grand-horizon'), ('the-azure')) as p(id);

insert into guests (id, name, vip) values
  ('11111111-1111-1111-1111-111111111111', 'J. Smith', false),
  ('22222222-2222-2222-2222-222222222222', 'A. Kensington', true);

insert into reservations (id, property_id, room_id, guest_id, check_in, check_out, party_size, status, source) values
  ('33333333-3333-3333-3333-333333333333', 'grand-horizon', 'grand-horizon-101', '11111111-1111-1111-1111-111111111111',
   now() - interval '1 day', now() + interval '2 days', 2, 'checked_in', 'built_in'),
  ('44444444-4444-4444-4444-444444444444', 'the-azure', 'the-azure-105', '22222222-2222-2222-2222-222222222222',
   now() - interval '1 day', now() + interval '2 days', 1, 'checked_in', 'built_in');

-- One delivered order earlier in the Grand Horizon stay, so the reorder rule
-- in guest_get_recommendations() has something real to boost immediately.
insert into orders (property_id, reservation_id, room_id, items, total_amount, status, created_at)
values (
  'grand-horizon', '33333333-3333-3333-3333-333333333333', 'grand-horizon-101',
  '[{"menuItemId":"lassi-01","name":"Alphonso Mango Lassi","price":7,"quantity":2}]'::jsonb,
  14.00, 'delivered', now() - interval '20 hours'
);

-- Print the guest links for this seed data — open these to demo the guest
-- flow without needing to query guest_token by hand.
select p.name as property, r.number as room, res.guest_token,
       '/guest/' || res.guest_token as guest_link
from reservations res
join properties p on p.id = res.property_id
join rooms r on r.id = res.room_id;

-- After you sign up your own owner/receptionist accounts via Supabase Auth,
-- link them to a property (find their id in Authentication > Users):
--
--   insert into staff_properties (user_id, property_id, role)
--   values ('<auth-user-uuid>', 'grand-horizon', 'owner');
--
--   insert into staff_properties (user_id, property_id, role)
--   values ('<auth-user-uuid>', 'grand-horizon', 'receptionist');
