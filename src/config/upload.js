const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extForMime(mime) {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '';
}

function getUploadRoot() {
  if (process.env.UPLOADS_DIR && String(process.env.UPLOADS_DIR).trim()) {
    return path.resolve(process.env.UPLOADS_DIR);
  }
  return path.join(__dirname, '..', '..', 'uploads');
}

function ensureUploadRoot() {
  const root = getUploadRoot();
  const mediaDir = path.join(root, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  return root;
}

const maxBytes = (() => {
  const mb = Number(process.env.MAX_UPLOAD_MB || '5');
  const n = Number.isFinite(mb) && mb > 0 ? mb : 5;
  return n * 1024 * 1024;
})();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadRoot();
    cb(null, path.join(getUploadRoot(), 'media'));
  },
  filename: (_req, file, cb) => {
    const ext = extForMime(file.mimetype) || '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    return cb(null, true);
  }
  cb(new Error('Tipo de archivo no permitido. Usa JPG, PNG o WEBP.'));
};

const upload = multer({
  storage,
  limits: { fileSize: maxBytes },
  fileFilter,
});

module.exports = {
  uploadMediaSingle: upload.single('file'),
  getUploadRoot,
  ensureUploadRoot,
  ALLOWED_MIME,
};
