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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const resend_1 = require("resend");
console.log('[EmailService] Initializing Resend...');
// Check for API Key (Warn only, don't crash)
if (!process.env.RESEND_API_KEY) {
    console.warn('[EmailService] RESEND_API_KEY is MISSING');
}
else {
    // Show first 4 chars for debug safety
    const key = process.env.RESEND_API_KEY;
    console.log(`[EmailService] RESEND_API_KEY is SET (Starts with: ${key.substring(0, 4)}...)`);
}
// Initialize Resend Client
// Initialize Resend Client (Use mock key if missing to prevent crash)
const resend = new resend_1.Resend(process.env.RESEND_API_KEY || 're_123456789');
const sendEmail = (to, subject, html) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    console.log(`[EmailService] Request to send email to: ${to}`);
    const apiKey = (_a = process.env.RESEND_API_KEY) === null || _a === void 0 ? void 0 : _a.trim();
    if (!apiKey) {
        console.warn('⚠️ [Email Service] RESEND_API_KEY missing. Skipping real send.');
        return { success: false, error: 'RESEND_API_KEY missing', log: 'API Key Missing' };
    }
    try {
        console.log('[EmailService] Sending via Resend API...');
        const data = yield resend.emails.send({
            from: 'Wishlist App <onboarding@resend.dev>', // Default testing domain
            to: [to], // Resend expects an array
            subject: subject,
            html: html,
        });
        if (data.error) {
            console.error('❌ [Email Service] Resend API Error:', data.error);
            return { success: false, error: data.error.message, log: JSON.stringify(data.error) };
        }
        console.log(`✅ [Email Service] Email sent successfully! ID: ${(_b = data.data) === null || _b === void 0 ? void 0 : _b.id}`);
        return { success: true, log: `Sent OK. ID: ${(_c = data.data) === null || _c === void 0 ? void 0 : _c.id}` };
    }
    catch (error) {
        console.error('❌ [Email Service] FATAL ERROR:', error);
        return {
            success: false,
            error: error.message || 'Unknown Resend Error',
            log: `Error: ${JSON.stringify(error)}`
        };
    }
});
exports.sendEmail = sendEmail;
