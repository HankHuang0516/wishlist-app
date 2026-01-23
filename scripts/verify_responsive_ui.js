const puppeteer = require('puppeteer');

(async () => {
    console.log('Starting UI Verification for Wishlist App...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Use Production URL
    const url = 'https://wishlist-app-production.up.railway.app/';

    try {
        // ==========================================
        // 1. Desktop View (1920x1080)
        // ==========================================
        console.log(`\n[Test 1] Checking Desktop View (1920x1080) on ${url}`);
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

        // Check Title
        const title = await page.title();
        console.log(`   Page Title: ${title}`);

        // Check Footer Feedback Button (Desktop)
        // Note: In Layout.tsx, the button is rendered with text "意見回饋"
        console.log('   Looking for "意見回饋" button in footer...');

        // Look for button with specific text
        const feedbackBtnSelector = `//button[contains(., '意見回饋')]`;
        await page.waitForSelector(`xpath/${feedbackBtnSelector}`, { timeout: 5000 });
        console.log('   ✅ Feedback button found on Desktop.');

        // Check Terms and Privacy links exist
        const termsLink = await page.$('a[href="/terms"]');
        const privacyLink = await page.$('a[href="/privacy"]');
        if (termsLink && privacyLink) {
            console.log('   ✅ Terms and Privacy links found.');
        } else {
            throw new Error('Terms or Privacy links missing on Desktop');
        }

        // ==========================================
        // 2. Mobile View (375x812 - iPhone X)
        // ==========================================
        console.log(`\n[Test 2] Checking Mobile View (375x812)`);
        await page.setViewport({ width: 375, height: 812 });

        // Give time for layout adjustment
        await new Promise(r => setTimeout(r, 1000));

        // Check Footer Feedback Button (Mobile)
        // Should still be visible or stacked
        console.log('   Looking for "意見回饋" button in mobile footer...');
        const mobileFeedbackBtn = await page.waitForSelector(`xpath/${feedbackBtnSelector}`, { visible: true, timeout: 5000 });
        console.log('   ✅ Feedback button found and visible on Mobile.');

        // ==========================================
        // 3. Feedback Modal Interaction
        // ==========================================
        console.log(`\n[Test 3] Testing Feedback Modal (Anonymous)`);
        console.log('   Clicking Feedback button...');
        await mobileFeedbackBtn.click();

        // Wait for Modal to open
        // Modal uses "fixed inset-0" class, check for "意見回饋" title inside h2 or div
        // CardTitle uses {t('feedback.title')} which matches "意見回饋"
        console.log('   Waiting for modal to open...');
        await page.waitForSelector('.fixed.inset-0', { visible: true, timeout: 5000 });

        // Check for Email Input
        // In FeedbackModal.tsx: <label ...>Email (Required for reply)</label>
        console.log('   Checking for Email Input field...');
        const emailLabel = await page.$$("xpath///label[contains(., 'Email (Required for reply)')]");

        if (emailLabel.length > 0) {
            console.log('   ✅ Email label found (Indicates Anonymous Mode works).');

            // Check actual input field
            const emailInput = await page.$('input[type="email"]');
            if (emailInput) {
                console.log('   ✅ Email input field found.');
            } else {
                throw new Error('Email input field missing!');
            }
        } else {
            throw new Error('Email label NOT found. Are we logged in? Or code not deployed?');
        }

        console.log('\n✨ All Verification Tests Passed!');

    } catch (e) {
        console.error('\n❌ Verification Failed:', e);
        if (e.message && e.message.indexOf('Timeout') !== -1) {
            console.error('   (Possible cause: Element not found or network slow)');
        }
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
