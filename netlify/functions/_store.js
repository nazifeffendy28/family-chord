/**
 * _store.js
 * Penyimpanan skor leaderboard.
 *
 * Backend utama: Netlify Blobs (persisten permanen, otomatis tersedia saat
 * deploy ke Netlify maupun saat `netlify dev` — tanpa konfigurasi tambahan).
 *
 * Fallback: bila Netlify Blobs tidak tersedia (mis. dijalankan via `node`
 * polos untuk pengujian, atau package belum terpasang), penyimpanan jatuh ke
 * file di /tmp. Dengan begitu kode tetap berfungsi di semua lingkungan.
 *
 * data/scores.json dipakai sebagai data awal (seed) ketika store masih kosong.
 *
 * Semua fungsi bersifat async karena Netlify Blobs berbasis Promise.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

// Data awal (seed) di-bundle dari repo.
const seed = require("../../data/scores.json");

const STORE_NAME = "family-chord-scores"; // nama "bucket" di Netlify Blobs
const KEY = "leaderboard"; // satu key berisi array seluruh skor
const TMP_FILE = path.join(os.tmpdir(), "family-chord-scores.json");

const seedCopy = () => (Array.isArray(seed) ? [...seed] : []);

/* -------------------------------------------------------------------------
 * Pemilihan backend
 * ------------------------------------------------------------------------- */

let cachedStore; // undefined = belum dicoba, null = tidak tersedia

/** Ambil instance Netlify Blobs store, atau null bila tidak tersedia. */
function getBlobStore() {
  if (cachedStore !== undefined) return cachedStore;
  try {
    const { getStore } = require("@netlify/blobs");
    cachedStore = getStore(STORE_NAME);
  } catch (err) {
    // Package tidak ada / di luar konteks Netlify → pakai fallback.
    cachedStore = null;
  }
  return cachedStore;
}

/* -------------------------------------------------------------------------
 * Fallback /tmp
 * ------------------------------------------------------------------------- */

function readTmp() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(TMP_FILE, "utf8"));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    /* abaikan, pakai seed */
  }
  return seedCopy();
}

function writeTmp(scores) {
  try {
    fs.writeFileSync(TMP_FILE, JSON.stringify(scores, null, 2));
  } catch (err) {
    /* best-effort */
  }
}

/* -------------------------------------------------------------------------
 * API penyimpanan (async)
 * ------------------------------------------------------------------------- */

/** Baca seluruh skor dari backend aktif. */
async function readScores() {
  const store = getBlobStore();
  if (store) {
    try {
      const data = await store.get(KEY, { type: "json" });
      // Bila key belum pernah ditulis → mulai dari seed.
      return Array.isArray(data) ? data : seedCopy();
    } catch (err) {
      // Bila Blobs error tak terduga, jatuh ke fallback agar tidak crash.
      return readTmp();
    }
  }
  return readTmp();
}

/** Tulis seluruh skor ke backend aktif. */
async function writeScores(scores) {
  const store = getBlobStore();
  if (store) {
    try {
      await store.setJSON(KEY, scores);
      return;
    } catch (err) {
      // Fallback bila penulisan Blobs gagal.
    }
  }
  writeTmp(scores);
}

/** Tambah satu entri skor, kembalikan seluruh daftar terbaru. */
async function addScore(entry) {
  const scores = await readScores();
  scores.push(entry);
  await writeScores(scores);
  return scores;
}

/**
 * Leaderboard terurut: skor tertinggi → persentase → terbaru.
 * Dibatasi `limit` entri.
 */
async function getLeaderboard(limit = 20) {
  const scores = await readScores();
  return scores
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.percentage !== a.percentage) return b.percentage - a.percentage;
      return new Date(b.date || 0) - new Date(a.date || 0);
    })
    .slice(0, limit);
}

module.exports = { addScore, getLeaderboard };
