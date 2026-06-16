require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { BlobServiceClient } = require('@azure/storage-blob');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Azure Setup ────────────────────────────────────────────────────────────
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME;

if (!AZURE_STORAGE_CONNECTION_STRING || !AZURE_STORAGE_CONTAINER_NAME) {
  console.error('Missing Azure environment variables');
  process.exit(1);
}

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);

// Create container if not exists
(async () => {
  try {
    await containerClient.createIfNotExists({ access: 'blob' });
    console.log(`Container "${AZURE_STORAGE_CONTAINER_NAME}" ready.`);
  } catch (err) {
    console.error('Failed to initialize container:', err.message);
  }
})();

// ─── In-Memory Store ─────────────────────────────────────────────────────────
// Map<code, { files: [{blobName, originalName, size, mimeType}], expiresAt, uploadedAt, timerId }>
const fileStore = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────
const generateCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (fileStore.has(code));
  return code;
};

const uploadToAzureBlob = async (buffer, blobName, mimeType) => {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mimeType || 'application/octet-stream' },
  });
  return blockBlobClient.url;
};

const deleteFromAzureBlob = async (blobName) => {
  try {
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.deleteIfExists();
    console.log(`Deleted blob: ${blobName}`);
  } catch (err) {
    console.error(`Failed to delete blob ${blobName}:`, err.message);
  }
};

// Delete all blobs for a session and remove from store
const deleteSession = async (code) => {
  const entry = fileStore.get(code);
  if (!entry) return;
  if (entry.timerId) clearTimeout(entry.timerId);
  fileStore.delete(code);
  for (const f of entry.files) {
    await deleteFromAzureBlob(f.blobName);
  }
  console.log(`Session deleted: ${code} (${entry.files.length} file(s))`);
};

const scheduleExpiry = (code, delayMs) => {
  const timerId = setTimeout(async () => {
    if (fileStore.has(code)) {
      await deleteSession(code);
      console.log(`Expired & cleaned up session: ${code}`);
    }
  }, delayMs);
  return timerId;
};

// ─── Multer (memory storage) ─────────────────────────────────────────────────
// Individual file limit is 10 MB; total is enforced in the route handler
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'DELETE'],
}));
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /upload  — accepts multiple files, total ≤ 10 MB
app.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided.' });
    }

    const totalSize = req.files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'Total file size exceeds the 10 MB limit.' });
    }

    const code = generateCode();
    const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
    const expiresAt = Date.now() + EXPIRY_MS;
    const uploadedAt = Date.now();

    // Upload every file to Azure under a code-namespaced prefix
    const uploadedFiles = [];
    for (const file of req.files) {
      const uniqueId = uuidv4();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const blobName = `${code}/${uniqueId}-${safeName}`;
      await uploadToAzureBlob(file.buffer, blobName, file.mimetype);
      uploadedFiles.push({
        blobName,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      });
    }

    const timerId = scheduleExpiry(code, EXPIRY_MS);
    fileStore.set(code, { files: uploadedFiles, expiresAt, uploadedAt, timerId });

    // Generate QR code pointing to the frontend download page
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
    const downloadUrl = `${FRONTEND_URL}/download?code=${code}`;
    const qrCodeImage = await QRCode.toDataURL(downloadUrl, { width: 256, margin: 2 });

    return res.status(200).json({
      code,
      qrCodeImage,
      expiresIn: 600,
      files: uploadedFiles.map(f => ({ originalName: f.originalName, size: f.size })),
      totalSize,
    });
  } catch (err) {
    console.error('Upload error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'A file exceeds the 10 MB individual limit.' });
    }
    return res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// GET /file-info/:code
app.get('/file-info/:code', (req, res) => {
  const { code } = req.params;
  const entry = fileStore.get(code.toUpperCase());

  if (!entry) {
    return res.status(404).json({ error: 'Invalid or expired code.' });
  }

  const now = Date.now();
  if (now > entry.expiresAt) {
    deleteSession(code.toUpperCase());
    return res.status(410).json({ error: 'Session has expired.' });
  }

  return res.json({
    files: entry.files.map(f => ({ originalName: f.originalName, size: f.size })),
    expiresAt: entry.expiresAt,
    uploadedAt: entry.uploadedAt,
    timeLeft: Math.max(0, Math.floor((entry.expiresAt - now) / 1000)),
  });
});

// GET /download/:code/:filename  — download a specific file from a session
app.get('/download/:code/:filename', async (req, res) => {
  const { code } = req.params;
  const filename = decodeURIComponent(req.params.filename);
  const entry = fileStore.get(code.toUpperCase());

  if (!entry) {
    return res.status(404).json({ error: 'Invalid or expired code.' });
  }

  const now = Date.now();
  if (now > entry.expiresAt) {
    await deleteSession(code.toUpperCase());
    return res.status(410).json({ error: 'Session has expired.' });
  }

  const fileEntry = entry.files.find(f => f.originalName === filename);
  if (!fileEntry) {
    return res.status(404).json({ error: 'File not found in this session.' });
  }

  try {
    const blockBlobClient = containerClient.getBlockBlobClient(fileEntry.blobName);
    const downloadResponse = await blockBlobClient.download(0);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileEntry.originalName)}"`);
    res.setHeader('Content-Type', downloadResponse.contentType || 'application/octet-stream');

    downloadResponse.readableStreamBody.pipe(res);
  } catch (err) {
    console.error('Download error:', err);
    return res.status(500).json({ error: 'Failed to download file.' });
  }
});

// DELETE /terminate/:code  — immediately end a session and delete all blobs
app.delete('/terminate/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const entry = fileStore.get(code);

  if (!entry) {
    return res.status(404).json({ error: 'Session not found or already expired.' });
  }

  await deleteSession(code);
  return res.json({ message: 'Session terminated successfully.' });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', sessions: fileStore.size }));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`ZipZap backend running on http://localhost:${PORT}`);
});
