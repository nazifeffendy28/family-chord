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

// State satu sesi quiz.
const state = {
  questions: [],
  userAnswers: [],
  currentQuestion: 0,
  playerName: "",
  scale: "major",
  root: "C",
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

/* =========================================================================
 * Lapisan API (semua pakai async/await + error handling)
 * ========================================================================= */

/** Ambil sekumpulan soal dari API. */
async function fetchQuestions(root, scale, count) {
  const url = `${API_BASE}/getQuestion?root=${encodeURIComponent(root)}&scale=${encodeURIComponent(
    scale
  )}&count=${count}`;
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
  const raw = localStorage.getItem(HIGH_SCORE_KEY);
  const val = parseInt(raw, 10);
  return Number.isFinite(val) ? val : 0;
}

/** Simpan high score bila persentase baru lebih besar. Return true bila rekor baru. */
function updateHighScore(percentage) {
  if (percentage > getHighScore()) {
    localStorage.setItem(HIGH_SCORE_KEY, String(percentage));
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
 * Hitung statistik dari jawaban yang sudah diisi.
 * - currentStreak: jumlah benar beruntun yang berakhir di jawaban terakhir.
 * - bestStreak: streak benar terpanjang sepanjang sesi.
 * - accuracy: persentase benar dari soal yang sudah dijawab.
 */
function computeStats() {
  let answered = 0;
  let correct = 0;
  let running = 0;
  let best = 0;
  let current = 0;

  for (let i = 0; i < state.questions.length; i++) {
    const ans = state.userAnswers[i];
    if (ans == null) {
      running = 0; // soal belum dijawab memutus streak
      continue;
    }
    answered++;
    if (ans === state.questions[i].answer) {
      correct++;
      running++;
      if (running > best) best = running;
      current = running;
    } else {
      running = 0;
      current = 0;
    }
  }

  const accuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100);
  return { answered, correct, accuracy, currentStreak: current, bestStreak: best };
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
}

/* =========================================================================
 * Alur Quiz
 * ========================================================================= */

async function startQuiz() {
  const scale = $("scaleType").value;
  const root = $("rootNote").value;
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
    const questions = await fetchQuestions(root, scale, numQuestions);

    // Reset state sesi.
    state.questions = questions;
    state.userAnswers = new Array(questions.length).fill(null);
    state.currentQuestion = 0;
    state.playerName = playerName;
    state.scale = scale;
    state.root = root;

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
  const q = state.questions[state.currentQuestion];
  $("question").textContent = q.question;

  const optionsDiv = $("options");
  optionsDiv.innerHTML = "";

  q.options.forEach((option) => {
    const btn = document.createElement("button");
    btn.textContent = option;
    btn.className = "option";
    if (state.userAnswers[state.currentQuestion] === option) {
      btn.classList.add("selected");
    }
    btn.addEventListener("click", () => selectAnswer(option));
    optionsDiv.appendChild(btn);
  });

  // Tombol Next vs Finish tergantung posisi soal.
  const isLast = state.currentQuestion === state.questions.length - 1;
  $("nextButton").classList.toggle("hidden", isLast);
  $("finishButton").classList.toggle("hidden", !isLast);

  renderLiveStats();
}

/** Simpan jawaban terpilih lalu perbarui tampilan. */
function selectAnswer(selectedOption) {
  state.userAnswers[state.currentQuestion] = selectedOption;

  document.querySelectorAll(".option").forEach((opt) => {
    opt.classList.toggle("selected", opt.textContent === selectedOption);
  });

  renderLiveStats();
}

function nextQuestion() {
  if (!state.userAnswers[state.currentQuestion]) {
    alert("Pilih jawaban dulu sebelum lanjut.");
    return;
  }
  state.currentQuestion++;
  showQuestion();
}

async function finishQuiz() {
  if (!state.userAnswers[state.currentQuestion]) {
    alert("Pilih jawaban untuk soal ini dulu.");
    return;
  }
  if (state.userAnswers.includes(null)) {
    if (!confirm("Masih ada soal yang belum dijawab. Yakin ingin menyelesaikan?")) {
      return;
    }
  }

  // Hitung skor akhir (logika sama persis dengan versi asli).
  let score = 0;
  for (let i = 0; i < state.questions.length; i++) {
    if (state.userAnswers[i] === state.questions[i].answer) score++;
  }

  const total = state.questions.length;
  const percentage = Math.round((score / total) * 100);
  const stats = computeStats();
  const isNewRecord = updateHighScore(percentage);

  hide("quiz");
  renderResult({ score, total, percentage, stats, isNewRecord });
  show("result");

  // Kirim skor ke leaderboard (best-effort, tidak memblok tampilan hasil).
  try {
    await postScore({
      name: state.playerName,
      score,
      totalQuestions: total,
      percentage,
    });
    await loadLeaderboard();
  } catch (err) {
    const note = $("saveStatus");
    if (note) note.textContent = "⚠️ Gagal menyimpan ke leaderboard: " + err.message;
  }
}

/** Render halaman hasil + tabel jawaban. */
function renderResult({ score, total, percentage, stats, isNewRecord }) {
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
      <div class="score-box"><span>Skor</span><strong>${score}/${total}</strong></div>
      <div class="score-box"><span>Persentase</span><strong>${percentage}%</strong></div>
      <div class="score-box"><span>Akurasi</span><strong>${stats.accuracy}%</strong></div>
      <div class="score-box"><span>Best Streak</span><strong>${stats.bestStreak}</strong></div>
    </div>
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
      rows += `
        <tr>
          <td class="rank">${medal}</td>
          <td>${escapeHTML(entry.name)}</td>
          <td>${escapeHTML(entry.score)}</td>
          <td>${escapeHTML(entry.percentage)}%</td>
        </tr>`;
    });

    body.innerHTML = `
      <div class="table-scroll">
        <table class="leaderboard-table">
          <thead>
            <tr><th>Rank</th><th>Nama</th><th>Score</th><th>Persentase</th></tr>
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

function init() {
  $("startBtn").addEventListener("click", startQuiz);
  $("nextButton").addEventListener("click", nextQuestion);
  $("finishButton").addEventListener("click", finishQuiz);
  $("refreshLeaderboard").addEventListener("click", loadLeaderboard);

  renderHighScore();
  loadLeaderboard();
}

document.addEventListener("DOMContentLoaded", init);
