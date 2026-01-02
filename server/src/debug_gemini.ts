
import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("No GEMINI_API_KEY found in environment");
        return;
    }

    console.log("Checking available models for key ending in...", key.slice(-4));

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Error ${response.status}: ${response.statusText}`);
            console.error(await response.text());
            return;
        }

        const data = await response.json();
        console.log("Available Models:");
        if (data.models) {
            const models = data.models
                .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
                .map((m: any) => m.name);
            console.log(models.join('\n'));
        } else {
            console.log("No models field in response:", data);
        }

    } catch (e) {
        console.error("Fetch error:", e);
    }
}

listModels();
