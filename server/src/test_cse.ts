
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const isImageAccessible = async (url: string): Promise<boolean> => {
    try {
        console.log(`Checking URL: ${url.substring(0, 60)}...`);
        const response = await axios.get(url, {
            timeout: 5000,
            responseType: 'stream',
            validateStatus: (status) => status === 200
        });

        const contentType = response.headers['content-type'];
        console.log(`  > Status: ${response.status}`);
        console.log(`  > Type: ${contentType}`);

        if (contentType && contentType.startsWith('image/')) {
            response.data.destroy();
            return true;
        }
        return false;
    } catch (error: any) {
        console.log(`  > Failed: ${error.message}`);
        return false;
    }
};

const verifyValidation = async () => {
    const badUrl = "https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=859695209924239"; // The FB link
    const goodUrl = "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png"; // Known good image

    console.log("\n--- Testing Bad URL (Expect False) ---");
    const resultBad = await isImageAccessible(badUrl);
    console.log("Result:", resultBad);

    console.log("\n--- Testing Good URL (Expect True) ---");
    const resultGood = await isImageAccessible(goodUrl);
    console.log("Result:", resultGood);
};

verifyValidation();
