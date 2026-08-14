import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { aiRateLimit } from '../middleware/rateLimit.js';
import { success, error, ErrorCodes, asyncHandler } from '../middleware/response.js';
import { processFile } from '../services/files.js';
import { generateCompletion } from '../services/ai.js';
import { requireService } from '../middleware/validate.js';
import { saveDocument, getDocuments, getProfile, incrementUsage } from '../models/database.js';
import config from '../config.js';

const router = Router();

// ── Multer configuration ──
const storage = multer.diskStorage({
  destination: '/tmp/omniai-uploads',
  filename: (req, file, cb) => {
    // Sanitize filename: remove path separators, keep only safe chars
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (config.upload.allowedExtensions.includes(ext) &&
      config.upload.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Supported: ${config.upload.allowedExtensions.join(', ')}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxSize },
});

// ── Upload ──
router.post('/upload', authenticate, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return error(res, ErrorCodes.FILE_TOO_LARGE, 'File size exceeds 10MB limit', 413);
      }
      return error(res, ErrorCodes.FILE_UPLOAD_FAILED, err.message, 400);
    }
    if (err) {
      return error(res, ErrorCodes.FILE_TYPE_INVALID, err.message, 400);
    }
    next();
  });
}, asyncHandler(async (req, res) => {
  if (!req.file) {
    return error(res, ErrorCodes.FILE_UPLOAD_FAILED, 'No file uploaded', 400);
  }

  // Check daily upload limit
  const profile = await getProfile(req.userId);
  const isPremium = profile?.plan === 'premium_monthly' || profile?.plan === 'premium_annual';
  if (!isPremium) {
    const docs = await getDocuments(req.userId);
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = docs.filter(d =>
      d.created_at?.startsWith(today)
    ).length;
    if (todayCount >= config.usage.free.documentUploadsPerDay) {
      return error(res, ErrorCodes.AI_USAGE_LIMIT,
        `Daily upload limit reached (${config.usage.free.documentUploadsPerDay}/day). Upgrade to Premium.`, 429);
    }
  }

  let result;
  try {
    result = await processFile(req.file);
  } catch (procErr) {
    return error(res, ErrorCodes.FILE_PROCESSING_FAILED,
      'Failed to process file. Ensure it is a valid PDF, DOCX, or TXT file.', 422);
  }

  const { data: doc } = await saveDocument({
    user_id: req.userId,
    name: result.originalName,
    file_path: result.fileName,
    content: result.text,
    size: result.size,
    mime_type: req.file.mimetype,
  });

  await incrementUsage(req.userId, 'upload');

  return success(res, {
    id: doc.id,
    name: result.originalName,
    size: result.size,
    textPreview: result.text.substring(0, 500),
  }, 201);
}));

// ── List documents ──
router.get('/documents', authenticate, asyncHandler(async (req, res) => {
  const docs = await getDocuments(req.userId);
  // Never expose file paths or content in list endpoint
  return success(res, {
    documents: docs.map(d => ({
      id: d.id,
      name: d.name,
      size: d.size,
      mime_type: d.mime_type,
      created_at: d.created_at,
    })),
  });
}));

// ── Ask about document ──
router.post('/ask-document', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { documentId, question } = z.object({
    documentId: z.string().uuid(),
    question: z.string().min(1).max(2000),
  }).parse(req.body);

  // Verify document belongs to user
  const docs = await getDocuments(req.userId);
  const doc = docs.find(d => d.id === documentId);
  if (!doc) {
    return error(res, ErrorCodes.NOT_FOUND, 'Document not found', 404);
  }

  if (!doc.content) {
    return error(res, ErrorCodes.FILE_PROCESSING_FAILED, 'Document content is empty or could not be extracted', 422);
  }

  const prompt = `Document content:\n\n${doc.content.substring(0, 15000)}\n\nQuestion: ${question}\n\nAnswer based on the document:`;
  const answer = await generateCompletion(prompt, 'chat', req.userId);
  await incrementUsage(req.userId, 'writing');

  return success(res, { answer });
}));

// ── Summarize document ──
router.post('/summarize-document', authenticate, aiRateLimit, requireService('openai'), asyncHandler(async (req, res) => {
  const { documentId } = z.object({ documentId: z.string().uuid() }).parse(req.body);

  const docs = await getDocuments(req.userId);
  const doc = docs.find(d => d.id === documentId);
  if (!doc) {
    return error(res, ErrorCodes.NOT_FOUND, 'Document not found', 404);
  }

  if (!doc.content) {
    return error(res, ErrorCodes.FILE_PROCESSING_FAILED, 'Document content is empty', 422);
  }

  const summary = await generateCompletion(doc.content.substring(0, 15000), 'summarize', req.userId);
  await incrementUsage(req.userId, 'writing');

  return success(res, { summary, title: doc.name });
}));

export default router;