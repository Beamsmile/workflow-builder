#!/bin/bash
# ดับเบิลคลิกไฟล์นี้เพื่อเปิด Workflow Builder
# (จะเปิด Terminal + เบราว์เซอร์ให้เอง — ปิดหน้าต่าง Terminal นี้เพื่อหยุดโปรแกรม)

cd "$(dirname "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "───────────────────────────────"
echo "  Workflow Builder"
echo "  กำลังเริ่ม... เบราว์เซอร์จะเปิดเอง"
echo "  ปิดหน้าต่างนี้ = หยุดโปรแกรม"
echo "───────────────────────────────"
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "หา npm ไม่เจอ — ต้องติดตั้ง Node.js ก่อน (https://nodejs.org)"
  echo "กด Enter เพื่อปิด"
  read -r
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "ติดตั้งไลบรารีครั้งแรก (รอสักครู่)..."
  npm install || { echo "ติดตั้งไม่สำเร็จ"; read -r; exit 1; }
fi

exec npm run dev
