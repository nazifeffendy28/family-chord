/**
 * POST /.netlify/functions/saveScore
 *
 * Body (JSON):
 *   { "name":"Player", "score":18, "totalQuestions":20, "percentage":90 }
 *
 * Menyimpan skor ke leaderboard dan mengembalikan entri yang tersimpan
 * beserta peringkatnya.
 */
const { json } = require("./_shared");
const { addScore, getLeaderboard } = require("./_store");

exports.handler = async (event) => {
  // Tangani preflight CORS bila ada.
  if (event.httpMethod === "OPTIONS") return json(204, {});

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Gunakan metode POST." });
  }

  try {
    const data = JSON.parse(event.body || "{}");

    // Validasi & normalisasi input.
    const name = String(data.name || "Anonymous").trim().slice(0, 30) || "Anonymous";
    const score = Number(data.score);
    const totalQuestions = Number(data.totalQuestions);

    if (!Number.isFinite(score) || !Number.isFinite(totalQuestions) || totalQuestions <= 0) {
      return json(400, { error: "Field 'score' dan 'totalQuestions' wajib berupa angka valid." });
    }

    // Hitung ulang persentase di server agar konsisten (jangan percaya nilai klien).
    const percentage = Math.round((score / totalQuestions) * 100);

    const entry = {
      name,
      score,
      totalQuestions,
      percentage,
      date: new Date().toISOString(),
    };

    await addScore(entry);

    // Tentukan peringkat entri ini di leaderboard.
    const leaderboard = await getLeaderboard(1000);
    const rank =
      leaderboard.findIndex(
        (e) => e.date === entry.date && e.name === entry.name && e.score === entry.score
      ) + 1;

    return json(201, { success: true, entry, rank });
  } catch (err) {
    return json(400, { error: "Body JSON tidak valid: " + err.message });
  }
};
