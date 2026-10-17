import zlib
import struct
import math

def make_pwa_icon(width, height, bg_color, fg_color):
    """
    Creates a solid, fully opaque PNG icon suitable for PWA WebAPK generation.
    bg_color: (r, g, b)
    fg_color: (r, g, b)
    """
    png = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk: RGB (color type 2, bit depth 8)
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    png += struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)

    bg_r, bg_g, bg_b = bg_color
    fg_r, fg_g, fg_b = fg_color

    center_x = width / 2.0
    center_y = height / 2.0
    outer_r = width * 0.32
    inner_r = width * 0.18

    raw_rows = []
    for y in range(height):
        row = bytearray([0])  # filter byte = None
        for x in range(width):
            dx = x - center_x
            dy = y - center_y
            dist = math.sqrt(dx * dx + dy * dy)
            angle = math.atan2(dy, dx) # -pi to +pi

            # Draw a stylish "C" arc symbol in the center
            is_c_shape = (inner_r <= dist <= outer_r) and not (-math.pi / 4 <= angle <= math.pi / 4)

            if is_c_shape:
                row.extend([fg_r, fg_g, fg_b])
            else:
                row.extend([bg_r, bg_g, bg_b])
        raw_rows.append(bytes(row))

    raw_data = b''.join(raw_rows)
    compressed = zlib.compress(raw_data, 9)
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)

    # IEND chunk
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)

    return png

# 1. Guest App Icons (Solid Indigo/Purple #4f46e5 background, White 'C' logo)
guest_bg = (79, 70, 229)
guest_fg = (255, 255, 255)

with open('public/logo192.png', 'wb') as f:
    f.write(make_pwa_icon(192, 192, guest_bg, guest_fg))
    print('Generated public/logo192.png')

with open('public/logo512.png', 'wb') as f:
    f.write(make_pwa_icon(512, 512, guest_bg, guest_fg))
    print('Generated public/logo512.png')

# 2. Staff App Icons (Solid Emerald #059669 background, White 'C' logo)
staff_bg = (5, 150, 105)
staff_fg = (255, 255, 255)

with open('public/logo192-staff.png', 'wb') as f:
    f.write(make_pwa_icon(192, 192, staff_bg, staff_fg))
    print('Generated public/logo192-staff.png')

with open('public/logo512-staff.png', 'wb') as f:
    f.write(make_pwa_icon(512, 512, staff_bg, staff_fg))
    print('Generated public/logo512-staff.png')

# 3. Favicon (32x32 ICO containing PNG)
png_32 = make_pwa_icon(32, 32, guest_bg, guest_fg)
ico_header = struct.pack('<HHH', 0, 1, 1) # Reserved, Type 1 (ICO), Count 1
ico_dir = struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, len(png_32), 22)
with open('public/favicon.ico', 'wb') as f:
    f.write(ico_header + ico_dir + png_32)
    print('Generated public/favicon.ico')
