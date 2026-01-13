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
const axios_1 = __importDefault(require("axios"));
dotenv_1.default.config();
function test() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        console.log("Testing Google CSE directly...");
        const cseId = process.env.GOOGLE_CSE_ID;
        const apiKey = process.env.GOOGLE_API_KEY;
        console.log("CSE ID:", cseId);
        console.log("API Key:", (apiKey === null || apiKey === void 0 ? void 0 : apiKey.substring(0, 10)) + "...");
        if (!cseId || !apiKey) {
            console.error("Missing API keys!");
            return;
        }
        // Test multiple queries
        const queries = [
            'Nintendo Switch',
            'momo購物網',
            'iPhone 15'
        ];
        for (const query of queries) {
            const url = `https://customsearch.googleapis.com/customsearch/v1?cx=${cseId}&key=${apiKey}&q=${encodeURIComponent(query)}&num=1&safe=active`;
            console.log(`\n--- Testing query: "${query}" ---`);
            try {
                const res = yield axios_1.default.get(url);
                console.log("Total results:", (_a = res.data.searchInformation) === null || _a === void 0 ? void 0 : _a.totalResults);
                if (res.data.items && res.data.items.length > 0) {
                    console.log("First result:", res.data.items[0].title);
                }
            }
            catch (e) {
                console.error("Error:", ((_d = (_c = (_b = e.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message) || e.message);
            }
        }
    });
}
test();
