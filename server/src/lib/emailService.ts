import nodemailer from 'nodemailer';

console.log('[EmailService] Initializing...');
if (!process.env.SMTP_USER) console.warn('[EmailService] SMTP_USER is MISSING');
if (!process.env.SMTP_PASS) console.warn('[EmailService] SMTP_PASS is MISSING');
else console.log('[EmailService] SMTP_PASS is SET (length: ' + process.env.SMTP_PASS.length + ')');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465, // SSL
    secure: true, // true for 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    // tls: { rejectUnauthorized: false } // Not needed for Port 465 usually
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000
});

export const sendEmail = async (to: string, subject: string, html: string): Promise<{ success: boolean; error?: string; log?: string }> => {
    console.log(`[EmailService] Request to send email to: ${to}`);

    // Trim to prevent whitespace issues (common in Copy/Paste)
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();

    // Debug Info to return to frontend
    let debugLog = `User: ${smtpUser ? 'SET' : 'MISSING'}, Pass: ${smtpPass ? 'SET' : 'MISSING'}`;

    if (!smtpUser || !smtpPass) {
        console.warn('⚠️ [Email Service] SMTP credentials missing in process.env. Skipping real send.');
        console.log(`[Mock Email Triggered] Subject: ${subject}`);
        return { success: false, error: 'SMTP credentials missing in env', log: debugLog };
    }

    try {
        console.log('[EmailService] Transporter sending...');
        // Authenticate just-in-time or ensure transporter uses trimmed values
        // Note: Transporter was init with global env. We might need to Re-create it if we want to be safe? 
        // Actually, let's create a fresh transporter per request to be 100% sure we use the TRIMMED values?
        // Or just update the global one? 
        // Better: Define transporter INSIDE sendEmail or update the outside one?
        // Let's create a localized transporter for safety if we suspect env vars are dirty.
        // BUT for efficiency, let's just assume we trim at the top.
        // Wait, the transporter uses `process.env.SMTP_USER`. We should update correct usage.

        // Let's create a new transporter here using the trimmed values to be absolutely sure.
        const secureTransporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: smtpUser, pass: smtpPass },
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 10000
        });

        const info = await secureTransporter.sendMail({
            from: smtpUser,
            to,
            subject,
            html
        });
        console.log(`✅ [Email Service] Email sent successfully! Message ID: ${info.messageId}`);
        return { success: true, log: `Sent OK. ID: ${info.messageId}` };
    } catch (error: any) {
        console.error('❌ [Email Service] FATAL ERROR:', error);
        return {
            success: false,
            error: error.message || 'Unknown SMTP Error',
            log: `Error: ${JSON.stringify(error)}`
        };
    }
};
