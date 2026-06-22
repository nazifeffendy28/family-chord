/**
 * GET /.netlify/functions/getChords?root=C&scale=major
 *
 * Mengembalikan "chord family" sebagai map roman numeral -> chord:
 *   { "I":"C", "ii":"D minor", ..., "vii°":"B diminished" }
 */
const { json, getChordFamily } = require("./_shared");

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const root = params.root || "C";
    const scale = params.scale || "major";

    const family = getChordFamily(root, scale);
    return json(200, family);
  } catch (err) {
    return json(400, { error: err.message });
  }
};
