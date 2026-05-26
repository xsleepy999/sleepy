#!/data/data/com.termux/files/usr/bin/bash
# Start Telegram bot di Termux dengan wake lock & auto-restart sederhana.
# Pakai: bash start-bot.sh

set -e

cd "$(dirname "$0")"

# 1. Pastikan tidak ada instance lama
pkill -9 -f "python bot.py" 2>/dev/null || true
sleep 2

# 2. Aktifkan wake lock supaya Android tidak menidurkan Termux
termux-wake-lock 2>/dev/null || true

# 3. Auto-restart loop: kalau bot crash (kecuali Conflict), start lagi setelah 5 detik
while true; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting bot..."
    python bot.py
    EXIT_CODE=$?
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bot exited with code $EXIT_CODE"

    # Kalau exit normal (Ctrl+C / SystemExit dari kita), berhenti.
    if [ $EXIT_CODE -eq 0 ] || [ $EXIT_CODE -eq 130 ]; then
        echo "Bot stopped cleanly. Exiting wrapper."
        break
    fi

    echo "Bot crashed, restart dalam 5 detik..."
    sleep 5
done

# 4. Lepas wake lock saat keluar
termux-wake-unlock 2>/dev/null || true
