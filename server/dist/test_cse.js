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
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const isImageAccessible = (url) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log(`Checking URL: ${url.substring(0, 60)}...`);
        const response = yield axios_1.default.get(url, {
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
    }
    catch (error) {
        console.log(`  > Failed: ${error.message}`);
        return false;
    }
});
const verifyValidation = () => __awaiter(void 0, void 0, void 0, function* () {
    const badUrl = "https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=859695209924239"; // The FB link
    const goodUrl = "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png"; // Known good image
    console.log("\n--- Testing Bad URL (Expect False) ---");
    const resultBad = yield isImageAccessible(badUrl);
    console.log("Result:", resultBad);
    console.log("\n--- Testing Good URL (Expect True) ---");
    const resultGood = yield isImageAccessible(goodUrl);
    console.log("Result:", resultGood);
});
verifyValidation();
