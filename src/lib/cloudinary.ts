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

/** Photos only, and not huge. SVG is excluded on purpose: it can carry script. (Cloudinary's own upload preset should enforce the same; this is the first line, and the friendly error.) */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

/** A message for the person if this file shouldn't be uploaded, otherwise null. */
export function checkImageFile(file: File): string | null {
  const typeOk = file.type ? ALLOWED_TYPES.includes(file.type.toLowerCase()) : ALLOWED_EXTENSIONS.test(file.name);
  if (!typeOk || !ALLOWED_EXTENSIONS.test(file.name || 'photo.jpg')) return 'Please choose a photo (JPG, PNG, WebP, GIF or HEIC).';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return `That photo is ${(file.size / 1048576).toFixed(1)} MB. The most we can take is ${MAX_UPLOAD_BYTES / 1048576} MB.`;
  return null;
}

export async function uploadImageToCloudinary(file: File): Promise<string> {
  const problem = checkImageFile(file);
  if (problem) throw new Error(problem);
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
