/**
 * program.js — Frontend Family Chord
 *
 * Semua data chord & pembuatan soal kini berada di API (Netlify Functions).
 * Frontend hanya: meminta soal, menampilkan UI, menghitung skor, menyimpan
 * skor, dan menampilkan leaderboard.
 */

"use strict";

/* =========================================================================
 * Konfigurasi & state
 * ========================================================================= */

const API_BASE = "/.netlify/functions";
const HIGH_SCORE_KEY = "familyChordHighScore";

// Bila streak benar beruntun MELEBIHI angka ini, jawaban benar berikutnya
// dapat poin dobel (harus selaras dengan STREAK_BONUS_THRESHOLD di _shared.js).
const STREAK_BONUS_THRESHOLD = 5;

// Label root note per notasi (hanya label tampilan; data chord ada di API).
// Indeks 0–11 selaras antar notasi (enharmonik), jadi pindah notasi tetap
// mempertahankan pilihan root pemain.
const ROOT_NOTES = {
  sharp: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
  flat: ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
};

// Metadata level untuk UI: poin per jawaban benar (bobot) & timer per soal
// (detik; 0 = tanpa batas). NOTE: poin final tetap dihitung ulang di server
// (saveScore) agar tidak bisa dicurangi — nilai di sini hanya untuk tampilan
// dan logika timer di klien. Harus selaras dengan DIFFICULTIES di _shared.js.
const DIFFICULTY_META = {
  easy: { points: 1, timer: 0 },
  medium: { points: 2, timer: 0 },
  hard: { points: 3, timer: 0 },
  "restu-wilayatul-faqih": { points: 5, timer: 5 },
};

// Penjelasan singkat tiap level untuk ditampilkan di setup.
const LEVEL_HINTS = {
  easy: "Easy — chord pokok (I, IV, V), tebak chord dari simbol. 3 pilihan · 1 poin/benar.",
  medium: "Medium — semua chord diatonik, dua arah (chord ⇄ angka/roman). 4 pilihan · 2 poin/benar.",
  hard: "Hard — semua tipe termasuk chord & derajat flat (♭). 4 pilihan · 3 poin/benar.",
  "restu-wilayatul-faqih":
    "Restu Wilayatul Faqih 🔥 — fokus chord flat (♭II–♭VII) & diminished, ⏱️ 5 detik/soal, 5 pilihan · 5 poin/benar. Paling susah!",
};

// State satu sesi quiz.
const state = {
  questions: [],
  userAnswers: [], // jawaban yang dipilih (bisa berubah sebelum submit)
  submitted: [], // apakah soal ke-i sudah di-submit (reveal & terkunci)
  currentQuestion: 0,
  playerName: "",
  scale: "major",
  root: "C",
  notation: "sharp",
  difficulty: "medium",
  timerId: null, // id interval timer (level Faqih)
};

/* =========================================================================
 * Util DOM & helper kecil
 * ========================================================================= */

/** Shortcut document.getElementById. */
const $ = (id) => document.getElementById(id);

/** Tampilkan / sembunyikan sebuah section by id. */
function show(id) {
  $(id).classList.remove("hidden");
}
function hide(id) {
  $(id).classList.add("hidden");
}

/** Escape teks agar aman dimasukkan ke innerHTML. */
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/** Ubah id level menjadi label tampilan yang rapi. */
function formatLevel(difficulty) {
  const labels = {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
    "restu-wilayatul-faqih": "Faqih 🔥",
  };
  return labels[difficulty] || difficulty || "—";
}

/* =========================================================================
 * Lapisan API (semua pakai async/await + error handling)
 * ========================================================================= */

/** Ambil sekumpulan soal dari API. */
async function fetchQuestions({ root, scale, notation, difficulty, count }) {
  const qs = new URLSearchParams({ root, scale, notation, difficulty, count });
  const url = `${API_BASE}/getQuestion?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Gagal memuat soal (HTTP ${res.status})`);
  }
  const data = await res.json();
  // Endpoint mengembalikan array bila count > 1, objek tunggal bila count = 1.
  return Array.isArray(data) ? data : [data];
}

/** Kirim skor ke leaderboard. */
async function postScore(payload) {
  const res = await fetch(`${API_BASE}/saveScore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Gagal menyimpan skor (HTTP ${res.status})`);
  }
  return res.json();
}

/** Ambil data leaderboard. */
async function fetchLeaderboard(limit = 20) {
  const res = await fetch(`${API_BASE}/leaderboard?limit=${limit}`);
  if (!res.ok) throw new Error(`Gagal memuat leaderboard (HTTP ${res.status})`);
  return res.json();
}

/* =========================================================================
 * High score (localStorage)
 * ========================================================================= */

function getHighScore() {
  // localStorage bisa melempar di mode privasi / iframe sandbox -> jangan crash.
  try {
    const val = parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10);
    return Number.isFinite(val) ? val : 0;
  } catch (err) {
    return 0;
  }
}

/** Simpan high score bila persentase baru lebih besar. Return true bila rekor baru. */
function updateHighScore(percentage) {
  if (percentage > getHighScore()) {
    try {
      localStorage.setItem(HIGH_SCORE_KEY, String(percentage));
    } catch (err) {
      /* storage tidak tersedia — abaikan, fitur high score bersifat opsional */
    }
    return true;
  }
  return false;
}

function renderHighScore() {
  $("setupHighScore").textContent = `${getHighScore()}%`;
}

/* =========================================================================
 * Statistik langsung (streak & akurasi)
 * ========================================================================= */

/**
 * Hitung statistik HANYA dari soal yang sudah di-submit (jawaban final).
 * Soal yang baru dipilih tapi belum disubmit tidak ikut dihitung — sehingga
 * benar/salah & streak baru ketahuan setelah menekan Submit.
 * - currentStreak: jumlah benar beruntun yang berakhir di submit terakhir.
 * - bestStreak: streak benar terpanjang sepanjang sesi.
 * - accuracy: persentase benar dari soal yang sudah disubmit.
 * - points: poin terkumpul (benar × bobot level).
 */
function computeStats() {
  const weight = DIFFICULTY_META[state.difficulty]?.points ?? 1;
  let answered = 0;
  let correct = 0;
  let running = 0;
  let best = 0;
  let current = 0;
  let points = 0;

  for (let i = 0; i < state.questions.length; i++) {
    if (!state.submitted[i]) {
      running = 0; // belum disubmit -> memutus streak
      continue;
    }
    answered++;
    if (state.userAnswers[i] === state.questions[i].answer) {
      correct++;
      running++;
      if (running > best) best = running;
      current = running;
      points += weight; // poin dasar
      if (running > STREAK_BONUS_THRESHOLD) points += weight; // bonus dobel saat streak panas
    } else {
      running = 0;
      current = 0;
    }
  }

  const accuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100);
  return { answered, correct, accuracy, currentStreak: current, bestStreak: best, points };
}

/** Perbarui tampilan progress bar + statistik langsung. */
function renderLiveStats() {
  const total = state.questions.length;
  const num = state.currentQuestion + 1;

  $("currentQuestionNum").textContent = num;
  $("totalQuestions").textContent = total;
  $("progressFill").style.width = `${(num / total) * 100}%`;

  const stats = computeStats();
  $("streakValue").textContent = stats.currentStreak;
  $("accuracyValue").textContent = `${stats.accuracy}%`;
  $("bestStreakValue").textContent = stats.bestStreak;
  $("pointsValue").textContent = stats.points;

  // Streak panas (> 5): tandai & beri label poin dobel.
  const hot = stats.currentStreak > STREAK_BONUS_THRESHOLD;
  $("streakStat").classList.toggle("hot", hot);
  $("streakStat").title = hot ? "Streak panas! Poin dobel 🔥" : "";
}

/* =========================================================================
 * Alur Quiz
 * ========================================================================= */

async function startQuiz() {
  const scale = $("scaleType").value;
  const root = $("rootNote").value;
  const notation = $("notation").value;
  const difficulty = $("difficulty").value;
  const numQuestions = parseInt($("questionCount").value, 10);
  const playerName = $("playerName").value.trim() || "Anonymous";

  if (!Number.isFinite(numQuestions) || numQuestions < 10 || numQuestions > 50) {
    alert("Pilih jumlah soal antara 10 dan 50.");
    return;
  }

  const startBtn = $("startBtn");
  startBtn.disabled = true;
  startBtn.textContent = "Memuat soal…";

  try {
    const questions = await fetchQuestions({
      root,
      scale,
      notation,
      difficulty,
      count: numQuestions,
    });

    // Reset state sesi.
    state.questions = questions;
    state.userAnswers = new Array(questions.length).fill(null);
    state.submitted = new Array(questions.length).fill(false);
    state.currentQuestion = 0;
    state.playerName = playerName;
    state.scale = scale;
    state.root = root;
    state.notation = notation;
    state.difficulty = difficulty;

    hide("setup");
    hide("result");
    show("quiz");
    showQuestion();
  } catch (err) {
    alert("Terjadi kesalahan: " + err.message);
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = "Mulai Quiz";
  }
}

/** Render soal saat ini beserta opsi jawabannya. */
function showQuestion() {
  const idx = state.currentQuestion;
  const q = state.questions[idx];
  $("question").textContent = q.question;

  const optionsDiv = $("options");
  optionsDiv.innerHTML = "";

  q.options.forEach((option) => {
    const btn = document.createElement("button");
    btn.textContent = option;
    btn.className = "option";
    // Tandai pilihan sementara (belum disubmit) bila ada.
    if (!state.submitted[idx] && state.userAnswers[idx] === option) {
      btn.classList.add("selected");
    }
    btn.addEventListener("click", () => selectAnswer(option));
    optionsDiv.appendChild(btn);
  });

  const isLast = idx === state.questions.length - 1;

  if (state.submitted[idx]) {
    // Sudah disubmit -> tampilkan benar/salah, sembunyikan Submit, munculkan Next/Finish.
    applyAnswerFeedback();
    hide("submitButton");
    $("nextButton").classList.toggle("hidden", isLast);
    $("finishButton").classList.toggle("hidden", !isLast);
    stopTimer();
  } else {
    // Belum disubmit -> hanya tombol Submit (aktif jika sudah ada pilihan).
    show("submitButton");
    hide("nextButton");
    hide("finishButton");
    $("submitButton").disabled = state.userAnswers[idx] == null;
    startTimerIfNeeded();
  }

  renderLiveStats();
}

/**
 * Tandai opsi: jawaban benar -> hijau, pilihan yang salah -> merah, lalu
 * kunci semua tombol agar jawaban tidak bisa diubah.
 */
function applyAnswerFeedback() {
  const idx = state.currentQuestion;
  const q = state.questions[idx];
  const chosen = state.userAnswers[idx];

  document.querySelectorAll("#options .option").forEach((btn) => {
    btn.disabled = true;
    btn.classList.remove("selected");
    if (btn.textContent === q.answer) {
      btn.classList.add("correct"); // selalu tunjukkan jawaban yang benar
    } else if (chosen != null && btn.textContent === chosen) {
      btn.classList.add("wrong"); // pilihan keliru pemain
    }
  });
}

/**
 * Pilih jawaban (boleh diganti-ganti selama BELUM disubmit). Tidak
 * mengungkap benar/salah maupun mengubah streak — itu terjadi saat Submit.
 */
function selectAnswer(selectedOption) {
  const idx = state.currentQuestion;
  if (state.submitted[idx]) return; // sudah dikunci

  state.userAnswers[idx] = selectedOption;

  // Sorot pilihan sementara saja (warna netral, bukan benar/salah).
  document.querySelectorAll("#options .option").forEach((btn) => {
    btn.classList.toggle("selected", btn.textContent === selectedOption);
  });

  $("submitButton").disabled = false;
}

/**
 * Submit jawaban soal saat ini: kunci, ungkap benar/salah, perbarui streak.
 * @param {boolean} auto true bila dipicu timer habis (boleh tanpa jawaban).
 */
function submitAnswer(auto = false) {
  const idx = state.currentQuestion;
  if (state.submitted[idx]) return;

  // Manual tanpa memilih -> minta pilih dulu. Timer habis -> dianggap salah.
  if (state.userAnswers[idx] == null && !auto) {
    alert("Pilih jawaban dulu sebelum submit.");
    return;
  }

  stopTimer();
  state.submitted[idx] = true;
  showQuestion(); // render ulang ke keadaan reveal + tombol Next/Finish
}

function nextQuestion() {
  if (!state.submitted[state.currentQuestion]) return; // tombol hanya muncul setelah submit
  state.currentQuestion++;
  showQuestion();
}

async function finishQuiz() {
  if (!state.submitted[state.currentQuestion]) return;
  stopTimer();

  // Susun urutan benar/salah (untuk skor & bonus streak di server).
  const results = [];
  let score = 0;
  for (let i = 0; i < state.questions.length; i++) {
    const ok = state.submitted[i] && state.userAnswers[i] === state.questions[i].answer;
    results.push(ok);
    if (ok) score++;
  }

  const total = state.questions.length;
  const percentage = Math.round((score / total) * 100);
  const stats = computeStats(); // points sudah termasuk bonus streak
  const points = stats.points;
  const isNewRecord = updateHighScore(percentage);

  hide("quiz");
  renderResult({ score, total, percentage, points, stats, isNewRecord });
  show("result");

  // Kirim skor ke leaderboard (best-effort, tidak memblok tampilan hasil).
  try {
    await postScore({
      name: state.playerName,
      results, // server menghitung skor & poin (+ bonus streak) dari sini
      difficulty: state.difficulty,
    });
    await loadLeaderboard();
  } catch (err) {
    const note = $("saveStatus");
    if (note) note.textContent = "⚠️ Gagal menyimpan ke leaderboard: " + err.message;
  }
}

/* =========================================================================
 * Timer (khusus level Faqih)
 * ========================================================================= */

/** Hentikan & sembunyikan timer. */
function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  hide("timer");
}

/** Jalankan hitung mundur per soal bila level punya timer (> 0 detik). */
function startTimerIfNeeded() {
  stopTimer();
  const seconds = DIFFICULTY_META[state.difficulty]?.timer || 0;
  if (seconds <= 0) return;

  let remaining = seconds;
  $("timerValue").textContent = remaining;
  show("timer");
  $("timer").classList.remove("urgent");

  state.timerId = setInterval(() => {
    remaining -= 1;
    $("timerValue").textContent = Math.max(remaining, 0);
    if (remaining <= 2) $("timer").classList.add("urgent");
    if (remaining <= 0) {
      // Waktu habis -> submit otomatis (jawaban apa adanya / kosong = salah).
      submitAnswer(true);
    }
  }, 1000);
}

/** Render halaman hasil + tabel jawaban. */
function renderResult({ score, total, percentage, points, stats, isNewRecord }) {
  let rows = "";
  for (let i = 0; i < state.questions.length; i++) {
    const q = state.questions[i];
    const userAns = state.userAnswers[i];
    const isCorrect = userAns === q.answer;
    rows += `
      <tr>
        <td>${i + 1}</td>
        <td class="cell-q">${escapeHTML(q.question)}</td>
        <td>${escapeHTML(userAns || "Tidak dijawab")}</td>
        <td>${escapeHTML(q.answer)}</td>
        <td class="${isCorrect ? "ok" : "no"}">${isCorrect ? "Benar" : "Salah"}</td>
      </tr>`;
  }

  $("result").innerHTML = `
    <h2>Hasil Quiz</h2>
    ${isNewRecord ? '<p class="record">🎉 High score baru!</p>' : ""}
    <div class="score-grid">
      <div class="score-box highlight"><span>Poin</span><strong>💎 ${points}</strong></div>
      <div class="score-box"><span>Benar</span><strong>${score}/${total}</strong></div>
      <div class="score-box"><span>Persentase</span><strong>${percentage}%</strong></div>
      <div class="score-box"><span>Best Streak</span><strong>${stats.bestStreak}</strong></div>
    </div>
    <p class="muted level-tag">Level: <strong>${escapeHTML(formatLevel(state.difficulty))}</strong> · ${
    DIFFICULTY_META[state.difficulty]?.points ?? 1
  } poin per jawaban benar</p>
    <p id="saveStatus" class="muted">Disimpan sebagai <strong>${escapeHTML(
      state.playerName
    )}</strong>.</p>
    <div class="table-scroll">
      <table class="results-table">
        <thead>
          <tr>
            <th>#</th><th>Soal</th><th>Jawabanmu</th><th>Jawaban Benar</th><th>Hasil</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <button id="playAgainBtn" class="btn btn-primary">Main Lagi</button>
  `;

  $("playAgainBtn").addEventListener("click", resetToSetup);
}

/** Kembali ke layar setup tanpa reload halaman. */
function resetToSetup() {
  stopTimer();
  hide("result");
  hide("quiz");
  show("setup");
  renderHighScore();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* =========================================================================
 * Leaderboard
 * ========================================================================= */

async function loadLeaderboard() {
  const body = $("leaderboardBody");
  body.innerHTML = '<p class="muted">Memuat leaderboard…</p>';

  try {
    const data = await fetchLeaderboard(20);

    if (!Array.isArray(data) || data.length === 0) {
      body.innerHTML = '<p class="muted">Belum ada skor. Jadilah yang pertama! 🎶</p>';
      return;
    }

    let rows = "";
    data.forEach((entry, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1;
      // Poin: fallback ke score untuk entri lama tanpa field points.
      const points = typeof entry.points === "number" ? entry.points : entry.score;
      rows += `
        <tr>
          <td class="rank">${medal}</td>
          <td>${escapeHTML(entry.name)}</td>
          <td><span class="level-badge">${escapeHTML(formatLevel(entry.difficulty))}</span></td>
          <td class="pts">💎 ${escapeHTML(points)}</td>
          <td>${escapeHTML(entry.percentage)}%</td>
        </tr>`;
    });

    body.innerHTML = `
      <div class="table-scroll">
        <table class="leaderboard-table">
          <thead>
            <tr><th>Rank</th><th>Nama</th><th>Level</th><th>Poin</th><th>%</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (err) {
    body.innerHTML = `<p class="muted">⚠️ Tidak bisa memuat leaderboard: ${escapeHTML(
      err.message
    )}</p>`;
  }
}

/* =========================================================================
 * Inisialisasi
 * ========================================================================= */

/**
 * Isi dropdown root note sesuai notasi terpilih, mempertahankan indeks
 * (pilihan enharmonik) saat pemain berganti ♯/♭.
 */
function populateRootNotes() {
  const select = $("rootNote");
  const prevIndex = select.selectedIndex >= 0 ? select.selectedIndex : 0;
  const notes = ROOT_NOTES[$("notation").value] || ROOT_NOTES.sharp;

  select.innerHTML = "";
  notes.forEach((note) => {
    const opt = document.createElement("option");
    opt.value = note;
    opt.textContent = note;
    select.appendChild(opt);
  });
  select.selectedIndex = prevIndex;
}

/** Tampilkan deskripsi singkat level yang dipilih + info bonus streak. */
function renderLevelHint() {
  const base = LEVEL_HINTS[$("difficulty").value] || "";
  $("levelHint").textContent = `${base}  🔥 Bonus: streak > ${STREAK_BONUS_THRESHOLD} → poin dobel!`;
}

function init() {
  $("startBtn").addEventListener("click", startQuiz);
  $("submitButton").addEventListener("click", () => submitAnswer(false));
  $("nextButton").addEventListener("click", nextQuestion);
  $("finishButton").addEventListener("click", finishQuiz);
  $("refreshLeaderboard").addEventListener("click", loadLeaderboard);
  $("notation").addEventListener("change", populateRootNotes);
  $("difficulty").addEventListener("change", renderLevelHint);

  populateRootNotes();
  renderLevelHint();
  renderHighScore();
  loadLeaderboard();
}

document.addEventListener("DOMContentLoaded", init);
