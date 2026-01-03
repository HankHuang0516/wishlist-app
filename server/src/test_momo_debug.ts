/**
 * 8D Investigation: Momo Specific Analysis
 * Purpose: Understand exactly what Momo returns and verify AI fallback works
 */

import * as cheerio from 'cheerio';

const MOMO_URL = 'https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=14244558';

const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.google.com/',
    'Cache-Control': 'no-cache',
});

async function debugMomo() {
    console.log('='.repeat(60));
    console.log('MOMO DETAILED ANALYSIS');
    console.log('='.repeat(60));
    console.log('');
    console.log('URL:', MOMO_URL);
    console.log('');

    try {
        const response = await fetch(MOMO_URL, { headers: getHeaders() });

        console.log('--- HTTP Response ---');
        console.log('Status:', response.status);
        console.log('Status Text:', response.statusText);
        console.log('Headers:');
        response.headers.forEach((value, key) => {
            if (['content-type', 'set-cookie', 'x-frame-options', 'content-security-policy'].includes(key.toLowerCase())) {
                console.log(`  ${key}: ${value.substring(0, 80)}...`);
            }
        });
        console.log('');

        const html = await response.text();
        const $ = cheerio.load(html);

        console.log('--- Page Content Analysis ---');
        console.log('HTML Length:', html.length, 'bytes');
        console.log('Title:', $('title').text().trim());
        console.log('');

        console.log('--- OG Meta Tags ---');
        console.log('og:title:', $('meta[property="og:title"]').attr('content') || 'NOT FOUND');
        console.log('og:image:', $('meta[property="og:image"]').attr('content') || 'NOT FOUND');
        console.log('og:description:', ($('meta[property="og:description"]').attr('content') || 'NOT FOUND').substring(0, 50));
        console.log('');

        console.log('--- Blocking Indicators ---');
        const lowerHtml = html.toLowerCase();
        console.log('Contains "captcha":', lowerHtml.includes('captcha'));
        console.log('Contains "robot":', lowerHtml.includes('robot'));
        console.log('Contains "verify":', lowerHtml.includes('verify'));
        console.log('Contains "cloudflare":', lowerHtml.includes('cloudflare'));
        console.log('Contains "challenge":', lowerHtml.includes('challenge'));
        console.log('');

        console.log('--- Image Count ---');
        console.log('Total <img> tags:', $('img').length);
        console.log('');

        // Check if it's a redirect/soft block
        if (html.length < 5000) {
            console.log('⚠️ WARNING: Very short HTML response - likely blocked or redirected');
            console.log('First 500 chars of HTML:');
            console.log(html.substring(0, 500));
        } else if ($('meta[property="og:image"]').attr('content')) {
            console.log('✅ LOOKS OK: OG image found, content appears loaded');
        } else {
            console.log('⚠️ WARNING: No OG image but HTML is long - possible JS-rendered page');
        }

    } catch (e: any) {
        console.log('❌ FETCH ERROR:', e.message);
    }
}

debugMomo();
