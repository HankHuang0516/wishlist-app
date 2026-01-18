import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";

console.log('[EmailService] Initializing MailerSend...');

// Check for API Key (Warn only, don't crash)
if (!process.env.MAILERSEND_API_KEY) {
    console.warn('[EmailService] MAILERSEND_API_KEY is MISSING');
} else {
    const key = process.env.MAILERSEND_API_KEY;
    console.log(`[EmailService] MAILERSEND_API_KEY is SET (Starts with: ${key.substring(0, 8)}...)`);
}

// Initialize MailerSend Client
const mailerSend = new MailerSend({
    apiKey: process.env.MAILERSEND_API_KEY || '',
});

// Default sender - Update this with your verified MailerSend domain
const DEFAULT_FROM_EMAIL = process.env.MAILERSEND_FROM_EMAIL || 'noreply@test-pzkmgq7q1xnl059v.mlsender.net';
const DEFAULT_FROM_NAME = process.env.MAILERSEND_FROM_NAME || 'Wishlist App';

export const sendEmail = async (to: string, subject: string, html: string): Promise<{ success: boolean; error?: string; log?: string }> => {
    console.log(`[EmailService] Request to send email to: ${to}`);

    const apiKey = process.env.MAILERSEND_API_KEY?.trim();

    if (!apiKey) {
        console.warn('⚠️ [Email Service] MAILERSEND_API_KEY missing. Skipping real send.');
        return { success: false, error: 'MAILERSEND_API_KEY missing', log: 'API Key Missing' };
    }

    try {
        console.log('[EmailService] Sending via MailerSend API...');

        const sentFrom = new Sender(DEFAULT_FROM_EMAIL, DEFAULT_FROM_NAME);
        const recipients = [new Recipient(to)];

        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setSubject(subject)
            .setHtml(html);

        const response = await mailerSend.email.send(emailParams);

        console.log(`✅ [Email Service] Email sent successfully!`, response);
        return { success: true, log: `Sent OK` };

    } catch (error: any) {
        console.error('❌ [Email Service] FATAL ERROR:', error);
        return {
            success: false,
            error: error.message || 'Unknown MailerSend Error',
            log: `Error: ${JSON.stringify(error)}`
        };
    }
};
