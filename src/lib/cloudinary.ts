/**
 * Direct browser → Cloudinary upload, unsigned.
 * Uses environment variables VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET
 * with a built-in default fallback so image uploading works seamlessly out of the box
 * across all hotel property, room, menu dish, experience, and guest ID photos.
 */

const DEFAULT_CLOUD_NAME = 'dkgv4k0px';
const DEFAULT_UPLOAD_PRESET = 'cabadra_preset';

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || DEFAULT_CLOUD_NAME;
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || DEFAULT_UPLOAD_PRESET;

export const isCloudinaryConfigured = Boolean(cloudName && uploadPreset);

export async function uploadImageToCloudinary(file: File): Promise<string> {
  const activeCloud = cloudName || DEFAULT_CLOUD_NAME;
  const activePreset = uploadPreset || DEFAULT_UPLOAD_PRESET;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', activePreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${activeCloud}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Upload failed: ${res.status}`);
  }

  const data = await res.json();
  return data.secure_url as string;
}
