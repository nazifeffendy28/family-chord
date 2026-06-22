/**
 * _store.js
 * Penyimpanan skor leaderboard.
 *
 * Backend utama: Netlify Blobs (persisten permanen, otomatis tersedia saat
 * deploy ke Netlify maupun saat `netlify dev` — tanpa konfigurasi tambahan).
 *
 * Desain anti-race: setiap skor disimpan sebagai SATU key tersendiri
 * (`score:<timestamp>:<rand>`). Penulisan jadi atomik per-entri sehingga dua
 * submission bersamaan tidak saling menimpa (tidak ada read-modify-write atas
 * satu array bersama). Leaderboard dibentuk dengan list() + get() semua key.
 *
 * Fallback: bila Netlify Blobs tidak tersedia (mis. dijalankan via `node`
 * polos), penyimpanan jatuh ke satu file di /tmp (cukup untuk pengujian lokal
 * single-process). data/scores.json dipakai sebagai data awal (seed).
 *
 * Semua fungsi async karena Netlify Blobs berbasis Promise.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

// Data awal (seed) di-bundle dari repo, selalu jadi baseline tampilan.
const seed = require("../../data/scores.json");

const STORE_NAME = "family-chord-scores";
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
    cachedStore = null; // package tidak ada / di luar konteks Netlify
  }
  return cachedStore;
}

/* -------------------------------------------------------------------------
 * Util
 * ------------------------------------------------------------------------- */

/** Key unik untuk satu entri skor. */
function makeKey(entry) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `score:${entry.date || Date.now()}:${rand}`;
}

/** Dua entri dianggap sama bila tanggal+nama+skor identik. */
function sameEntry(a, b) {
  return a.date === b.date && a.name === b.name && a.score === b.score;
}

/** Poin sebuah entri (fallback ke score bila entri lama tanpa points). */
const pointsOf = (e) => (typeof e.points === "number" ? e.points : e.score);

/** Urutan leaderboard: poin tertinggi → persentase → terbaru. */
function sortEntries(entries) {
  return entries.slice().sort((a, b) => {
    if (pointsOf(b) !== pointsOf(a)) return pointsOf(b) - pointsOf(a);
    if (b.percentage !== a.percentage) return b.percentage - a.percentage;
    return new Date(b.date || 0) - new Date(a.date || 0);
  });
}

/* -------------------------------------------------------------------------
 * Fallback /tmp (hanya untuk lokal tanpa Blobs)
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
 * Pembacaan seluruh entri
 * ------------------------------------------------------------------------- */

/** Kumpulkan seluruh entri skor (seed + tersimpan) dari backend aktif. */
async function readAllEntries() {
  const store = getBlobStore();
  if (store) {
    try {
      const { blobs } = await store.list({ prefix: "score:" });
      const reads = await Promise.all(
        blobs.map((b) => store.get(b.key, { type: "json" }).catch(() => null))
      );
      const saved = reads.filter((e) => e && typeof e === "object");
      // Seed selalu jadi baseline (data demo); entri tersimpan ditambahkan.
      return seedCopy().concat(saved);
    } catch (err) {
      return readTmp(); // bila list/get gagal total, jangan crash
    }
  }
  return readTmp();
}

/* -------------------------------------------------------------------------
 * API publik (async)
 * ------------------------------------------------------------------------- */

/**
 * Simpan satu entri skor (atomik) lalu kembalikan { entry, rank }.
 * Rank dihitung dari gabungan seluruh entri + entri ini (dijamin terhitung
 * walau list() Blobs sesaat belum konsisten).
 */
async function addScore(entry) {
  const store = getBlobStore();
  if (store) {
    try {
      await store.setJSON(makeKey(entry), entry); // tulis atomik, no race
    } catch (err) {
      // Bila Blobs gagal, jatuh ke /tmp.
      const scores = readTmp();
      scores.push(entry);
      writeTmp(scores);
    }
  } else {
    const scores = readTmp();
    scores.push(entry);
    writeTmp(scores);
  }

  // Hitung rank; pastikan entri ini ikut walau list belum memuatnya.
  const all = await readAllEntries();
  const merged = all.some((e) => sameEntry(e, entry)) ? all : all.concat(entry);
  const sorted = sortEntries(merged);
  const rank = sorted.findIndex((e) => sameEntry(e, entry)) + 1;

  return { entry, rank };
}

/** Leaderboard terurut, dibatasi `limit` entri. */
async function getLeaderboard(limit = 20) {
  const all = await readAllEntries();
  return sortEntries(all).slice(0, limit);
}

module.exports = { addScore, getLeaderboard };
