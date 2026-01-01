import nodemailer from 'nodemailer';

console.log('[EmailService] Initializing...');
if (!process.env.SMTP_USER) console.warn('[EmailService] SMTP_USER is MISSING');
if (!process.env.SMTP_PASS) console.warn('[EmailService] SMTP_PASS is MISSING');
else console.log('[EmailService] SMTP_PASS is SET (length: ' + process.env.SMTP_PASS.length + ')');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

export const sendEmail = async (to: string, subject: string, html: string) => {
    console.log(`[EmailService] Request to send email to: ${to}`);

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('⚠️ [Email Service] SMTP credentials missing in process.env. Skipping real send.');
        console.log(`[Mock Email Triggered] Subject: ${subject}`);
        return;
    }

    try {
        console.log('[EmailService] Transporter sending...');
        const info = await transporter.sendMail({
            from: process.env.SMTP_USER,
            to,
            subject,
            html
        });
        console.log(`✅ [Email Service] Email sent successfully! Message ID: ${info.messageId}`);
    } catch (error: any) {
        console.error('❌ [Email Service] FATAL ERROR:', error);
        if (error.response) {
            console.error('[Email Service] SMTP Valid Response:', error.response);
        }
    }
};
