/**
 * _shared.js
 * Modul bersama untuk seluruh Netlify Functions.
 *
 * File diawali underscore ("_") sehingga Netlify TIDAK memperlakukannya
 * sebagai sebuah function/endpoint, tetapi tetap bisa di-require oleh
 * function lain. Semua data chord dibaca dari data/chords.json (tidak lagi
 * hardcoded di frontend).
 */

// Data chord di-bundle dari file JSON (sumber kebenaran tunggal).
const chordData = require("../../data/chords.json");

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

/**
 * Ambil array 12 chord (7 diatonik + 5 chord flat) untuk root + scale tertentu.
 * Melempar error bila root/scale tidak dikenal.
 */
function getChordArray(root, scale) {
  const scaleObj = chordData.scales[scale];
  if (!scaleObj) {
    throw new Error(`Scale tidak dikenal: "${scale}" (gunakan major / minor)`);
  }
  const chords = scaleObj[root];
  if (!chords) {
    throw new Error(`Root note tidak dikenal: "${root}"`);
  }
  return chords;
}

/** Angka roman numeral sesuai scale (major / minor). */
function getNumerals(scale) {
  const numerals = chordData.numerals[scale];
  if (!numerals) {
    throw new Error(`Scale tidak dikenal: "${scale}"`);
  }
  return numerals;
}

/**
 * Bentuk "chord family": map roman numeral -> nama chord (7 chord diatonik).
 * Dipakai oleh endpoint getChords.
 *
 * Contoh hasil (C major):
 *   { "I": "C", "ii": "D minor", ..., "vii°": "B diminished" }
 */
function getChordFamily(root, scale) {
  const chords = getChordArray(root, scale);
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
 * Hasilkan SATU soal acak. Mengembalikan objek:
 *   { question, options, answer }
 *
 * `state` menyimpan degree & tipe soal terakhir agar tidak berulang
 * berturut-turut (logika ini dipertahankan persis dari program.js asli).
 */
function buildSingleQuestion(root, scale, chords, numerals, state) {
  const flatRomanNumerals = chordData.flatNumerals;

  // Daftar tipe soal yang tersedia (sama dengan versi asli).
  const questionTypes = [
    "chord-roman", // Tanya chord diberikan roman numeral
    "roman-chord", // Tanya roman numeral diberikan chord
    "chord-number", // Tanya chord diberikan angka
    "number-chord", // Tanya angka diberikan chord
    "flat-chord", // Tanya chord diberikan notasi flat
    "chord-flat", // Tanya notasi flat diberikan chord
  ];

  let degree, questionType, question, answer, questionKey;
  let attempts = 0;

  // Cari kombinasi soal yang belum dipakai (anti-duplikasi).
  do {
    // Hindari degree yang sama dua kali berturut-turut.
    do {
      degree = Math.floor(Math.random() * 7);
    } while (degree === state.lastDegree && attempts < 5);

    // Hindari tipe soal yang sama dua kali berturut-turut.
    do {
      questionType = questionTypes[Math.floor(Math.random() * questionTypes.length)];
    } while (questionType === state.lastQuestionType && attempts < 5);

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

  // Susun opsi pilihan sesuai tipe soal.
  let potentialOptions = [];
  if (questionType === "chord-roman" || questionType === "chord-number") {
    potentialOptions = chords.slice(0, 7); // hanya chord diatonik
  } else if (questionType === "roman-chord") {
    potentialOptions = [...numerals];
  } else if (questionType === "number-chord") {
    potentialOptions = ["1", "2", "3", "4", "5", "6", "7"];
  } else if (questionType === "flat-chord") {
    potentialOptions = chords.slice(7, 12); // hanya chord flat
  } else if (questionType === "chord-flat") {
    potentialOptions = [...flatRomanNumerals];
  }

  // Buang jawaban benar dari kandidat agar tidak duplikat.
  potentialOptions = potentialOptions.filter((opt) => opt !== answer);

  // Ambil 2 pengecoh acak, lalu gabung & acak posisi.
  shuffle(potentialOptions);
  let options = [answer].concat(potentialOptions.slice(0, 2));
  shuffle(options);

  return { question, options, answer };
}

/**
 * Hasilkan sekumpulan soal (`count` buah) untuk satu sesi quiz.
 * Mempertahankan logika anti-pengulangan antar soal seperti versi asli.
 * @returns {Array<{question:string, options:string[], answer:string}>}
 */
function generateQuestions(root, scale, count) {
  const chords = getChordArray(root, scale);
  const numerals = getNumerals(scale);

  const state = {
    lastDegree: -1,
    lastQuestionType: "",
    usedQuestions: new Set(),
  };

  const questions = [];
  for (let i = 0; i < count; i++) {
    questions.push(buildSingleQuestion(root, scale, chords, numerals, state));
  }
  return questions;
}

module.exports = {
  json,
  getChordFamily,
  generateQuestions,
  rootOrder: chordData.rootOrder,
};
