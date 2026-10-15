import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { submissions } from '../db/schema';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;

const MAX_FILE_SIZE = 4 * 1024 * 1024;

const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Metode tidak diizinkan. Gunakan POST.' });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  try {
    const { authorName, instagram, tiktok, fileName, fileBase64 } = req.body || {};
    let { storyText } = req.body || {};

    if (!authorName) {
      return res.status(400).json({ success: false, message: 'Nama penulis wajib diisi.' });
    }

    if (fileBase64 && fileName) {
      const lowerName = fileName.toLowerCase();

      // 1. Validasi Ekstensi (.pdf atau .docx)
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
          const parsedPdf = await pdfParse(fileBuffer);
          storyText = parsedPdf.text?.trim() || storyText;
        } else if (lowerName.endsWith('.docx')) {
          const parsedDocx = await mammoth.extractRawText({ buffer: fileBuffer });
          storyText = parsedDocx.value?.trim() || storyText;
        }
      } catch (extractErr) {
        console.error('Peringatan: Gagal mengekstrak teks berkas:', extractErr);
      }
    }

    // Validasi ketersediaan cerita
    if (!storyText || storyText.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Teks cerita tidak ditemukan. Harap isi textbox atau unggah berkas PDF/DOCX yang memuat teks.',
      });
    }

    // Simpan ke database Neon Postgres
    await db.insert(submissions).values({
      authorName,
      storyText: storyText.trim(),
      fileUrl: null,
      instagram: instagram || null,
      tiktok: tiktok || null,
    });

    return res.status(200).json({
      success: true,
      message: 'Cerita berhasil disubmit ke arsip database.',
    });
  } catch (error: any) {
    console.error('Error saat submit:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server.',
      error: error.message,
    });
  }
}