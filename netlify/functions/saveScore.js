/**
 * POST /.netlify/functions/saveScore
 *
 * Body (JSON), salah satu bentuk:
 *   { "name":"Player", "results":[true,true,false,...], "difficulty":"hard" }
 *   { "name":"Player", "score":18, "totalQuestions":20, "difficulty":"hard" }
 *
 * Bila `results` (urutan benar/salah) dikirim, server menghitung skor & poin
 * lengkap dengan BONUS STREAK (poin dobel saat streak > 5). Bila tidak, poin
 * dihitung sederhana = benar × bobot level. `percentage` & `points` selalu
 * dihitung ulang di server agar tidak bisa dicurangi dari klien.
 */
const { json, getDifficultyPoints, computeStreakPoints, normalizeDifficulty } = require("./_shared");
const { addScore } = require("./_store");

exports.handler = async (event) => {
  // Tangani preflight CORS bila ada. 204 No Content TIDAK boleh punya body.
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Gunakan metode POST." });
  }

  try {
    const data = JSON.parse(event.body || "{}");

    // Validasi & normalisasi input.
    const name = String(data.name || "Anonymous").trim().slice(0, 30) || "Anonymous";
    const difficulty = normalizeDifficulty(data.difficulty);

    let score, totalQuestions, points;

    if (Array.isArray(data.results) && data.results.length > 0) {
      // Bentuk lengkap: hitung skor & poin (termasuk bonus streak) dari urutan.
      const results = data.results.map(Boolean);
      totalQuestions = results.length;
      score = results.filter(Boolean).length;
      points = computeStreakPoints(results, difficulty);
    } else {
      // Bentuk sederhana: tanpa urutan, poin = benar × bobot (tanpa bonus).
      score = Number(data.score);
      totalQuestions = Number(data.totalQuestions);
      if (!Number.isFinite(score) || !Number.isFinite(totalQuestions) || totalQuestions <= 0) {
        return json(400, {
          error: "Kirim 'results' (array benar/salah) atau 'score' + 'totalQuestions' yang valid.",
        });
      }
      points = score * getDifficultyPoints(difficulty);
    }

    // Hitung ulang persentase di server agar konsisten.
    const percentage = Math.round((score / totalQuestions) * 100);

    const entry = {
      name,
      score,
      totalQuestions,
      percentage,
      difficulty,
      points,
      date: new Date().toISOString(),
    };

    // Simpan atomik & dapatkan peringkat dalam satu langkah.
    const { rank } = await addScore(entry);

    return json(201, { success: true, entry, rank });
  } catch (err) {
    return json(400, { error: "Body JSON tidak valid: " + err.message });
  }
};
