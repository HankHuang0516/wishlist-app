
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// CONFIG
const VIDEO_PATH = path.resolve(__dirname, '../../pomelli-output/final_ad_subtitled_pro.mp4');
const SCENARIOS_PATH = path.resolve(__dirname, 'post_scenarios.md');
const USER_DATA_DIR = path.resolve(__dirname, 'chrome_data');

// SCENARIO PARSER
function loadScenarios() {
    const content = fs.readFileSync(SCENARIOS_PATH, 'utf8');
    const scenarios = [];
    const regex = /## 劇本 [A-Z].*\n\*\*.*?\*\*\n\*\*內容\*\*：\n> ([\s\S]*?)(?=\n##|$)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        // Clean up the text: remove '>' and trim
        let text = match[1].split('\n').map(line => line.replace(/^> /, '').trim()).join('\n').trim();
        scenarios.push(text);
    }
    return scenarios;
}

(async () => {
    console.log(chalk.cyan('=== Wishlist Auto Poster Starting ==='));

    // 1. Pick Scenario
    const scenarios = loadScenarios();
    if (scenarios.length === 0) {
        console.error(chalk.red('No scenarios found in post_scenarios.md!'));
        process.exit(1);
    }
    const chosenText = scenarios[Math.floor(Math.random() * scenarios.length)];
    console.log(chalk.yellow('Selected Scenario:\n') + chalk.white(chosenText));
    console.log(chalk.gray('-----------------------------------'));

    // 2. Prepare Video
    if (!fs.existsSync(VIDEO_PATH)) {
        console.error(chalk.red(`Video file not found at: ${VIDEO_PATH}`));
        process.exit(1);
    }
    console.log(chalk.blue('Reading video file... '));
    const videoBuffer = fs.readFileSync(VIDEO_PATH);
    const videoBase64 = videoBuffer.toString('base64');
    console.log(chalk.green(`Video read complete. Size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`));

    // 3. Launch Browser
    console.log(chalk.blue('Launching Browser...'));
    const browser = await puppeteer.launch({
        headless: false, // Must be headful for X automation reliability
        userDataDir: USER_DATA_DIR,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    const page = await browser.newPage();

    try {
        // 4. Navigate
        console.log(chalk.blue('Navigating to X...'));
        await page.goto('https://x.com/compose/post', { waitUntil: 'networkidle2' });

        // Check Login
        const isLogin = await page.$('input[autocomplete="username"]');
        if (isLogin) {
            console.log(chalk.red('\n!!! LOGIN REQUIRED !!!'));
            console.log(chalk.yellow('Please log in manually in the browser window.'));
            console.log(chalk.yellow('The script will wait until you reach the home page.'));
            await page.waitForNavigation({ timeout: 0 }); // Wait indefinitely
        }

        // Wait for composer
        console.log(chalk.blue('Waiting for composer...'));
        await page.waitForSelector('div[data-testid="tweetTextarea_0"]', { timeout: 60000 });

        // 5. Inject Video (Browser Context)
        console.log(chalk.blue('Injecting Video (this may take 10-20s)...'));
        await page.evaluate(async (base64Data) => {
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'video/mp4' });
            const file = new File([blob], 'ad_video.mp4', { type: 'video/mp4' });

            const input = document.querySelector('input[type="file"]');
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            input.files = dataTransfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, videoBase64);

        // 6. Wait for Video Preview
        console.log(chalk.blue('Waiting for video preview...'));
        await page.waitForFunction(() => document.querySelector('video'), { timeout: 60000 });
        console.log(chalk.green('Video preview detected! Waiting 5s for stability...'));
        await new Promise(r => setTimeout(r, 5000));

        // 7. Insert Text
        console.log(chalk.blue('Inserting text...'));
        await page.evaluate((text) => {
            const editor = document.querySelector('div[data-testid="tweetTextarea_0"]');
            editor.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }, chosenText);
        await new Promise(r => setTimeout(r, 2000));

        // 8. Click Post
        console.log(chalk.blue('Clicking Post...'));
        const postBtn = await page.$('button[data-testid="tweetButton"]');
        const isDisabled = await page.evaluate(el => el.disabled, postBtn);

        if (isDisabled) {
            throw new Error('Post button is disabled! Text/Video might not be registered.');
        }

        await postBtn.click();
        console.log(chalk.green('Post Clicked! Waiting for confirmation...'));

        // 9. Verify
        // Wait for the composer to disappear or a toast
        try {
            await page.waitForSelector('div[data-testid="toast"]', { timeout: 10000 });
            console.log(chalk.green('SUCCESS: Toast notification detected!'));
        } catch (e) {
            console.log(chalk.yellow('Warning: No toast detected, but post might have sent. Check browser.'));
        }

        console.log(chalk.magenta('\nDone! Closing in 5 seconds...'));
        await new Promise(r => setTimeout(r, 5000));
        await browser.close();

    } catch (e) {
        console.error(chalk.red('ERROR:'), e);
        console.log(chalk.yellow('Browser will remain open for debugging for 60s.'));
        await new Promise(r => setTimeout(r, 60000));
        await browser.close();
    }

})();
