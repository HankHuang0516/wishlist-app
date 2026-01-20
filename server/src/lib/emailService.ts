import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { Resend } from "resend";

// Email provider configuration
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'resend'; // 'mailersend' or 'resend'
const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@twopiggyhavefun.uk';
const DEFAULT_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Wishlist App';

console.log(`[EmailService] Initializing with provider: ${EMAIL_PROVIDER}`);

// Initialize MailerSend Client
let mailerSend: MailerSend | null = null;
if (process.env.MAILERSEND_API_KEY) {
    mailerSend = new MailerSend({
        apiKey: process.env.MAILERSEND_API_KEY,
    });
    console.log(`[EmailService] MailerSend configured (Key starts with: ${process.env.MAILERSEND_API_KEY.substring(0, 8)}...)`);
}

// Initialize Resend Client
let resend: Resend | null = null;
if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log(`[EmailService] Resend configured (Key starts with: ${process.env.RESEND_API_KEY.substring(0, 8)}...)`);
}

// Send via MailerSend
const sendViaMailerSend = async (to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> => {
    if (!mailerSend || !process.env.MAILERSEND_API_KEY) {
        return { success: false, error: 'MailerSend not configured' };
    }

    const sentFrom = new Sender(process.env.MAILERSEND_FROM_EMAIL || DEFAULT_FROM_EMAIL, DEFAULT_FROM_NAME);
    const recipients = [new Recipient(to)];

    const emailParams = new EmailParams()
        .setFrom(sentFrom)
        .setTo(recipients)
        .setSubject(subject)
        .setHtml(html);

    const response = await mailerSend.email.send(emailParams);
    console.log(`✅ [MailerSend] Email sent successfully!`, response);
    return { success: true };
};

// Send via Resend
const sendViaResend = async (to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> => {
    if (!resend || !process.env.RESEND_API_KEY) {
        return { success: false, error: 'Resend not configured' };
    }

    const response = await resend.emails.send({
        from: `${DEFAULT_FROM_NAME} <${DEFAULT_FROM_EMAIL}>`,
        to: [to],
        subject: subject,
        html: html,
    });

    if (response.error) {
        throw new Error(response.error.message);
    }

    console.log(`✅ [Resend] Email sent successfully!`, response);
    return { success: true };
};

export const sendEmail = async (to: string, subject: string, html: string): Promise<{ success: boolean; error?: string; log?: string }> => {
    console.log(`[EmailService] Request to send email to: ${to}`);

    // Determine which providers to try
    const primaryProvider = EMAIL_PROVIDER;
    const fallbackProvider = primaryProvider === 'resend' ? 'mailersend' : 'resend';

    // Try primary provider first
    try {
        console.log(`[EmailService] Trying primary provider: ${primaryProvider}`);

        let result;
        if (primaryProvider === 'resend') {
            result = await sendViaResend(to, subject, html);
        } else {
            result = await sendViaMailerSend(to, subject, html);
        }

        if (result.success) {
            return { success: true, log: `Sent via ${primaryProvider}` };
        }

        throw new Error(result.error || 'Primary provider failed');
    } catch (primaryError: any) {
        console.warn(`⚠️ [EmailService] Primary provider (${primaryProvider}) failed:`, primaryError.message || primaryError);

        // Try fallback provider
        try {
            console.log(`[EmailService] Trying fallback provider: ${fallbackProvider}`);

            let result;
            if (fallbackProvider === 'resend') {
                result = await sendViaResend(to, subject, html);
            } else {
                result = await sendViaMailerSend(to, subject, html);
            }

            if (result.success) {
                return { success: true, log: `Sent via ${fallbackProvider} (fallback)` };
            }

            throw new Error(result.error || 'Fallback provider failed');
        } catch (fallbackError: any) {
            console.error(`❌ [EmailService] Both providers failed`);
            console.error(`  Primary (${primaryProvider}):`, primaryError.message || primaryError);
            console.error(`  Fallback (${fallbackProvider}):`, fallbackError.message || fallbackError);

            return {
                success: false,
                error: `Email sending failed: ${primaryError.message || 'Unknown error'}`,
                log: `Primary: ${primaryError.message}, Fallback: ${fallbackError.message}`
            };
        }
    }
};
