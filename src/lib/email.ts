import { env } from "@/lib/env";

/**
 * Thin email helper.
 *
 * Uses Resend when RESEND_API_KEY is set.
 * Falls back to console.log in development — no dependency needed.
 *
 * To enable real emails:
 *   1. Sign up at https://resend.com (free tier: 3,000 emails/month)
 *   2. Add RESEND_API_KEY to .env
 *   3. Run: npm install resend
 */

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // Dev fallback — log to console so the link is accessible without email setup
    console.log(`\n📧 [EMAIL — dev fallback, set RESEND_API_KEY to send real emails]`);
    console.log(`   To:      ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body:    ${text}\n`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

export function verificationEmailHtml(verifyUrl: string, name: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,sans-serif;background:#060B18;color:#EFF3FA;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:#0D1425;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:40px;">
    <h1 style="font-size:22px;font-weight:700;margin:0 0 8px;">Verify your email</h1>
    <p style="color:#7E8FA8;margin:0 0 32px;font-size:14px;line-height:1.6;">
      Hi ${name}, click the button below to verify your DocMind account.
      This link expires in <strong style="color:#EFF3FA;">24 hours</strong>.
    </p>
    <a href="${verifyUrl}"
       style="display:inline-block;background:#6366F1;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;font-size:14px;">
      Verify email address
    </a>
    <p style="color:#4A5568;font-size:12px;margin:24px 0 0;line-height:1.6;">
      If you didn't create an account, you can safely ignore this email.<br/>
      Or copy this link: <span style="color:#6366F1;">${verifyUrl}</span>
    </p>
  </div>
</body>
</html>`;
}
