import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

export const sendEmail = async (to: string, subject: string, html: string) => {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('⚠️ [Email Service] SMTP credentials missing. Skipping email send.');
        console.log(`[Mock Email] To: ${to}, Subject: ${subject}`);
        return;
    }

    try {
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to,
            subject,
            html
        });
        console.log(`✅ [Email Service] Email sent to ${to}`);
    } catch (error) {
        console.error('❌ [Email Service] Failed to send email:', error);
    }
};
