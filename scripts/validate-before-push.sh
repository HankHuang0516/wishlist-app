#!/bin/bash
# Wishlist-App Pre-push Validation Script
# 確保在 git push 前通過所有品質檢查

set -euo pipefail

if [ -z "${TEST_DATABASE_URL:-}" ]; then
    echo "❌ 必須指定本機獨立 TEST_DATABASE_URL；不可使用正式資料庫。"
    exit 1
fi
node scripts/assert-test-database.cjs
export DATABASE_URL="$TEST_DATABASE_URL"

echo "📦 Server build、單元測試與實際 DB 整合驗證"
npm run build --prefix server
npm test --prefix server -- --runInBand
cd server
npx prisma migrate deploy
npx prisma migrate diff --from-url "$TEST_DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
npm test -- --config jest.marketplace.config.js --runInBand
cd ..

echo "🧪 原生 QA 的隔離 API、合成帳號與確切資料清理"
node mobile/scripts/test-native-qa-marketplace-fixture.cjs
node mobile/scripts/native-qa-api-smoke.cjs
node scripts/verify-erasure-test-cleanup.cjs

echo "🧪 iOS 原生公開合成輸入白名單"
node mobile/scripts/test-ios-public-input.cjs

echo "🧪 Client test 與 build"
npm test --prefix client -- --run
npm run build --prefix client

echo "🛡️ Mobile typecheck、單元測試與依賴一致性"
npm run typecheck --prefix mobile
npm test --prefix mobile
cd mobile
npx expo install --check
cd ..

echo "✅ 本地品質檢查通過；不代表原生實機、商店或完整 MVP 驗收完成。"
