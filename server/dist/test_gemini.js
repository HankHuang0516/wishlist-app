"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Explicitly load .env from current directory
const envPath = path_1.default.resolve(__dirname, '../.env');
dotenv_1.default.config({ path: envPath });
console.log("Loading .env from:", envPath);
const apiKey = process.env.GEMINI_API_KEY;
console.log("API Key found:", !!apiKey);
if (apiKey) {
    console.log("API Key length:", apiKey.length);
    console.log("API Key start:", apiKey.substring(0, 5));
}
else {
    console.error("API Key is missing!");
    process.exit(1);
}
function testGemini() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("Fetching models via raw HTTP...");
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const res = yield fetch(url);
            if (!res.ok) {
                console.error("HTTP Error:", res.status, res.statusText);
                const body = yield res.text();
                console.error("Body:", body);
                return;
            }
            const data = yield res.json();
            console.log("Models available (Flash only):");
            const models = data.models;
            if (models) {
                models.forEach((m) => {
                    if (m.name.includes("flash")) {
                        console.log(`- ${m.name}`);
                    }
                });
            }
            else {
                console.log("No models found?", data);
            }
        }
        catch (error) {
            console.error("Script Error:", error.message);
        }
    });
}
testGemini();
