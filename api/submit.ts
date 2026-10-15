import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { submissions } from '../db/schema.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import PDFParser from 'pdf2json';

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

// Fungsi pembantu membaca teks PDF secara menyeluruh
function extractPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new (PDFParser as any)(null, 1);

    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(errData.parserError || errData);
    });

    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        let fullText = '';
        if (pdfData && pdfData.Pages) {
          for (const page of pdfData.Pages) {
            if (page.Texts) {
              for (const textItem of page.Texts) {
                if (textItem.R) {
                  for (const r of textItem.R) {
                    if (r.T) {
                      fullText += decodeURIComponent(r.T) + ' ';
                    }
                  }
                }
              }
            }
          }
        }

        // Fallback jika array halaman kosong
        if (!fullText.trim() && typeof (pdfParser as any).getRawTextContent === 'function') {
          fullText = (pdfParser as any).getRawTextContent();
        }

        resolve(fullText.trim());
      } catch {
        resolve('');
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Metode tidak diizinkan. Gunakan POST.' });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { authorName, instagram, tiktok, fileName, fileBase64 } = body;
    let { storyText } = body;

    if (!authorName) {
      return res.status(400).json({ success: false, message: 'Nama penulis wajib diisi.' });
    }

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
          const parsedPdfText = await extractPdfText(fileBuffer);
          storyText = parsedPdfText.trim() || storyText;
        } else if (lowerName.endsWith('.docx')) {
          const parsedDocx = await mammoth.extractRawText({ buffer: fileBuffer });
          storyText = parsedDocx.value?.trim() || storyText;
        }
      } catch (extractErr) {
        console.error('Peringatan ekstraksi teks berkas:', extractErr);
      }
    }

    if (!storyText || storyText.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Teks cerita tidak ditemukan. Harap isi teks langsung atau sertakan dokumen valid.',
      });
    }

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
    console.error('Runtime error:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server.',
      error: error?.message || String(error),
    });
  }
}