/* ============================================
   OmniAI — Document Intelligence Routes
   ============================================ */
'use strict';

const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { authenticate, loadSubscription } = require('../middleware/auth');
const { checkUsageLimit, logUsage } = require('../middleware/usage');
const { supabase } = require('../db/supabase');
const { success } = require('../utils/response');
const { AppError } = require('../utils/errors');

const router = Router();
router.use(authenticate, loadSubscription);

// File upload configuration
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024;
const ALLOWED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
    const fs = require('fs');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeName = uuidv4() + path.extname(file.originalname).toLowerCase();
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  // Validate MIME type and extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIMES.includes(file.mimetype) && !['.pdf', '.docx', '.txt'].includes(ext)) {
    return cb(new AppError('Invalid file type. Only PDF, DOCX, and TXT files are allowed.', 400, 'INVALID_FILE_TYPE'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

/**
 * POST /api/documents/upload
 * Upload a document for processing
 */
router.post('/upload', checkUsageLimit('document_upload'), (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return next(err);

    try {
      if (!req.file) {
        throw new AppError('No file provided.', 400, 'NO_FILE');
      }

      // Validate filename (sanitize)
      const safeOriginalName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');

      // Store in database
      const { data: doc, error } = await supabase.from('documents').insert({
        user_id: req.user.id,
        filename: req.file.filename,
        original_name: safeOriginalName,
        mime_type: req.file.mimetype || 'application/octet-stream',
        size_bytes: req.file.size,
        storage_path: req.file.path,
        status: 'uploaded',
      }).select('id, original_name, mime_type, size_bytes, status, created_at').single();

      if (error) {
        console.error('Document insert error:', error);
        throw new AppError('Failed to save document metadata.', 500, 'DOCUMENT_SAVE_FAILED');
      }

      await logUsage(req.user.id, 'document_upload', {
        document_id: doc.id,
        size_bytes: req.file.size,
      });

      success(res, { document: doc }, 201);
    } catch (err) {
      next(err);
    }
  });
});

/**
 * GET /api/documents
 * List user's documents
 */
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('documents')
      .select('id, original_name, mime_type, size_bytes, status, summary, created_at', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    success(res, {
      documents: data || [],
      pagination: { page, limit, total: count, pages: Math.ceil((count || 0) / limit) },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/documents/:id
 * Get document details
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { data: doc, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !doc) {
      throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
    }

    success(res, { document: doc });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/documents/:id/summarize
 * Summarize a document
 */
router.post('/:id/summarize', checkUsageLimit('document_summarize'), async (req, res, next) => {
  try {
    const { data: doc, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !doc) {
      throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
    }

    // Read file content
    const fs = require('fs');
    let content = '';

    try {
      if (doc.mime_type === 'text/plain' || doc.filename.endsWith('.txt')) {
        content = fs.readFileSync(doc.storage_path, 'utf8').substring(0, 10000);
      } else {
        // PDF/DOCX — read as text where possible
        content = `Document: ${doc.original_name}\nType: ${doc.mime_type}\nSize: ${(doc.size_bytes / 1024).toFixed(1)} KB\n\nDocument uploaded successfully. Full text extraction requires a PDF parsing service.`;
      }
    } catch (readErr) {
      content = `Document available: ${doc.original_name} (${(doc.size_bytes / 1024).toFixed(1)} KB)`;
    }

    // Call AI to summarize
    const { callAI } = require('../services/ai-service');
    const result = await callAI(
      `Summarize the following document content concisively:\n\n${content}`,
      { system: 'You are a document analysis expert. Provide clear, structured summaries.' }
    );

    // Update document with summary
    await supabase.from('documents').update({
      summary: result.content,
      status: 'summarized',
    }).eq('id', doc.id);

    await logUsage(req.user.id, 'document_summarize', { document_id: doc.id });

    success(res, {
      summary: result.content,
      tokens: result.tokens,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/documents/:id/query
 * Ask a question about a document
 */
router.post('/:id/query', checkUsageLimit('document_query'), async (req, res, next) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      throw new AppError('Query is required.', 400, 'QUERY_REQUIRED');
    }

    const { data: doc, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !doc) {
      throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
    }

    const fs = require('fs');
    let content = doc.summary || `Document: ${doc.original_name}`;

    try {
      if (doc.mime_type === 'text/plain' || doc.filename.endsWith('.txt')) {
        content = fs.readFileSync(doc.storage_path, 'utf8').substring(0, 8000);
      }
    } catch { /* use summary */ }

    const { callAI } = require('../services/ai-service');
    const result = await callAI(
      `Based on this document, answer the following question:\n\nDocument: ${content}\n\nQuestion: ${query}`,
      { system: 'Answer questions based only on the provided document content. If the answer is not in the document, say so.' }
    );

    await logUsage(req.user.id, 'document_query', { document_id: doc.id });

    success(res, {
      answer: result.content,
      tokens: result.tokens,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { data: doc } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!doc) {
      throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
    }

    // Delete file
    try {
      require('fs').unlinkSync(doc.storage_path);
    } catch { /* file may not exist */ }

    // Delete from database
    await supabase.from('documents').delete().eq('id', req.params.id);

    success(res, { message: 'Document deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;