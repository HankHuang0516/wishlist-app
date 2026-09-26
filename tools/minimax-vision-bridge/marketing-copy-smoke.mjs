// Synthetic-only MiniMax image Q&A prompt verification; no user media or DB.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
const exec = promisify(execFile);
const fixture = resolve('mobile/qa-fixtures/synthetic-used-orange-desk-lamp.png');
const upload = JSON.parse((await exec('mcode-tools', ['upload-temp-url', fixture],
  { timeout: 45_000, maxBuffer: 1_000_000 })).stdout);
const prompt = [
  '你是台灣二手商品的行銷文案助手。以下是賣家已確認的事實，不得因圖片臆測其他內容。',
  '商品名稱：合成橘色二手檯燈。賣家說明：橘色金屬檯燈一盞，燈罩邊緣可見使用痕跡。實際運作狀態請面交確認。售價：NT$450。',
  '請依照賣家事實與圖片寫一段 50–180 字繁體中文行銷文案，原樣寫出商品名稱與 NT$450。',
  '不得自行宣稱功能正常、品牌、年份、保固、配件、稀有性或任何未證實事實。',
  '文末必須有「請以實拍照片與面交檢查為準」。只輸出文案，不要 JSON、Markdown 或引號。',
].join('\n');
const result = JSON.parse((await exec('mcode-tools', ['connector', 'call', 'connector__matrix__describe_images',
  '--args', JSON.stringify({ image_info: [{ url: upload.temp_url, prompt }] })],
{ timeout: 180_000, maxBuffer: 1_000_000 })).stdout);
if (result.code !== 0 || result.results?.[0]?.success !== true) throw new Error('COPY_UPSTREAM_FAILED');
const copy = result.results[0].description?.trim();
if (!copy || copy.length < 20 || copy.length > 1200 || !copy.includes('合成橘色二手檯燈') ||
    !copy.includes('NT$450') || !copy.includes('請以實拍照片與面交檢查為準')) throw new Error('COPY_VALIDATION_FAILED');
console.log(JSON.stringify({ passed: true, characters: copy.length, copy }));
