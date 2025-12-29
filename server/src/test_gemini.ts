import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Explicitly load .env from current directory
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

console.log("Loading .env from:", envPath);
const apiKey = process.env.GEMINI_API_KEY;

console.log("API Key found:", !!apiKey);
if (apiKey) {
    console.log("API Key length:", apiKey.length);
    console.log("API Key start:", apiKey.substring(0, 5));
} else {
    console.error("API Key is missing!");
    process.exit(1);
}

async function testGemini() {
    try {
        console.log("Fetching models via raw HTTP...");
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const res = await fetch(url);

        if (!res.ok) {
            console.error("HTTP Error:", res.status, res.statusText);
            const body = await res.text();
            console.error("Body:", body);
            return;
        }

        const data = await res.json();
        console.log("Models available (Flash only):");
        const models = (data as any).models;
        if (models) {
            models.forEach((m: any) => {
                if (m.name.includes("flash")) {
                    console.log(`- ${m.name}`);
                }
            });
        } else {
            console.log("No models found?", data);
        }

    } catch (error: any) {
        console.error("Script Error:", error.message);
    }
}

testGemini();
