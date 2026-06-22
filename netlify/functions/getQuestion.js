/**
 * GET /.netlify/functions/getQuestion?root=C&scale=major[&notation=sharp&difficulty=medium&count=N]
 *
 * Param:
 *   root        Root note sesuai notasi (mis. "C", "C#", "Db").
 *   scale       "major" | "minor".
 *   notation    "sharp" (♯) | "flat" (♭). Default: sharp.
 *   difficulty  "easy" | "medium" | "hard" | "restu-wilayatul-faqih". Default: medium.
 *   count       Jumlah soal (default 1, maks 50).
 *
 * - Tanpa `count`         -> mengembalikan SATU soal: { question, options, answer }
 * - Dengan `count=N` (>1) -> mengembalikan ARRAY berisi N soal sekaligus
 *                            (dipakai frontend agar logika anti-pengulangan
 *                             antar soal tetap terjaga dalam satu panggilan).
 */
const { json, generateQuestions } = require("./_shared");

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const root = params.root || "C";
    const scale = params.scale || "major";
    const notation = params.notation || "sharp";
    const difficulty = params.difficulty || "medium";

    // Validasi jumlah soal (default 1, dibatasi 1–50).
    let count = parseInt(params.count, 10);
    if (Number.isNaN(count) || count < 1) count = 1;
    if (count > 50) count = 50;

    const questions = generateQuestions(root, scale, { notation, difficulty, count });

    // Bentuk response sesuai kontrak: tunggal vs batch.
    return json(200, count > 1 ? questions : questions[0]);
  } catch (err) {
    return json(400, { error: err.message });
  }
};
