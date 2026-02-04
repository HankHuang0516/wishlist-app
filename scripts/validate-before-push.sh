#!/bin/bash
# Wishlist-App Pre-push Validation Script
# 確保在 git push 前通過所有品質檢查

set -e # 遇錯即停

echo "🔍 [1/4] 正在檢查環境變數..."
if [ ! -f "server/.env" ] && [ ! -f ".env" ]; then
    echo "⚠️ 警告: 找不到 .env 檔案，測試可能失敗。"
fi

echo "📦 [2/4] 正在執行 Prisma Generate..."
cd server && npx prisma generate && cd ..

echo "🛡️ [3/4] 正在執行 TypeScript 類型檢查 (server)..."
cd server && npx -p typescript tsc --noEmit && cd ..

echo "🧪 [4/4] 正在執行測試用例..."
npm test -- --run

echo "✅ 所有檢查通過！可以放心 git push。"
