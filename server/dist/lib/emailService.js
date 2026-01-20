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
const mailersend_1 = require("mailersend");
console.log('[EmailService] Initializing MailerSend...');
// Check for API Key (Warn only, don't crash)
if (!process.env.MAILERSEND_API_KEY) {
    console.warn('[EmailService] MAILERSEND_API_KEY is MISSING');
}
else {
    const key = process.env.MAILERSEND_API_KEY;
    console.log(`[EmailService] MAILERSEND_API_KEY is SET (Starts with: ${key.substring(0, 8)}...)`);
}
// Initialize MailerSend Client
const mailerSend = new mailersend_1.MailerSend({
    apiKey: process.env.MAILERSEND_API_KEY || '',
});
// Default sender - Update this with your verified MailerSend domain
const DEFAULT_FROM_EMAIL = process.env.MAILERSEND_FROM_EMAIL || 'MS_XHh8Fw@test-pzkmgq7q1xnl059v.mlsender.net';
const DEFAULT_FROM_NAME = process.env.MAILERSEND_FROM_NAME || 'Wishlist App';
const sendEmail = (to, subject, html) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    console.log(`[EmailService] Request to send email to: ${to}`);
    const apiKey = (_a = process.env.MAILERSEND_API_KEY) === null || _a === void 0 ? void 0 : _a.trim();
    if (!apiKey) {
        console.warn('⚠️ [Email Service] MAILERSEND_API_KEY missing. Skipping real send.');
        return { success: false, error: 'MAILERSEND_API_KEY missing', log: 'API Key Missing' };
    }
    try {
        console.log('[EmailService] Sending via MailerSend API...');
        const sentFrom = new mailersend_1.Sender(DEFAULT_FROM_EMAIL, DEFAULT_FROM_NAME);
        const recipients = [new mailersend_1.Recipient(to)];
        const emailParams = new mailersend_1.EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setSubject(subject)
            .setHtml(html);
        const response = yield mailerSend.email.send(emailParams);
        console.log(`✅ [Email Service] Email sent successfully!`, response);
        return { success: true, log: `Sent OK` };
    }
    catch (error) {
        console.error('❌ [Email Service] FATAL ERROR:', error);
        return {
            success: false,
            error: error.message || 'Unknown MailerSend Error',
            log: `Error: ${JSON.stringify(error)}`
        };
    }
});
exports.sendEmail = sendEmail;
