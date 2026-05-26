"""
Telegram AI Bot - powered by freemodel.dev (OpenAI-compatible API).

Cara pakai:
    1. Salin .env.example ke .env, isi TELEGRAM_TOKEN dan FREEMODEL_API_KEY
    2. Install dependencies: pip install -r requirements.txt
    3. Jalankan: python bot.py
"""

import logging
import os
from collections import defaultdict, deque

import httpx
from dotenv import load_dotenv
from telegram import Update
from telegram.constants import ChatAction
from telegram.error import Conflict, NetworkError
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

# ---------------------------------------------------------------------------
# Konfigurasi (dibaca dari .env)
# ---------------------------------------------------------------------------
load_dotenv()

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
API_KEY = os.getenv("FREEMODEL_API_KEY")
API_BASE_URL = os.getenv("API_BASE_URL", "https://api.freemodel.dev/v1").rstrip("/")
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-3.5-turbo")
SYSTEM_PROMPT = os.getenv(
    "SYSTEM_PROMPT",
    "Kamu adalah asisten AI yang ramah, membantu, dan menjawab dengan jelas.",
)
MAX_HISTORY = int(os.getenv("MAX_HISTORY", "10"))  # jumlah pasangan user/assistant
REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "60"))

# Optional: batasi akses ke user tertentu (Telegram user ID, dipisah koma).
# Kosongkan kalau bot boleh diakses semua orang.
ALLOWED_USERS = {
    int(uid.strip())
    for uid in os.getenv("ALLOWED_USER_IDS", "").split(",")
    if uid.strip().isdigit()
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    level=logging.INFO,
)
# python-telegram-bot punya log HTTPX yang berisik, kecilkan saja
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("sleepy-bot")

# ---------------------------------------------------------------------------
# Penyimpanan riwayat percakapan per user (di memori, hilang saat bot restart)
# ---------------------------------------------------------------------------
conversations: dict[int, deque] = defaultdict(
    lambda: deque(maxlen=MAX_HISTORY * 2)  # kali 2 karena user + assistant
)


# ---------------------------------------------------------------------------
# Pemanggil API freemodel.dev (format OpenAI Chat Completions)
# ---------------------------------------------------------------------------
async def call_ai(messages: list[dict]) -> str:
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.post(
            f"{API_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    # Format OpenAI-compatible: choices[0].message.content
    return data["choices"][0]["message"]["content"].strip()


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------
def _is_allowed(user_id: int) -> bool:
    return not ALLOWED_USERS or user_id in ALLOWED_USERS


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    await update.message.reply_text(
        f"Halo {user.first_name}! 👋\n\n"
        "Saya AI bot yang siap menemani ngobrol. Cukup ketik pesan apa saja.\n\n"
        "Perintah yang tersedia:\n"
        "/start  - Tampilkan pesan ini\n"
        "/help   - Bantuan singkat\n"
        "/reset  - Hapus riwayat percakapan\n"
        "/whoami - Lihat user ID kamu"
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "*Cara pakai*\n"
        "• Kirim pesan biasa, AI akan menjawab.\n"
        f"• Bot mengingat {MAX_HISTORY} pesan terakhir per user.\n"
        "• Ketik /reset untuk memulai obrolan baru.\n\n"
        f"Model aktif: `{MODEL_NAME}`",
        parse_mode="Markdown",
    )


async def reset(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    conversations[user_id].clear()
    await update.message.reply_text("✅ Riwayat percakapan dihapus. Mulai obrolan baru!")


async def whoami(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    u = update.effective_user
    await update.message.reply_text(
        f"User ID kamu: `{u.id}`\nUsername: @{u.username or '-'}",
        parse_mode="Markdown",
    )


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Tangkap error yang tidak ter-handle agar log tetap rapi."""
    err = context.error

    # Konflik = ada instance bot lain yang juga polling pakai token yang sama.
    # Tidak ada gunanya retry terus, lebih baik beri pesan jelas dan stop.
    if isinstance(err, Conflict):
        logger.error(
            "TELEGRAM CONFLICT: ada instance bot lain yang berjalan dengan token "
            "yang sama. Matikan instance lain dulu, atau revoke token di @BotFather. "
            "Bot akan berhenti."
        )
        # Stop bot dengan rapi
        if context.application.running:
            context.application.stop_running()
        return

    if isinstance(err, NetworkError):
        logger.warning("Network error: %s", err)
        return

    logger.exception("Unhandled error", exc_info=err)


async def chat(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if not _is_allowed(user.id):
        await update.message.reply_text(
            "🚫 Maaf, kamu tidak punya akses ke bot ini."
        )
        logger.info("Akses ditolak untuk user_id=%s", user.id)
        return

    user_text = update.message.text or ""
    if not user_text.strip():
        return

    # Indikator "sedang mengetik..."
    await context.bot.send_chat_action(
        chat_id=update.effective_chat.id, action=ChatAction.TYPING
    )

    history = conversations[user.id]
    history.append({"role": "user", "content": user_text})

    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + list(history)

    try:
        reply = await call_ai(messages)
    except httpx.HTTPStatusError as e:
        logger.error("API HTTP %s: %s", e.response.status_code, e.response.text[:500])
        # Buang pesan user terakhir agar bisa dicoba lagi tanpa duplikasi
        if history and history[-1]["role"] == "user":
            history.pop()
        await update.message.reply_text(
            f"❌ Error API ({e.response.status_code}). "
            "Cek API key / nama model di .env, lalu coba lagi."
        )
        return
    except httpx.RequestError as e:
        logger.error("Network error: %s", e)
        if history and history[-1]["role"] == "user":
            history.pop()
        await update.message.reply_text(
            "❌ Gagal terhubung ke server AI. Cek koneksi internet kamu."
        )
        return
    except Exception as e:  # noqa: BLE001
        logger.exception("Unexpected error")
        if history and history[-1]["role"] == "user":
            history.pop()
        await update.message.reply_text(f"❌ Terjadi kesalahan: {e}")
        return

    history.append({"role": "assistant", "content": reply})

    # Telegram batas 4096 karakter per pesan, potong jika perlu
    if len(reply) <= 4000:
        await update.message.reply_text(reply)
    else:
        for i in range(0, len(reply), 4000):
            await update.message.reply_text(reply[i : i + 4000])


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    if not TELEGRAM_TOKEN:
        raise SystemExit("ERROR: TELEGRAM_TOKEN belum diset di .env")
    if not API_KEY:
        raise SystemExit("ERROR: FREEMODEL_API_KEY belum diset di .env")

    app = Application.builder().token(TELEGRAM_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("reset", reset))
    app.add_handler(CommandHandler("whoami", whoami))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, chat))
    app.add_error_handler(error_handler)

    logger.info("Bot starting... (model=%s, base_url=%s)", MODEL_NAME, API_BASE_URL)
    # drop_pending_updates=True -> abaikan pesan lama yang menumpuk saat bot offline,
    # mengurangi risiko konflik & response salah saat startup.
    app.run_polling(
        allowed_updates=Update.ALL_TYPES,
        drop_pending_updates=True,
    )


if __name__ == "__main__":
    main()
