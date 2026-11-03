export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validate and re-encode a user photo: limits type and size, downsizes to at
 * most `maxSide` px and re-encodes as JPEG through a canvas, which discards
 * EXIF metadata (including GPS position and device info).
 */
export async function preparePhoto(file: File, maxSide = 1024): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error('Dopušteni su samo JPEG, PNG i WebP.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Fotografija je veća od 10 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Preglednik ne podržava obradu slike.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.75);
}
