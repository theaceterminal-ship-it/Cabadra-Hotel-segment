/**
 * Direct browser → Cloudinary upload, unsigned. There's no backend server
 * in this app to hold a Cloudinary API secret, so this relies on an
 * "unsigned upload preset" instead — a preset configured in the Cloudinary
 * dashboard (Settings > Upload > Add upload preset, Signing Mode: Unsigned)
 * that constrains what an upload using it is allowed to do. Both the cloud
 * name and preset name are meant to be public/client-side; the preset is
 * the actual security boundary, not secrecy of these values.
 */

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const isCloudinaryConfigured = Boolean(cloudName && uploadPreset);

export async function uploadImageToCloudinary(file: File): Promise<string> {
  if (!isCloudinaryConfigured) {
    throw new Error(
      'Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in .env.local.'
    );
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
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
