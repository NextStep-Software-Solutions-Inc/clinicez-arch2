"use server";

import nodemailer from "nodemailer";

interface SendMailPayload {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

interface StaffInvitationEmailPayload {
  to: string;
  inviteeName: string;
  workspaceName: string;
  role: string;
  facilityName?: string | null;
  inviteUrl: string;
}

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

  if (!host || !user) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass: pass || "",
    },
  });
};

export const sendMail = async (payload: SendMailPayload): Promise<boolean> => {
  const transporter = getTransporter();
  const fromEmail = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER || "no-reply@clinicez.net";
  const fromName = process.env.MAIL_FROM_NAME || "Clinic EZ";

  if (!transporter) {
    console.warn(`[SMTP] Email transport not configured (SMTP_HOST or SMTP_USER missing). Skipping delivery to: ${payload.to}`);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.text || "",
      html: payload.html || payload.text || "",
    });
    return true;
  } catch (err) {
    console.error(`[SMTP] Failed to send email to ${payload.to}:`, err);
    return false;
  }
};

export const sendStaffInvitationMail = async (payload: StaffInvitationEmailPayload): Promise<boolean> => {
  const subject = `You've been invited to join ${payload.workspaceName} on ClinicEZ`;
  const facilityNote = payload.facilityName ? `<p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Branch Assignment:</strong> ${payload.facilityName}</p>` : "";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <!-- Header -->
    <tr>
      <td style="padding: 32px 32px 20px 32px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">ClinicEZ</h1>
        <p style="color: #e0e7ff; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Clinical Operations & Healthcare Platform</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding: 32px;">
        <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 0 0 16px 0;">
          Hello ${payload.inviteeName},
        </h2>
        <p style="font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 20px 0;">
          You have been invited by the administration of <strong>${payload.workspaceName}</strong> to join their workspace team on ClinicEZ.
        </p>

        <!-- Details Card -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <tr>
            <td>
              <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Workspace:</strong> ${payload.workspaceName}</p>
              <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Assigned Role:</strong> ${payload.role}</p>
              ${facilityNote}
            </td>
          </tr>
        </table>

        <p style="font-size: 14px; line-height: 22px; color: #475569; margin: 0 0 28px 0;">
          Click the button below to review and accept your invitation. You can sign in using your existing account or create a new one in seconds.
        </p>

        <!-- CTA Button -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center">
              <a href="${payload.inviteUrl}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3);">
                Accept &amp; Join Workspace &rarr;
              </a>
            </td>
          </tr>
        </table>

        <!-- Link Fallback -->
        <p style="font-size: 12px; color: #94a3b8; line-height: 18px; margin: 32px 0 0 0; word-break: break-all;">
          Or copy and paste this link into your browser:<br />
          <a href="${payload.inviteUrl}" style="color: #4f46e5; text-decoration: underline;">${payload.inviteUrl}</a>
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
        <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0;">
          This invitation expires in <strong>7 days</strong>.
        </p>
        <p style="font-size: 11px; color: #94a3b8; margin: 0;">
          If you did not expect this invitation, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = `
Hello ${payload.inviteeName},

You have been invited by ${payload.workspaceName} to join their clinical team on ClinicEZ as a ${payload.role}.

Accept your invitation by visiting:
${payload.inviteUrl}

This invitation will expire in 7 days.
`;

  return sendMail({
    to: payload.to,
    subject,
    text,
    html,
  });
};
