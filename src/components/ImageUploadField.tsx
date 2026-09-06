import React, { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { uploadImageToCloudinary, isCloudinaryConfigured } from '../lib/cloudinary';

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
}

/**
 * A URL text field always works (paste any image URL — that's the
 * fallback that shipped before Cloudinary was wired in); the Upload button
 * only appears once VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET
 * are set, and just fills the same field with the URL Cloudinary hands
 * back — nothing downstream needs to know or care which path was used.
 */
export function ImageUploadField({ label, value, onChange }: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const url = await uploadImageToCloudinary(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="text-[10px] font-bold text-[#4e463a] block mb-1">{label}</label>
      <div className="flex gap-1.5 items-center">
        {value && (
          <div className="relative shrink-0">
            <img src={value} alt="" className="w-9 h-9 rounded object-cover border border-[#E9ECEF]" />
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute -top-1.5 -right-1.5 bg-white rounded-full border border-[#E9ECEF] text-[#BC4749] shadow-2xs"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://..."
          className="flex-1 h-9 px-2 text-xs border border-[#E9ECEF] rounded focus:border-[#765a25] focus:outline-none min-w-0"
        />
        {isCloudinaryConfigured && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelected} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-9 px-2.5 rounded border border-[#E9ECEF] text-[#765a25] hover:bg-[#ecf5fe] disabled:opacity-50 shrink-0"
              title="Upload a photo"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
      {uploading && <p className="text-[10px] text-[#7f7668] mt-1">Uploading…</p>}
      {error && <p className="text-[10px] text-red-600 mt-1">{error}</p>}
    </div>
  );
}
