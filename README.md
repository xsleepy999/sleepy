# Sleepy — Telegram AI Bot

Bot Telegram berbasis Python yang menggunakan API dari **[freemodel.dev](https://freemodel.dev)** (OpenAI-compatible). Dirancang untuk berjalan ringan di **Termux (Android)**.

## Fitur

- Chat AI dengan riwayat percakapan **per user** (default 10 pesan terakhir)
- Command `/start`, `/help`, `/reset`, `/whoami`
- Indikator "sedang mengetik…"
- Mode polling (tidak butuh server publik / webhook)
- Bisa dibatasi ke user ID tertentu (privat)
- Konfigurasi via file `.env`, kredensial tidak hardcoded

---

## Setup di Termux

### 1. Install Termux

Disarankan install dari [F-Droid](https://f-droid.org/packages/com.termux/) (bukan Play Store, karena versi Play Store sudah outdated).

### 2. Update package & install Python + Git

```bash
pkg update && pkg upgrade -y
pkg install python git -y
```

### 3. Clone repo

```bash
git clone https://github.com/xsleepy999/sleepy.git
cd sleepy
```

### 4. (Opsional) Buat virtual environment

```bash
python -m venv venv
source venv/bin/activate
```

### 5. Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

> Catatan: Kalau ada error saat install, jalankan `pkg install rust binutils -y` lalu ulangi `pip install`.

### 6. Konfigurasi `.env`

```bash
cp .env.example .env
nano .env
```

Isi minimal dua variabel ini:

| Variabel             | Cara dapat                                                               |
| -------------------- | ------------------------------------------------------------------------ |
| `TELEGRAM_TOKEN`     | Buat bot di Telegram: chat [@BotFather](https://t.me/BotFather) → `/newbot` |
| `FREEMODEL_API_KEY`  | Login di [freemodel.dev](https://freemodel.dev), ambil API key           |

Variabel lain (`API_BASE_URL`, `MODEL_NAME`) sudah punya nilai default. **Sesuaikan dengan dokumentasi resmi freemodel.dev** kalau berbeda.

Simpan & keluar dari `nano`: `Ctrl+O`, `Enter`, `Ctrl+X`.

### 7. Jalankan bot

```bash
python bot.py
```

Kalau berhasil, akan muncul log seperti:

```
[INFO] sleepy-bot - Bot starting... (model=gpt-3.5-turbo, base_url=https://api.freemodel.dev/v1)
```

Buka chat bot di Telegram, kirim `/start`. Selesai!

---

## Tips Termux

### Mencegah Termux dimatikan saat layar mati

```bash
termux-wake-lock
```

### Menjalankan bot di background (terus jalan walau Termux ditutup)

Gunakan `nohup`:

```bash
nohup python bot.py > bot.log 2>&1 &
```

Lihat log:

```bash
tail -f bot.log
```

Stop bot:

```bash
pkill -f "python bot.py"
```

Atau pakai `tmux` untuk session yang lebih rapi:

```bash
pkg install tmux -y
tmux new -s bot
python bot.py
# Detach: Ctrl+B lalu D
# Attach lagi: tmux attach -t bot
```

### Membuat bot privat (hanya kamu yang bisa pakai)

1. Jalankan bot dulu, kirim `/whoami` ke bot di Telegram.
2. Catat user ID yang muncul (angka panjang).
3. Edit `.env`, isi `ALLOWED_USER_IDS=123456789` (boleh lebih dari satu, dipisah koma).
4. Restart bot.

---

## Mengubah model atau provider

File `.env`:

```env
API_BASE_URL=https://api.freemodel.dev/v1
MODEL_NAME=gpt-3.5-turbo
```

Selama API tujuan **OpenAI-compatible** (endpoint `/chat/completions`), bot ini langsung bisa pakai. Cukup ganti `API_BASE_URL` dan `MODEL_NAME` saja.

---

## Troubleshooting

| Masalah                                          | Solusi                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `TELEGRAM_TOKEN belum diset di .env`             | Pastikan file `.env` ada di folder yang sama dengan `bot.py`           |
| Bot tidak balas pesan                            | Cek log di terminal. Pastikan token & API key benar                    |
| `Error API (401)` / `(403)`                      | API key salah atau tidak valid                                          |
| `Error API (404)`                                | `API_BASE_URL` atau `MODEL_NAME` salah, sesuaikan dengan docs freemodel |
| `pip install` error karena native compile        | `pkg install rust binutils libffi openssl -y` lalu coba lagi            |
| Bot mati saat HP idle                            | Jalankan `termux-wake-lock` sebelum start bot                           |

---

## Struktur File

```
sleepy/
├── bot.py            # Main bot (Telegram + AI integration)
├── requirements.txt  # Python dependencies
├── .env.example      # Template konfigurasi
├── .env              # File kredensial (JANGAN di-commit ke git)
├── .gitignore
└── README.md
```
