import { Pool } from 'pg';

// Uses your Neon DB URL directly unless overridden by env.
const DEFAULT_NEON_URL =
  'postgresql://neondb_owner:npg_CesoTOEG72cV@ep-blue-band-a1ogg31y-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_NEON_URL;

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 5,
    });
  }
  return pool;
}

function toQuizQuestion(row) {
  if (!row?.question || !row?.answer) return null;
  const options = [row.option_a, row.option_b, row.option_c, row.option_d].filter(Boolean);
  if (options.length < 2) return null;

  return {
    question: row.question,
    options,
    correctAnswer: row.answer,
    explanation: row.subject ? `Subject: ${row.subject}` : 'Choose the best answer.',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const db = getPool();
    const { rows } = await db.query(
      `
      SELECT teacherid, subject, class, secion, question, option_a, option_b, option_c, option_d, answer
      FROM public.game
      ORDER BY teacherid ASC
      `
    );

    const questions = rows.map(toQuizQuestion).filter(Boolean);

    return res.status(200).json({
      source: 'db',
      count: questions.length,
      questions,
    });
  } catch (error) {
    return res.status(500).json({
      source: 'error',
      error: error?.message || 'Failed to fetch questions from database',
      questions: [],
    });
  }
}
