import { Resend } from "resend";

// Email provider configuration
const EMAIL_PROVIDER = 'resend';
const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@twopiggyhavefun.uk';
const DEFAULT_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Wishlist App';

console.log(`[EmailService] Initializing with provider: ${EMAIL_PROVIDER}`);

// Initialize Resend Client
let resend: Resend | null = null;
if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log(`[EmailService] Resend configured (Key starts with: ${process.env.RESEND_API_KEY.substring(0, 8)}...)`);
} else {
    console.warn(`[EmailService] RESEND_API_KEY is missing! Email sending will fail.`);
}

// Send via Resend
const sendViaResend = async (to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> => {
    if (!resend || !process.env.RESEND_API_KEY) {
        return { success: false, error: 'Resend not configured' };
    }

    try {
        const response = await resend.emails.send({
            from: `${DEFAULT_FROM_NAME} <${DEFAULT_FROM_EMAIL}>`,
            to: [to],
            subject: subject,
            html: html,
        });

        if (response.error) {
            console.error(`❌ [Resend] Error:`, response.error);
            return { success: false, error: response.error.message };
        }


        console.log(`✅ [Resend] Email sent successfully! ID: ${response.data?.id}`);
        return { success: true, id: response.data?.id };
    } catch (error: any) {
        console.error(`❌ [Resend] Exception:`, error);
        return { success: false, error: error.message };
    }
};

export const sendEmail = async (to: string, subject: string, html: string): Promise<{ success: boolean; error?: string; log?: string; id?: string }> => {
    console.log(`[EmailService] Request to send email to: ${to}`);

    // Try Resend (Sole Provider)
    try {
        const result = await sendViaResend(to, subject, html);

        if (result.success) {
            return { success: true, log: `Sent via Resend (ID: ${result.id})`, id: result.id };
        }

        throw new Error(result.error || 'Resend failed');
    } catch (error: any) {
        console.error(`❌ [EmailService] Sending failed:`, error.message || error);
        return {
            success: false,
            error: `Email sending failed: ${error.message || 'Unknown error'}`,
            log: `Resend: ${error.message}`
        };
    }
};
