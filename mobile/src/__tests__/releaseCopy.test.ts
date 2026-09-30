import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('store release onboarding copy', () => {
  it.each(['AuthScreen.tsx', 'ProductNoticeScreen.tsx'])('%s does not claim the released app is unfinished', file => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    expect(source).not.toMatch(/開發驗證版本|完整雙平台與商店驗收尚未完成/);
  });
});
