/**
 * scripts/generate-chords.js
 *
 * Build helper: menghasilkan data/chords.json secara terprogram dari rumus
 * interval + tabel ejaan nada. Ini menghilangkan inkonsistensi ejaan yang
 * dulu ada (mis. root "D#" yang menampilkan chord ber-ejaan "Eb") karena
 * setiap chord kini dieja KONSISTEN sesuai notasi terpilih (♯ atau ♭) dan
 * tetap PITCH-CORRECT (kelas nada identik antar notasi).
 *
 * Jalankan: node scripts/generate-chords.js
 */

const fs = require("fs");
const path = require("path");

// Tabel ejaan nada untuk tiap kelas nada (pitch class) 0..11.
const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Interval (semitone) tiap derajat + kualitas chord-nya.
const MAJOR = {
  intervals: [0, 2, 4, 5, 7, 9, 11],
  qualities: ["", " minor", " minor", "", "", " minor", " diminished"],
  // Chord "flat" (♭II, ♭III, ♭V, ♭VI, ♭VII) — semua kualitas major.
  flatOffsets: [1, 3, 6, 8, 10],
};
const MINOR = {
  intervals: [0, 2, 3, 5, 7, 8, 10],
  qualities: [" minor", " diminished", "", " minor", " minor", "", ""],
  flatOffsets: [1, 4, 6, 9, 11],
};

/** Susun array 12 chord (7 diatonik + 5 flat) untuk satu root + scale. */
function buildFamily(rootPc, scaleDef, names) {
  const chords = [];
  // 7 chord diatonik
  for (let i = 0; i < scaleDef.intervals.length; i++) {
    const pc = (rootPc + scaleDef.intervals[i]) % 12;
    chords.push(names[pc] + scaleDef.qualities[i]);
  }
  // 5 chord flat (selalu major)
  for (const off of scaleDef.flatOffsets) {
    const pc = (rootPc + off) % 12;
    chords.push(names[pc]);
  }
  return chords;
}

/** Bangun seluruh data untuk satu notasi (sharp / flat). */
function buildNotation(names) {
  const major = {};
  const minor = {};
  for (let pc = 0; pc < 12; pc++) {
    const key = names[pc];
    major[key] = buildFamily(pc, MAJOR, names);
    minor[key] = buildFamily(pc, MINOR, names);
  }
  return { major, minor };
}

const output = {
  rootOrder: {
    sharp: SHARP.slice(),
    flat: FLAT.slice(),
  },
  numerals: {
    major: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
    minor: ["i", "ii°", "III", "iv", "v", "VI", "VII"],
  },
  flatNumerals: ["♭II", "♭III", "♭V", "♭VI", "♭VII"],
  scaleDegrees: ["1", "2", "3", "4", "5", "6", "7"],
  data: {
    sharp: buildNotation(SHARP),
    flat: buildNotation(FLAT),
  },
};

const outPath = path.join(__dirname, "..", "data", "chords.json");
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
console.log("✓ data/chords.json ditulis.");

/* ----- Verifikasi: pitch class sharp == flat untuk tiap root & scale ----- */
const NOTE_PC = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};
function chordPc(name) {
  const note = name.replace(/ (minor|diminished)$/, "");
  return NOTE_PC[note];
}
let mismatches = 0;
for (const scale of ["major", "minor"]) {
  for (let pc = 0; pc < 12; pc++) {
    const s = output.data.sharp[scale][SHARP[pc]].map(chordPc).join(",");
    const f = output.data.flat[scale][FLAT[pc]].map(chordPc).join(",");
    if (s !== f) {
      mismatches++;
      console.error(`✗ mismatch ${scale} pc=${pc}: ${s} != ${f}`);
    }
  }
}
console.log(mismatches === 0 ? "✓ Verifikasi pitch-class lolos." : `✗ ${mismatches} mismatch!`);
