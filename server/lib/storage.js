import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, "../uploads");

// Ensure base uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Save a buffer to local disk in server/uploads/<subFolder>/
 * @param {string} subFolder e.g. "properties/123" or "verification-docs/123" or "tours/123"
 * @param {string} originalName original filename
 * @param {Buffer} buffer file buffer
 * @returns {Promise<{ url: string, storagePath: string }>}
 */
export async function saveLocalBuffer(subFolder, originalName, buffer) {
  const ext = path.extname(originalName).toLowerCase() || ".jpg";
  const filename = `${uuidv4()}${ext}`;
  const dirPath = path.join(UPLOADS_DIR, subFolder);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const filePath = path.join(dirPath, filename);
  await fs.promises.writeFile(filePath, buffer);

  const relativePath = path.join(subFolder, filename).replace(/\\/g, "/");
  const publicUrl = `/uploads/${relativePath}`;

  return { url: publicUrl, storagePath: relativePath };
}

/**
 * Save a file from multer or buffer to a specific subfolder
 */
export async function uploadToLocal(subFolder, file, prefix = "") {
  const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
  const filename = prefix ? `${prefix}-${uuidv4()}${ext}` : `${uuidv4()}${ext}`;
  const dirPath = path.join(UPLOADS_DIR, subFolder);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const filePath = path.join(dirPath, filename);
  await fs.promises.writeFile(filePath, file.buffer);

  const relativePath = path.join(subFolder, filename).replace(/\\/g, "/");
  const publicUrl = `/uploads/${relativePath}`;

  return { url: publicUrl, storagePath: relativePath };
}

/**
 * Delete a file from disk
 * @param {string} storagePath relative path under uploads (e.g. "properties/123/abc.jpg")
 */
export async function removeLocalFile(storagePath) {
  if (!storagePath) return;
  try {
    // Prevent directory traversal
    const safePath = path.resolve(UPLOADS_DIR, storagePath.replace(/^\/+/, ""));
    if (safePath.startsWith(UPLOADS_DIR) && fs.existsSync(safePath)) {
      await fs.promises.unlink(safePath);
    }
  } catch (err) {
    console.warn("[storage] removeLocalFile warning:", err.message);
  }
}
