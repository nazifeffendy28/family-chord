/**
 * GET /.netlify/functions/getQuestion?root=C&scale=major[&count=N]
 *
 * - Tanpa `count`        -> mengembalikan SATU soal: { question, options, answer }
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

    // Validasi jumlah soal (default 1, dibatasi 1–50).
    let count = parseInt(params.count, 10);
    if (Number.isNaN(count) || count < 1) count = 1;
    if (count > 50) count = 50;

    const questions = generateQuestions(root, scale, count);

    // Bentuk response sesuai kontrak: tunggal vs batch.
    return json(200, count > 1 ? questions : questions[0]);
  } catch (err) {
    return json(400, { error: err.message });
  }
};
