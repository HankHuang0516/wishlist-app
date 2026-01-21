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
// Email provider configuration
const EMAIL_PROVIDER = 'resend';
const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@twopiggyhavefun.uk';
const DEFAULT_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Wishlist App';
console.log(`[EmailService] Initializing with provider: ${EMAIL_PROVIDER}`);
// Initialize Resend Client
let resend = null;
if (process.env.RESEND_API_KEY) {
    resend = new resend_1.Resend(process.env.RESEND_API_KEY);
    console.log(`[EmailService] Resend configured (Key starts with: ${process.env.RESEND_API_KEY.substring(0, 8)}...)`);
}
else {
    console.warn(`[EmailService] RESEND_API_KEY is missing! Email sending will fail.`);
}
// Send via Resend
const sendViaResend = (to, subject, html) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    if (!resend || !process.env.RESEND_API_KEY) {
        return { success: false, error: 'Resend not configured' };
    }
    try {
        const response = yield resend.emails.send({
            from: `${DEFAULT_FROM_NAME} <${DEFAULT_FROM_EMAIL}>`,
            to: [to],
            subject: subject,
            html: html,
        });
        if (response.error) {
            console.error(`❌ [Resend] Error:`, response.error);
            return { success: false, error: response.error.message };
        }
        console.log(`✅ [Resend] Email sent successfully! ID: ${(_a = response.data) === null || _a === void 0 ? void 0 : _a.id}`);
        return { success: true, id: (_b = response.data) === null || _b === void 0 ? void 0 : _b.id };
    }
    catch (error) {
        console.error(`❌ [Resend] Exception:`, error);
        return { success: false, error: error.message };
    }
});
const sendEmail = (to, subject, html) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`[EmailService] Request to send email to: ${to}`);
    // Try Resend (Sole Provider)
    try {
        const result = yield sendViaResend(to, subject, html);
        if (result.success) {
            return { success: true, log: `Sent via Resend (ID: ${result.id})`, id: result.id };
        }
        throw new Error(result.error || 'Resend failed');
    }
    catch (error) {
        console.error(`❌ [EmailService] Sending failed:`, error.message || error);
        return {
            success: false,
            error: `Email sending failed: ${error.message || 'Unknown error'}`,
            log: `Resend: ${error.message}`
        };
    }
});
exports.sendEmail = sendEmail;
