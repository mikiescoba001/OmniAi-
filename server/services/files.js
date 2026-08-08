import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';

let pdfParse = null;
let mammoth = null;

async function loadParsers() {
  if (!pdfParse) {
    const mod = await import('pdf-parse-debugging-disabled');
    pdfParse = mod.default;
  }
  if (!mammoth) {
    const mod = await import('mammoth');
    mammoth = mod.default;
  }
}

const UPLOAD_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Process an uploaded file: extract text, sanitize, and store securely
 * @param {Object} file - Multer file object
 * @returns {Object} Processed file data
 * @throws {Error} If file processing fails
 */
export async function processFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  // Validate file exists
  if (!fs.existsSync(file.path)) {
    throw new Error('Uploaded file not found on disk');
  }

  // Check file is not empty
  const stats = fs.statSync(file.path);
  if (stats.size === 0) {
    fs.unlinkSync(file.path);
    throw new Error('Uploaded file is empty');
  }

  await loadParsers();
  let text = '';

  try {
    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdfParse(dataBuffer);
      text = data.text || '';
      if (!text.trim()) {
        text = '[PDF document appears to contain no extractable text. It may be a scanned document.]';
      }
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: file.path });
      text = result.value || '';
      if (!text.trim()) {
        text = '[DOCX document appears to contain no text content.]';
      }
    } else if (ext === '.txt') {
      text = fs.readFileSync(file.path, 'utf-8');
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    // Store file permanently with UUID name
    const fileName = `${uuid()}${ext}`;
    const permPath = path.join(UPLOAD_DIR, fileName);
    fs.renameSync(file.path, permPath);

    return {
      text: text.substring(0, 50000), // Cap at 50K chars
      filePath: permPath,
      fileName: fileName,
      originalName: file.originalname,
      size: stats.size,
    };
  } catch (err) {
    // Clean up temp file on error
    try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
    throw err;
  }
}

/**
 * Get a readable stream for a stored file
 * @param {string} fileName - UUID-based file name
 * @returns {ReadStream|null} File read stream or null if not found
 */
export function getFileStream(fileName) {
  const sanitized = path.basename(fileName); // Prevent path traversal
  const filePath = path.join(UPLOAD_DIR, sanitized);

  if (!fs.existsSync(filePath)) return null;
  return fs.createReadStream(filePath);
}

/**
 * Delete a stored file
 * @param {string} fileName - UUID-based file name
 */
export function deleteFile(fileName) {
  const sanitized = path.basename(fileName);
  const filePath = path.join(UPLOAD_DIR, sanitized);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Silently ignore deletion errors
  }
}