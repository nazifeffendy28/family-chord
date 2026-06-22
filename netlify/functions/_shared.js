/**
 * _shared.js
 * Modul bersama untuk seluruh Netlify Functions.
 *
 * File diawali underscore ("_") sehingga Netlify TIDAK memperlakukannya
 * sebagai sebuah function/endpoint, tetapi tetap bisa di-require oleh
 * function lain. Semua data chord dibaca dari data/chords.json (di-generate
 * oleh scripts/generate-chords.js — tidak lagi hardcoded di frontend).
 */

// Data chord di-bundle dari file JSON (sumber kebenaran tunggal).
const chordData = require("../../data/chords.json");

const VALID_NOTATIONS = ["sharp", "flat"];
const VALID_SCALES = ["major", "minor"];

// Definisi level kesulitan. Tiap level mengatur:
//   types           : kumpulan tipe soal (boleh ada duplikat = bobot lebih sering)
//   degrees         : derajat skala yang boleh dipakai (0=I ... 6=vii°)
//   options         : jumlah pilihan jawaban
//   hardDistractors : pengecoh diambil dari seluruh 12 chord (lebih menjebak)
//   points          : poin per jawaban benar (bobot level)
//   timer           : batas waktu per soal dalam detik (0 = tanpa batas)
const ALL_DEGREES = [0, 1, 2, 3, 4, 5, 6];

// Bonus streak: bila streak benar beruntun MELEBIHI angka ini, tiap jawaban
// benar berikutnya mendapat poin dobel (bonus = poin dasar level).
const STREAK_BONUS_THRESHOLD = 5;

const DIFFICULTIES = {
  easy: {
    // Chord pokok I, IV, V saja; hanya "simbol -> chord" (recognition).
    types: ["chord-roman", "chord-number"],
    degrees: [0, 3, 4], // I, IV, V
    options: 3,
    hardDistractors: false,
    points: 1,
    timer: 0,
  },
  medium: {
    // Seluruh chord diatonik, dua arah (chord <-> simbol).
    types: ["chord-roman", "roman-chord", "chord-number", "number-chord"],
    degrees: ALL_DEGREES,
    options: 4,
    hardDistractors: false,
    points: 2,
    timer: 0,
  },
  hard: {
    // Semua tipe, termasuk chord & derajat flat.
    types: ["chord-roman", "roman-chord", "chord-number", "number-chord", "flat-chord", "chord-flat"],
    degrees: ALL_DEGREES,
    options: 4,
    hardDistractors: false,
    points: 3,
    timer: 0,
  },
  "restu-wilayatul-faqih": {
    // Level terberat: fokus soal flat (♭II–♭VII) — dibobot 2x lebih sering —
    // plus derajat "warna" yang susah (ii, iii, vi, vii°). 5 opsi, pengecoh
    // dari seluruh chromatic pool, timer 5 detik, poin terbesar.
    types: ["flat-chord", "chord-flat", "flat-chord", "chord-flat", "roman-chord", "chord-roman"],
    degrees: [1, 2, 5, 6], // ii, iii, vi, vii° (bukan chord pokok)
    options: 5,
    hardDistractors: true,
    points: 5,
    timer: 5,
  },
};

/**
 * Helper standar untuk membentuk response JSON Netlify Function.
 * @param {number} statusCode
 * @param {*} body objek yang akan di-serialize ke JSON
 */
function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // CORS dasar supaya endpoint mudah diuji dari mana saja.
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

/** Normalisasi & validasi notasi (sharp/flat). Default: sharp. */
function normalizeNotation(notation) {
  return VALID_NOTATIONS.includes(notation) ? notation : "sharp";
}

/** Normalisasi & validasi scale. Default: major. */
function normalizeScale(scale) {
  if (!VALID_SCALES.includes(scale)) {
    throw new Error(`Scale tidak dikenal: "${scale}" (gunakan major / minor)`);
  }
  return scale;
}

/** Normalisasi level kesulitan. Default: medium. */
function normalizeDifficulty(difficulty) {
  return DIFFICULTIES[difficulty] ? difficulty : "medium";
}

/**
 * Ambil array 12 chord (7 diatonik + 5 chord flat) untuk root + scale + notasi.
 * Melempar error bila root tidak dikenal pada notasi tersebut.
 */
function getChordArray(root, scale, notation) {
  const chords = chordData.data[notation][scale][root];
  if (!chords) {
    throw new Error(`Root note tidak dikenal untuk notasi ${notation}: "${root}"`);
  }
  return chords;
}

/** Angka roman numeral sesuai scale (major / minor). */
function getNumerals(scale) {
  return chordData.numerals[scale];
}

/**
 * Bentuk "chord family": map roman numeral -> nama chord (7 chord diatonik).
 * Dipakai oleh endpoint getChords.
 *
 * Contoh hasil (C major): { "I": "C", "ii": "D minor", ..., "vii°": "B diminished" }
 */
function getChordFamily(root, scale, notation) {
  scale = normalizeScale(scale);
  notation = normalizeNotation(notation);
  const chords = getChordArray(root, scale, notation);
  const numerals = getNumerals(scale);
  const family = {};
  for (let i = 0; i < numerals.length; i++) {
    family[numerals[i]] = chords[i];
  }
  return family;
}

/** Acak array secara in-place (Fisher–Yates ringan, cukup untuk soal). */
function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

/**
 * Hasilkan SATU soal acak sesuai level kesulitan. Mengembalikan objek:
 *   { question, options, answer }
 *
 * `state` menyimpan degree & tipe soal terakhir agar tidak berulang
 * berturut-turut (logika dipertahankan dari versi asli).
 * `diff` adalah salah satu entri DIFFICULTIES.
 */
function buildSingleQuestion(root, scale, chords, numerals, state, diff) {
  const flatRomanNumerals = chordData.flatNumerals;
  const questionTypes = diff.types;
  const numDistractors = diff.options - 1; // jumlah pengecoh = total opsi - 1

  const allowedDegrees = diff.degrees;
  let degree, questionType, question, answer, questionKey;
  let attempts = 0;

  // Cari kombinasi soal yang belum dipakai (anti-duplikasi).
  do {
    // Pilih degree dari daftar yang diizinkan level ini; hindari sama berturut.
    do {
      degree = allowedDegrees[Math.floor(Math.random() * allowedDegrees.length)];
    } while (degree === state.lastDegree && allowedDegrees.length > 1 && attempts < 5);

    // Hindari tipe soal yang sama dua kali berturut-turut.
    do {
      questionType = questionTypes[Math.floor(Math.random() * questionTypes.length)];
    } while (questionType === state.lastQuestionType && questionTypes.length > 1 && attempts < 5);

    // Susun teks soal & jawaban sesuai tipe.
    if (questionType === "chord-roman") {
      question = `What is the ${numerals[degree]} chord in ${root} ${scale}?`;
      answer = chords[degree];
    } else if (questionType === "roman-chord") {
      question = `Which degree is ${chords[degree]} in ${root} ${scale}?`;
      answer = numerals[degree];
    } else if (questionType === "chord-number") {
      question = `What is the ${degree + 1} chord in ${root} ${scale}?`;
      answer = chords[degree];
    } else if (questionType === "number-chord") {
      question = `Which number is ${chords[degree]} in ${root} ${scale}?`;
      answer = (degree + 1).toString();
    } else if (questionType === "flat-chord") {
      const flatIndex = Math.floor(Math.random() * flatRomanNumerals.length);
      question = `What is the ${flatRomanNumerals[flatIndex]} chord in ${root} ${scale}?`;
      answer = chords[7 + flatIndex]; // Chord flat mulai di index 7
    } else if (questionType === "chord-flat") {
      const flatIndex = Math.floor(Math.random() * 5);
      const chordIndex = 7 + flatIndex;
      question = `${chords[chordIndex]} is which flat scale degree in ${root} ${scale}?`;
      answer = flatRomanNumerals[flatIndex];
    }

    questionKey = question + "|" + answer;
    attempts++;
  } while (
    state.usedQuestions.has(questionKey) &&
    attempts < 10 &&
    state.usedQuestions.size < questionTypes.length * 7
  );

  state.usedQuestions.add(questionKey);
  state.lastDegree = degree;
  state.lastQuestionType = questionType;

  // Susun kandidat pengecoh sesuai tipe soal.
  let potentialOptions = [];
  if (questionType === "chord-roman" || questionType === "chord-number") {
    // Pengecoh berupa chord. Level tersulit memakai seluruh 12 chord agar
    // lebih membingungkan; selain itu hanya 7 chord diatonik.
    potentialOptions = diff.hardDistractors ? chords.slice(0, 12) : chords.slice(0, 7);
  } else if (questionType === "roman-chord") {
    potentialOptions = [...numerals];
  } else if (questionType === "number-chord") {
    potentialOptions = ["1", "2", "3", "4", "5", "6", "7"];
  } else if (questionType === "flat-chord") {
    // Pengecoh chord flat; level tersulit boleh menambah chord diatonik.
    potentialOptions = diff.hardDistractors ? chords.slice(0, 12) : chords.slice(7, 12);
  } else if (questionType === "chord-flat") {
    potentialOptions = [...flatRomanNumerals];
  }

  // Buang jawaban benar dari kandidat agar tidak duplikat, lalu acak.
  potentialOptions = potentialOptions.filter((opt) => opt !== answer);
  shuffle(potentialOptions);

  // Gabung jawaban + pengecoh (dibatasi kandidat yang tersedia), lalu acak posisi.
  let options = [answer].concat(potentialOptions.slice(0, numDistractors));
  shuffle(options);

  return { question, options, answer };
}

/**
 * Hasilkan sekumpulan soal (`count` buah) untuk satu sesi quiz.
 * @param {string} root
 * @param {string} scale "major" | "minor"
 * @param {object} opts { notation, difficulty, count }
 * @returns {Array<{question:string, options:string[], answer:string}>}
 */
function generateQuestions(root, scale, opts = {}) {
  scale = normalizeScale(scale);
  const notation = normalizeNotation(opts.notation);
  const difficulty = normalizeDifficulty(opts.difficulty);
  const count = opts.count;
  const diff = DIFFICULTIES[difficulty];

  const chords = getChordArray(root, scale, notation);
  const numerals = getNumerals(scale);

  const state = {
    lastDegree: -1,
    lastQuestionType: "",
    usedQuestions: new Set(),
  };

  const questions = [];
  for (let i = 0; i < count; i++) {
    questions.push(buildSingleQuestion(root, scale, chords, numerals, state, diff));
  }
  return questions;
}

/** Poin per jawaban benar untuk sebuah level (server-authoritative). */
function getDifficultyPoints(difficulty) {
  return DIFFICULTIES[normalizeDifficulty(difficulty)].points;
}

/**
 * Hitung total poin dari urutan hasil jawaban (server-authoritative).
 * @param {boolean[]} results urutan benar/salah per soal (true = benar).
 * @param {string} difficulty level.
 * @returns {number} total poin termasuk bonus streak (poin dobel saat
 *                   streak benar beruntun > STREAK_BONUS_THRESHOLD).
 */
function computeStreakPoints(results, difficulty) {
  const weight = getDifficultyPoints(difficulty);
  let points = 0;
  let streak = 0;
  for (const ok of results) {
    if (ok) {
      streak += 1;
      points += weight; // poin dasar
      if (streak > STREAK_BONUS_THRESHOLD) points += weight; // bonus dobel
    } else {
      streak = 0;
    }
  }
  return points;
}

module.exports = {
  json,
  getChordFamily,
  generateQuestions,
  getDifficultyPoints,
  computeStreakPoints,
  normalizeDifficulty,
  streakBonusThreshold: STREAK_BONUS_THRESHOLD,
  rootOrder: chordData.rootOrder,
  difficulties: Object.keys(DIFFICULTIES),
};
