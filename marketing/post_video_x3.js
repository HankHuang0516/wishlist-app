const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    // 1. Path to video (simple path)
    const videoPath = 'C:\\Hank\\Other\\final_ad.mp4';

    console.log('Launching browser for robust upload...');
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        userDataDir: 'C:\\Users\\z004rx2h\\AppData\\Local\\Google\\Chrome\\User Data',
        defaultViewport: null,
        args: ['--start-maximized']
    }).catch(e => {
        console.error("FAILED TO LAUNCH:", e);
        process.exit(1);
    });

    const page = await browser.newPage();

    try {
        console.log('Navigating to Compose...');
        await page.goto('https://x.com/compose/post', { waitUntil: 'networkidle2' });

        // 2. Handle File Upload
        console.log('Looking for file input...');
        const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 10000 });

        console.log(`Uploading ${videoPath}...`);
        await fileInput.uploadFile(videoPath);

        // 3. Wait for Video Preview/Upload Completion
        console.log('Waiting for video to attach...');
        // Wait for the "Remove media" button or video container, implies upload processed
        await page.waitForSelector('[aria-label="Remove media"]', { timeout: 30000 });
        console.log('Video preview appeared. Waiting for any progress bars...');

        // Give it a moment for any transcoding/progress bars to clear
        await new Promise(r => setTimeout(r, 5000));

        // 4. Type Text
        console.log('Typing text...');
        // Valid selector for X text area
        const textBox = await page.waitForSelector('[role="textbox"][data-testid="tweetTextarea_0"]');
        await textBox.click();
        await textBox.type('Say goodbye to bad gifts! #Wishlist (Auto-Video Test)');

        // 5. Click Post
        console.log('Looking for Post button...');
        const postButton = await page.waitForSelector('[data-testid="tweetButton"]');

        // Check if disabled using evaluation
        await page.waitForFunction(
            btn => !btn.disabled && btn.getAttribute('aria-disabled') !== 'true',
            { timeout: 15000 },
            postButton
        );

        console.log('Clicking Post...');
        await postButton.click();

        // 6. Verify Success
        console.log('Waiting for "Your post was sent" toast...');
        await page.waitForSelector('[data-testid="toast"]', { timeout: 15000 });
        console.log('Toast detected! Upload success.');

        await new Promise(r => setTimeout(r, 5000));

    } catch (error) {
        console.error('Error during upload:', error);
    } finally {
        await browser.close();
    }
})();
