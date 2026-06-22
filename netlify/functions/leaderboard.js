/**
 * GET /.netlify/functions/leaderboard[?limit=N]
 *
 * Mengembalikan daftar skor terurut dari yang tertinggi:
 *   [ { "name":"Player1", "score":19, "percentage":95 }, ... ]
 */
const { json } = require("./_shared");
const { getLeaderboard } = require("./_store");

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    let limit = parseInt(params.limit, 10);
    if (Number.isNaN(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const leaderboard = await getLeaderboard(limit);
    return json(200, leaderboard);
  } catch (err) {
    return json(500, { error: err.message });
  }
};
