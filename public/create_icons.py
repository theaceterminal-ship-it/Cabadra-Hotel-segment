import zlib
import struct

def make_png(width, height):
    """Create a minimal transparent PNG of given dimensions."""
    # PNG signature
    png = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 0, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    png += struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    
    # IDAT chunk - filter byte + transparent RGBA pixels
    pixel_data = b''
    for y in range(height):
        pixel_data += b'\x00'  # filter byte (none)
        for x in range(width):
            pixel_data += b'\x00\x00\x00\x00'  # transparent RGBA
    
    compressed = zlib.compress(pixel_data)
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    
    # IEND chunk
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    
    return png

# Create 192x192 transparent PNG
with open('logo192.png', 'wb') as f:
    f.write(make_png(192, 192))
    print('Created logo192.png')

# Create 512x512 transparent PNG
with open('logo512.png', 'wb') as f:
    f.write(make_png(512, 512))
    print('Created logo512.png')