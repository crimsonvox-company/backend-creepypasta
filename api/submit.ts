import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { submissions } from '../db/schema.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

// Middleware bantuan untuk CORS
const setCorsHeaders = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://creepypasta-form.vercel.app/'); // Ganti '*' dengan URL frontend Anda di production
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Tangani Header CORS & Preflight Request (OPTIONS)
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Validasi Method
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Metode tidak diizinkan. Gunakan POST.' });
  }

  // 3. Inisialisasi Database
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  try {
    // 4. Parse Body dengan aman
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { authorName, instagram, tiktok, fileName, fileBase64 } = body;
    let { storyText } = body;

    // 5. Validasi Input Wajib
    if (!authorName || authorName.trim() === '') {
      return res.status(400).json({ success: false, message: 'Nama penulis wajib diisi.' });
    }

    // 6. Ekstraksi File (Jika dikirim via Base64)
    if (fileBase64 && fileName) {
      const lowerName = fileName.toLowerCase();
      const isAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

      if (!isAllowedExtension) {
        return res.status(400).json({
          success: false,
          message: 'Format berkas tidak didukung! Hanya berkas .pdf dan .docx yang diperbolehkan.',
        });
      }

      const fileBuffer = Buffer.from(fileBase64, 'base64');

      if (fileBuffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({
          success: false,
          message: `Ukuran berkas terlalu besar! Maksimal ukuran berkas adalah ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
        });
      }

      try {
        if (lowerName.endsWith('.pdf')) {
          const { text } = await extractText(new Uint8Array(fileBuffer));
          const joinedText = Array.isArray(text) ? text.join('\n') : text;
          if (joinedText && joinedText.trim()) {
            storyText = joinedText.trim();
          }
        } else if (lowerName.endsWith('.docx')) {
          const parsedDocx = await mammoth.extractRawText({ buffer: fileBuffer });
          if (parsedDocx.value && parsedDocx.value.trim()) {
            storyText = parsedDocx.value.trim();
          }
        }
      } catch (extractErr) {
        console.error('Ekstraksi gagal:', extractErr);
        return res.status(422).json({
          success: false,
          message: 'Gagal mengekstrak teks dari dokumen. Pastikan dokumen tidak terkunci atau rusak (corrupt).',
        });
      }
    }

    // 7. Validasi Teks Cerita Terakhir
    if (!storyText || storyText.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Teks cerita tidak ditemukan. Harap isi teks langsung atau sertakan dokumen valid.',
      });
    }

    // 8. Insert ke Database
    await db.insert(submissions).values({
      authorName: authorName.trim(),
      storyText: storyText.trim(),
      fileUrl: null,
      instagram: instagram || null,
      tiktok: tiktok || null,
    });

    // 9. Berikan Respons Sukses
    return res.status(200).json({
      success: true,
      message: 'Cerita berhasil disubmit ke arsip database.',
    });
  } catch (error: any) {
    console.error('Runtime error:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server.',
      error: error?.message || String(error),
    });
  }
}