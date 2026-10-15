import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { submissions } from '../db/schema';
import { desc } from 'drizzle-orm';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Hanya menerima metode GET
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Hanya metode GET yang diizinkan.' });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  try {
    // Mengambil seluruh data kiriman, diurutkan dari yang paling baru
    const data = await db
      .select()
      .from(submissions)
      .orderBy(desc(submissions.createdAt));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Gagal mengambil data:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil arsip cerita.',
      error: error.message,
    });
  }
}