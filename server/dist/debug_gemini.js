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
dotenv_1.default.config();
function listModels() {
    return __awaiter(this, void 0, void 0, function* () {
        const key = process.env.GEMINI_API_KEY;
        if (!key) {
            console.error("No GEMINI_API_KEY found in environment");
            return;
        }
        console.log("Checking available models for key ending in...", key.slice(-4));
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
        try {
            const response = yield fetch(url);
            if (!response.ok) {
                console.error(`Error ${response.status}: ${response.statusText}`);
                console.error(yield response.text());
                return;
            }
            const data = yield response.json();
            console.log("Available Models:");
            if (data.models) {
                const models = data.models
                    .filter((m) => m.supportedGenerationMethods.includes('generateContent'))
                    .map((m) => m.name);
                console.log(models.join('\n'));
            }
            else {
                console.log("No models field in response:", data);
            }
        }
        catch (e) {
            console.error("Fetch error:", e);
        }
    });
}
listModels();
