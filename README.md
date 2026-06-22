# 🎵 Family Chord

Quiz teori musik (chord family & scale degree) berbasis **HTML + CSS + Vanilla JS** di frontend, dengan **Netlify Functions** sebagai API serverless dan **Netlify Blobs** untuk leaderboard permanen.

---

## ✨ Fitur

- 6 jenis soal: chord ⇄ roman numeral, chord ⇄ number, flat chord ⇄ flat numeral
- **4 level kesulitan** dengan **bobot poin berbeda**: `easy` (1), `medium` (2), `hard` (3), `restu-wilayatul-faqih` 🔥 (5) — mengatur tipe soal, degree, jumlah pilihan, pengecoh, dan timer
- **Bonus streak**: begitu streak benar beruntun > 5, jawaban benar berikutnya dapat **poin dobel** 🔥
- **Faqih**: ⏱️ timer 5 detik/soal + fokus chord flat (♭/#) → poin terbesar
- **Alur dua langkah**: pilih jawaban (boleh ganti) → **Submit** baru reveal benar/salah & streak → **Next**
- **Pilihan notasi ♯ / ♭** — root note & chord dieja konsisten sesuai notasi (pitch-correct di kedua mode)
- Generator soal acak dengan anti-pengulangan (degree & tipe soal tidak berulang berturut-turut)
- Progress bar, **streak counter**, **akurasi**, dan **best streak** secara langsung
- **High score** tersimpan lokal (`localStorage`)
- **Leaderboard** otomatis dari API (rank + medali 🥇🥈🥉)
- Tema gelap modern, **mobile responsive**

---

## 📁 Struktur Project

```
/
├── index.html              # UI: setup, quiz, result, leaderboard
├── styles.css              # Tema gelap modern + responsif
├── program.js              # Frontend: fetch ke API, streak, akurasi, high score
├── netlify.toml            # Konfigurasi deploy Netlify
├── package.json            # Dependency @netlify/blobs
├── scripts/
│   └── generate-chords.js  # Generator data/chords.json (rumus interval + verifikasi)
├── data/
│   ├── chords.json         # Data chord ter-generate (notasi ♯/♭ × major/minor)
│   └── scores.json         # Data awal (seed) leaderboard
└── netlify/functions/
    ├── _shared.js          # Logika chord + generator soal (notasi & level)
    ├── _store.js           # Penyimpanan skor (Netlify Blobs, 1 key/skor + fallback /tmp)
    ├── getChords.js        # GET chord family
    ├── getQuestion.js      # GET soal acak
    ├── saveScore.js        # POST simpan skor
    └── leaderboard.js      # GET leaderboard terurut
```

> **Data chord** di-generate oleh [scripts/generate-chords.js](scripts/generate-chords.js)
> (`node scripts/generate-chords.js`), bukan ditulis tangan — menjamin ejaan
> konsisten dan pitch-correct. Edit generator, bukan `chords.json`.

> File di `netlify/functions/` yang diawali `_` (`_shared.js`, `_store.js`) **bukan** endpoint — hanya modul bersama yang di-`require` oleh function lain.

---

## 🚀 Menjalankan Secara Lokal

Karena project memakai serverless function, jalankan lewat **Netlify CLI** (bukan membuka `index.html` langsung).

```bash
# 1. Pasang Netlify CLI (sekali saja)
npm install -g netlify-cli

# 2. Pasang dependency project
npm install

# 3. Jalankan dev server (frontend + functions sekaligus)
npm run dev        # alias: netlify dev
```

Buka URL yang ditampilkan (biasanya `http://localhost:8888`).

---

## ☁️ Deploy ke Netlify

**Tanpa konfigurasi tambahan.** Pilih salah satu:

- **Drag & drop** — seret folder project ini ke dashboard Netlify, atau
- **Git** — connect repository; Netlify membaca [netlify.toml](netlify.toml), menjalankan `npm install`, dan men-deploy functions otomatis.

Netlify Blobs aktif secara default untuk situs yang memiliki Functions, jadi leaderboard langsung persisten.

---

## 🔌 Dokumentasi API

Base URL: `/.netlify/functions`

### `GET /getChords`

Mengembalikan chord family (map roman numeral → chord).

| Query | Default | Keterangan |
|-------|---------|------------|
| `root` | `C` | Root note sesuai notasi (`C`, `C#`/`Db`, … `B`) |
| `scale` | `major` | `major` atau `minor` |
| `notation` | `sharp` | `sharp` (♯) atau `flat` (♭) |

```
GET /.netlify/functions/getChords?root=C&scale=major&notation=sharp
```
```json
{
  "I": "C",
  "ii": "D minor",
  "iii": "E minor",
  "IV": "F",
  "V": "G",
  "vi": "A minor",
  "vii°": "B diminished"
}
```

### `GET /getQuestion`

Menghasilkan soal acak.

| Query | Default | Keterangan |
|-------|---------|------------|
| `root` | `C` | Root note sesuai notasi |
| `scale` | `major` | `major` / `minor` |
| `notation` | `sharp` | `sharp` (♯) / `flat` (♭) |
| `difficulty` | `medium` | `easy` / `medium` / `hard` / `restu-wilayatul-faqih` |
| `count` | `1` | Jumlah soal (1–50). Bila `> 1` mengembalikan array |

**Level kesulitan:**

| Level | Degree | Tipe soal | Pilihan | Pengecoh | Poin | Timer |
|-------|--------|-----------|---------|----------|------|-------|
| `easy` | I, IV, V | simbol → chord | 3 | diatonik | 1 | — |
| `medium` | semua | chord ⇄ angka/roman | 4 | diatonik | 2 | — |
| `hard` | semua | semua tipe (+ flat) | 4 | diatonik | 3 | — |
| `restu-wilayatul-faqih` 🔥 | ii, iii, vi, vii° | fokus flat (♭/#) | 5 | 12 chord | 5 | 5 dtk |

> Poin akhir = jumlah benar × bobot level, **dihitung ulang di server** (`saveScore`).

```
GET /.netlify/functions/getQuestion?root=C&scale=major&notation=sharp&difficulty=medium
```
```json
{
  "question": "What is the V chord in C major?",
  "options": ["G", "Am", "F"],
  "answer": "G"
}
```

> Frontend memanggil dengan `count=N` agar semua soal satu sesi dibuat sekaligus, menjaga logika anti-pengulangan antar soal.

### `POST /saveScore`

Menyimpan skor ke leaderboard. `score`, `percentage` & `points` dihitung ulang di server.

```
POST /.netlify/functions/saveScore
Content-Type: application/json
```
Kirim `results` (urutan benar/salah) agar server menghitung **bonus streak**:
```json
{ "name": "Player", "results": [true, true, false, true], "difficulty": "hard" }
```
Atau bentuk sederhana tanpa bonus streak:
```json
{ "name": "Player", "score": 18, "totalQuestions": 20, "difficulty": "hard" }
```
Respons:
```json
{
  "success": true,
  "entry": {
    "name": "Player", "score": 18, "totalQuestions": 20,
    "percentage": 90, "difficulty": "hard", "points": 54, "date": "..."
  },
  "rank": 2
}
```

### `GET /leaderboard`

Daftar skor terurut berdasarkan **poin** tertinggi (lalu persentase).

| Query | Default | Keterangan |
|-------|---------|------------|
| `limit` | `20` | Maksimum entri (1–100) |

```
GET /.netlify/functions/leaderboard
```
```json
[
  { "name": "Player1", "score": 19, "percentage": 95, "difficulty": "hard", "points": 57 },
  { "name": "Player2", "score": 10, "percentage": 50, "difficulty": "restu-wilayatul-faqih", "points": 50 }
]
```

---

## 💾 Catatan Penyimpanan

`_store.js` memakai **Netlify Blobs** sebagai penyimpanan permanen. Setiap skor
disimpan sebagai **satu key tersendiri** (`score:<timestamp>:<rand>`), bukan
satu array bersama — sehingga penulisan bersifat **atomik per-entri** dan dua
submission yang bersamaan tidak saling menimpa (bebas race condition).
Leaderboard dibentuk dengan `list()` + `get()` lalu diurutkan.

Bila Blobs tidak tersedia (mis. dijalankan via `node` polos di luar konteks
Netlify), penyimpanan otomatis **fallback ke `/tmp`** agar tetap berfungsi.
[data/scores.json](data/scores.json) selalu dipakai sebagai data awal (seed/demo).

---

## 🛠️ Teknologi

HTML · CSS · Vanilla JavaScript · Netlify Functions · Netlify Blobs · JSON
