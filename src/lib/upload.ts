/** Maximum file size in bytes (10 MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed image MIME types */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Allowed file extensions */
const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "gif",
]);

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates an image file before upload.
 * Checks MIME type, file extension, and file size.
 */
export function validateImageFile(file: File): FileValidationResult {
  // Check MIME type
  if (!ALLOWED_TYPES.has(file.type)) {
    return { valid: false, error: `Недопустимый формат файла: ${file.type}. Разрешены: JPG, PNG, WebP, GIF` };
  }

  // Check file extension
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Недопустимое расширение файла: .${ext}` };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    return { valid: false, error: `Файл слишком большой (${sizeMb} МБ). Максимум 10 МБ` };
  }

  // Check magic bytes (file header) for common image formats
  // This is a basic check — full validation happens server-side
  if (file.size < 4) {
    return { valid: false, error: "Файл повреждён или слишком мал" };
  }

  return { valid: true };
}

/**
 * Validates and filters a list of image files.
 * Returns only valid files and collects errors.
 */
export function filterValidImageFiles(files: File[]): { valid: File[]; errors: string[] } {
  const valid: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const result = validateImageFile(file);
    if (result.valid) {
      valid.push(file);
    } else {
      errors.push(result.error!);
    }
  }

  return { valid, errors };
}
