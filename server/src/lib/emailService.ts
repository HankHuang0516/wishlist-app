
import { Resend } from 'resend';

console.log('[EmailService] Initializing Resend...');

// Check for API Key (Warn only, don't crash)
if (!process.env.RESEND_API_KEY) {
    console.warn('[EmailService] RESEND_API_KEY is MISSING');
} else {
    // Show first 4 chars for debug safety
    const key = process.env.RESEND_API_KEY;
    console.log(`[EmailService] RESEND_API_KEY is SET (Starts with: ${key.substring(0, 4)}...)`);
}

// Initialize Resend Client
// Initialize Resend Client (Use mock key if missing to prevent crash)
const resend = new Resend(process.env.RESEND_API_KEY || 're_123456789');

export const sendEmail = async (to: string, subject: string, html: string): Promise<{ success: boolean; error?: string; log?: string }> => {
    console.log(`[EmailService] Request to send email to: ${to}`);

    const apiKey = process.env.RESEND_API_KEY?.trim();

    if (!apiKey) {
        console.warn('⚠️ [Email Service] RESEND_API_KEY missing. Skipping real send.');
        return { success: false, error: 'RESEND_API_KEY missing', log: 'API Key Missing' };
    }

    try {
        console.log('[EmailService] Sending via Resend API...');

        const data = await resend.emails.send({
            from: 'Wishlist App <onboarding@resend.dev>', // Default testing domain
            to: [to], // Resend expects an array
            subject: subject,
            html: html,
        });

        if (data.error) {
            console.error('❌ [Email Service] Resend API Error:', data.error);
            return { success: false, error: data.error.message, log: JSON.stringify(data.error) };
        }

        console.log(`✅ [Email Service] Email sent successfully! ID: ${data.data?.id}`);
        return { success: true, log: `Sent OK. ID: ${data.data?.id}` };

    } catch (error: any) {
        console.error('❌ [Email Service] FATAL ERROR:', error);
        return {
            success: false,
            error: error.message || 'Unknown Resend Error',
            log: `Error: ${JSON.stringify(error)}`
        };
    }
};
