using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.RegularExpressions;

namespace ClinicEz.Portal.Application.Features.Notifications;

public static class EmailTemplateKeys
{
    public const string StaffInvitation = "staff.invitation";
    public const string ContactMessage = "contact.message";
    public const string PatientClaimInvitation = "patient.claim.invitation";
    public const string AdminInvitation = "admin.invitation";
    public const string ClinicStaffInvitation = "clinic.staff.invitation";
    public const string ClinicStaffPasswordReset = "clinic.staff.password_reset";
}

/// <param name="ReplyTo">Where a reply should go, when the template knows (for example the visitor of the contact form).</param>
public sealed record RenderedEmail(string Html, string Text, string? ReplyTo = null);

/// <summary>The request cannot be turned into an email (unknown template, missing or invalid value). Retrying will not help.</summary>
public sealed class EmailTemplateException(string message) : Exception(message);

/// <summary>
/// Renders the registered email templates. Every model value is HTML-encoded, links must be absolute http(s) URLs,
/// and a requester can only pick a template, never supply markup of its own.
/// </summary>
public interface IEmailTemplateRenderer
{
    /// <exception cref="EmailTemplateException">Unknown template, or a required value is missing or invalid.</exception>
    RenderedEmail Render(string templateKey, string subject, IReadOnlyDictionary<string, string> model);
}

public sealed partial class EmailTemplateRenderer : IEmailTemplateRenderer
{
    private const int MaxValueLength = 5000;

    public RenderedEmail Render(string templateKey, string subject, IReadOnlyDictionary<string, string> model)
    {
        foreach (var (key, value) in model)
        {
            if (value.Length > MaxValueLength)
            {
                throw new EmailTemplateException($"Template value '{key}' is longer than {MaxValueLength} characters.");
            }
        }

        return templateKey switch
        {
            EmailTemplateKeys.StaffInvitation => RenderStaffInvitation(subject, model),
            EmailTemplateKeys.ContactMessage => RenderContactMessage(subject, model),
            EmailTemplateKeys.PatientClaimInvitation => RenderPatientClaimInvitation(subject, model),
            EmailTemplateKeys.AdminInvitation => RenderAdminInvitation(subject, model),
            EmailTemplateKeys.ClinicStaffInvitation => RenderClinicStaffInvitation(subject, model),
            EmailTemplateKeys.ClinicStaffPasswordReset => RenderClinicStaffPasswordReset(subject, model),
            _ => throw new EmailTemplateException($"Unknown email template '{templateKey}'.")
        };
    }

    private static RenderedEmail RenderStaffInvitation(string subject, IReadOnlyDictionary<string, string> model)
    {
        var inviteeName = Required(model, "inviteeName");
        var workspaceName = Required(model, "workspaceName");
        var role = Required(model, "role");
        var inviteUrl = RequiredHttpUrl(model, "inviteUrl");
        var facilityName = Optional(model, "facilityName");

        var facilityNote = facilityName is null
            ? string.Empty
            : $"""<p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Branch Assignment:</strong> {Encode(facilityName)}</p>""";

        var html = Fill(StaffInvitationHtml, new Dictionary<string, string>
        {
            ["subject"] = Encode(subject),
            ["inviteeName"] = Encode(inviteeName),
            ["workspaceName"] = Encode(workspaceName),
            ["role"] = Encode(role),
            ["facilityNote"] = facilityNote,
            ["inviteUrl"] = Encode(inviteUrl)
        });

        var text = $"""
            Hello {inviteeName},

            You have been invited by {workspaceName} to join their clinical team on Clinic EZ as a {role}.

            Accept your invitation by visiting:
            {inviteUrl}

            This invitation will expire in 7 days.
            """;

        return new RenderedEmail(html, text);
    }

    private static RenderedEmail RenderContactMessage(string subject, IReadOnlyDictionary<string, string> model)
    {
        var name = Required(model, "name");
        var email = Required(model, "email");
        var message = Required(model, "message");

        var html = Fill(ContactMessageHtml, new Dictionary<string, string>
        {
            ["subject"] = Encode(subject),
            ["name"] = Encode(name),
            ["email"] = Encode(email),
            ["message"] = Encode(message).ReplaceLineEndings("<br />")
        });

        var text = $"Name: {name}\nEmail: {email}\nMessage: {message}";

        var replyTo = MailAddress.TryCreate(email, out var parsed) && parsed.Address == email.Trim() ? parsed.Address : null;
        return new RenderedEmail(html, text, replyTo);
    }

    private static RenderedEmail RenderPatientClaimInvitation(string subject, IReadOnlyDictionary<string, string> model)
    {
        var patientName = Required(model, "patientName");
        var facilityName = Required(model, "facilityName");
        var claimUrl = RequiredHttpUrl(model, "claimUrl");
        var ttlHours = Optional(model, "ttlHours") ?? "48";
        var expiresAt = Optional(model, "expiresAt") ?? "in 48 hours";

        var html = Fill(PatientClaimInvitationHtml, new Dictionary<string, string>
        {
            ["subject"] = Encode(subject),
            ["patientName"] = Encode(patientName),
            ["facilityName"] = Encode(facilityName),
            ["claimUrl"] = Encode(claimUrl),
            ["ttlHours"] = Encode(ttlHours),
            ["expiresAt"] = Encode(expiresAt)
        });

        var text = $"""
            Hello {patientName},

            Thank you for registering at {facilityName}.

            You can claim your permanent Clinic EZ Patient Account in 1-click by visiting:
            {claimUrl}

            This link is cryptographically signed and expires {expiresAt} (in {ttlHours} hours).

            Claiming your account allows you to track your queue status in real-time, access digital e-prescriptions and lab results, and check-in instantly at all Clinic EZ facilities.
            """;

        return new RenderedEmail(html, text);
    }

    private static string Required(IReadOnlyDictionary<string, string> model, string key) =>
        Optional(model, key) ?? throw new EmailTemplateException($"Template value '{key}' is required.");

    private static string? Optional(IReadOnlyDictionary<string, string> model, string key) =>
        model.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value) ? value.Trim() : null;

    private static string RequiredHttpUrl(IReadOnlyDictionary<string, string> model, string key)
    {
        var value = Required(model, key);
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
        {
            throw new EmailTemplateException($"Template value '{key}' must be an absolute http(s) URL.");
        }

        return uri.AbsoluteUri;
    }

    private static string Encode(string value) => WebUtility.HtmlEncode(value);

    /// <summary>Single pass, so a value that happens to contain <c>{{token}}</c> is never expanded again.</summary>
    private static string Fill(string template, IReadOnlyDictionary<string, string> values) =>
        PlaceholderPattern().Replace(template, match =>
            values.TryGetValue(match.Groups[1].Value, out var value) ? value : match.Value);

    [GeneratedRegex(@"\{\{(\w+)\}\}")]
    private static partial Regex PlaceholderPattern();

    private const string StaffInvitationHtml = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{{subject}}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <!-- Header -->
            <tr>
              <td style="padding: 32px 32px 20px 32px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Clinic EZ</h1>
                <p style="color: #e0e7ff; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Clinical Operations &amp; Healthcare Platform</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 32px;">
                <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 0 0 16px 0;">
                  Hello {{inviteeName}},
                </h2>
                <p style="font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 20px 0;">
                  You have been invited by the administration of <strong>{{workspaceName}}</strong> to join their workspace team on Clinic EZ.
                </p>

                <!-- Details Card -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                  <tr>
                    <td>
                      <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Workspace:</strong> {{workspaceName}}</p>
                      <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Assigned Role:</strong> {{role}}</p>
                      {{facilityNote}}
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
                      <a href="{{inviteUrl}}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3);">
                        Accept &amp; Join Workspace &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Link Fallback -->
                <p style="font-size: 12px; color: #94a3b8; line-height: 18px; margin: 32px 0 0 0; word-break: break-all;">
                  Or copy and paste this link into your browser:<br />
                  <a href="{{inviteUrl}}" style="color: #4f46e5; text-decoration: underline;">{{inviteUrl}}</a>
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
        """;

    private const string ContactMessageHtml = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>{{subject}}</title>
        </head>
        <body>
          <p>Name: {{name}}</p>
          <p>Email: {{email}}</p>
          <p>Message: {{message}}</p>
        </body>
        </html>
        """;

    private const string PatientClaimInvitationHtml = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{{subject}}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <!-- Teal Header -->
            <tr>
              <td style="padding: 32px 32px 20px 32px; background: linear-gradient(135deg, #0D6963 0%, #084c47 100%); text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Clinic EZ</h1>
                <p style="color: #ccfbf1; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Patient Health Records &amp; Clinic Portal</p>
              </td>
            </tr>

            <!-- Content Body -->
            <tr>
              <td style="padding: 32px;">
                <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 0 0 16px 0;">Hello {{patientName}},</h2>
                <p style="font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 20px 0;">
                  Your intake registration at <strong>{{facilityName}}</strong> was received. You can now claim your permanent Clinic EZ Patient Account to access test results, e-prescriptions, and fast-track future check-ins.
                </p>

                <!-- CTA -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                  <tr>
                    <td align="center">
                      <a href="{{claimUrl}}" target="_blank" style="display: inline-block; background-color: #0D6963; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 4px rgba(13, 105, 99, 0.3);">
                        Claim My Patient Account &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Link Fallback -->
                <p style="font-size: 12px; color: #94a3b8; line-height: 18px; margin: 24px 0 0 0; word-break: break-all;">
                  Or copy and paste this link into your browser:<br />
                  <a href="{{claimUrl}}" style="color: #0D6963; text-decoration: underline;">{{claimUrl}}</a>
                </p>

                <!-- Notice -->
                <p style="font-size: 12px; color: #64748b; line-height: 18px; margin: 24px 0 0 0; text-align: center;">
                  This secure claim link expires in <strong>{{ttlHours}} hours</strong> ({{expiresAt}}).
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                  If you did not register at {{facilityName}}, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """;

    private static RenderedEmail RenderAdminInvitation(string subject, IReadOnlyDictionary<string, string> model)
    {
        var inviteeName = Required(model, "inviteeName");
        var role = Required(model, "role");
        var inviteUrl = RequiredHttpUrl(model, "inviteUrl");
        var inviterName = Optional(model, "inviterName");

        var inviterNote = inviterName is null
            ? "The platform administration"
            : Encode(inviterName);

        var html = Fill(AdminInvitationHtml, new Dictionary<string, string>
        {
            ["subject"] = Encode(subject),
            ["inviteeName"] = Encode(inviteeName),
            ["role"] = Encode(role),
            ["inviterNote"] = inviterNote,
            ["inviteUrl"] = Encode(inviteUrl)
        });

        var text = $"""
            Hello {inviteeName},

            You have been invited by {inviterNote} to join the Clinic EZ Platform Administration as {role}.

            Accept your invitation by visiting:
            {inviteUrl}

            This invitation will expire in 7 days.
            """;

        return new RenderedEmail(html, text);
    }

    private const string AdminInvitationHtml = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{{subject}}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <!-- Teal Header -->
            <tr>
              <td style="padding: 32px 32px 20px 32px; background: linear-gradient(135deg, #0D6963 0%, #084c47 100%); text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Clinic EZ</h1>
                <p style="color: #ccfbf1; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Platform Administration &amp; Governance</p>
              </td>
            </tr>

            <!-- Content Body -->
            <tr>
              <td style="padding: 32px;">
                <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 0 0 16px 0;">
                  Hello {{inviteeName}},
                </h2>
                <p style="font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 20px 0;">
                  You have been invited by {{inviterNote}} to join the <strong>Clinic EZ Platform Administration</strong> team.
                </p>

                <!-- Details Card -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                  <tr>
                    <td>
                      <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Target Domain:</strong> Clinic EZ Main Portal</p>
                      <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Administrative Role:</strong> {{role}}</p>
                    </td>
                  </tr>
                </table>

                <p style="font-size: 14px; line-height: 22px; color: #475569; margin: 0 0 28px 0;">
                  Click the button below to accept your invitation and activate your administrative console access. You can sign in with your existing account or create a new one.
                </p>

                <!-- CTA Button -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center">
                      <a href="{{inviteUrl}}" target="_blank" style="display: inline-block; background-color: #0D6963; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 4px rgba(13, 105, 99, 0.3);">
                        Accept Admin Invitation &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Link Fallback -->
                <p style="font-size: 12px; color: #94a3b8; line-height: 18px; margin: 32px 0 0 0; word-break: break-all;">
                  Or copy and paste this link into your browser:<br />
                  <a href="{{inviteUrl}}" style="color: #0D6963; text-decoration: underline;">{{inviteUrl}}</a>
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
        """;

    private static RenderedEmail RenderClinicStaffInvitation(string subject, IReadOnlyDictionary<string, string> model)
    {
        var inviteeName = Required(model, "inviteeName");
        var clinicName = Optional(model, "clinicName") ?? Optional(model, "workspaceName") ?? Optional(model, "facilityName") ?? "Clinic EZ";
        var role = Required(model, "role");
        var inviteUrl = RequiredHttpUrl(model, "inviteUrl");

        var html = Fill(ClinicStaffInvitationHtml, new Dictionary<string, string>
        {
            ["subject"] = Encode(subject),
            ["inviteeName"] = Encode(inviteeName),
            ["clinicName"] = Encode(clinicName),
            ["role"] = Encode(role),
            ["inviteUrl"] = Encode(inviteUrl)
        });

        var text = $"""
            Hello {inviteeName},

            You have been invited by {clinicName} to join their clinical team on Clinic EZ as {role}.

            Accept your invitation and set up your workstation password by visiting:
            {inviteUrl}

            This invitation will expire in 7 days.
            """;

        return new RenderedEmail(html, text);
    }

    private const string ClinicStaffInvitationHtml = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{{subject}}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <!-- Teal Header -->
            <tr>
              <td style="padding: 32px 32px 20px 32px; background: linear-gradient(135deg, #0D6963 0%, #084c47 100%); text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Clinic EZ</h1>
                <p style="color: #ccfbf1; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Clinical Operations &amp; Practice Management</p>
              </td>
            </tr>

            <!-- Content Body -->
            <tr>
              <td style="padding: 32px;">
                <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 0 0 16px 0;">
                  Hello {{inviteeName}},
                </h2>
                <p style="font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 20px 0;">
                  You have been invited by <strong>{{clinicName}}</strong> to join their clinical team on Clinic EZ as a <strong>{{role}}</strong>.
                </p>

                <!-- Details Card -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                  <tr>
                    <td>
                      <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Clinic / Healthcare Facility:</strong> {{clinicName}}</p>
                      <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Assigned Role:</strong> {{role}}</p>
                    </td>
                  </tr>
                </table>

                <p style="font-size: 14px; line-height: 22px; color: #475569; margin: 0 0 28px 0;">
                  Click the button below to accept your invitation, review your facility details, and create your workstation password.
                </p>

                <!-- CTA Button -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center">
                      <a href="{{inviteUrl}}" target="_blank" style="display: inline-block; background-color: #0D6963; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 4px rgba(13, 105, 99, 0.3);">
                        Accept Invitation &amp; Set Password &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Link Fallback -->
                <p style="font-size: 12px; color: #94a3b8; line-height: 18px; margin: 32px 0 0 0; word-break: break-all;">
                  Or copy and paste this link into your browser:<br />
                  <a href="{{inviteUrl}}" style="color: #0D6963; text-decoration: underline;">{{inviteUrl}}</a>
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
        """;

    private static RenderedEmail RenderClinicStaffPasswordReset(string subject, IReadOnlyDictionary<string, string> model)
    {
        var staffName = Optional(model, "staffName") ?? Required(model, "inviteeName");
        var clinicName = Optional(model, "clinicName") ?? Optional(model, "workspaceName") ?? Optional(model, "facilityName") ?? "Clinic EZ";
        var role = Optional(model, "role") ?? "Staff Member";
        var resetUrlKey = model.ContainsKey("resetUrl") ? "resetUrl" : "inviteUrl";
        var resetUrl = RequiredHttpUrl(model, resetUrlKey);

        var html = Fill(ClinicStaffPasswordResetHtml, new Dictionary<string, string>
        {
            ["subject"] = Encode(subject),
            ["staffName"] = Encode(staffName),
            ["clinicName"] = Encode(clinicName),
            ["role"] = Encode(role),
            ["resetUrl"] = Encode(resetUrl)
        });

        var text = $"""
            Hello {staffName},

            An administrator at {clinicName} has initiated a password reset for your Clinic EZ workstation account ({role}).

            Set your new workstation password by visiting:
            {resetUrl}

            This password reset link will expire in 7 days.
            """;

        return new RenderedEmail(html, text);
    }

    private const string ClinicStaffPasswordResetHtml = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{{subject}}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <!-- Teal Header -->
            <tr>
              <td style="padding: 32px 32px 20px 32px; background: linear-gradient(135deg, #0D6963 0%, #084c47 100%); text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Clinic EZ</h1>
                <p style="color: #ccfbf1; margin: 6px 0 0 0; font-size: 13px; font-weight: 500;">Clinical Operations &amp; Practice Management</p>
              </td>
            </tr>

            <!-- Content Body -->
            <tr>
              <td style="padding: 32px;">
                <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 0 0 16px 0;">
                  Hello {{staffName}},
                </h2>
                <p style="font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 20px 0;">
                  An administrator at <strong>{{clinicName}}</strong> has initiated a password reset for your Clinic EZ workstation account.
                </p>

                <!-- Details Card -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #f1f5f9; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                  <tr>
                    <td>
                      <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Clinic / Healthcare Facility:</strong> {{clinicName}}</p>
                      <p style="margin: 4px 0; color: #475569; font-size: 14px;"><strong>Assigned Role:</strong> {{role}}</p>
                    </td>
                  </tr>
                </table>

                <p style="font-size: 14px; line-height: 22px; color: #475569; margin: 0 0 28px 0;">
                  Click the button below to create a new workstation password and sign in.
                </p>

                <!-- CTA Button -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center">
                      <a href="{{resetUrl}}" target="_blank" style="display: inline-block; background-color: #0D6963; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 4px rgba(13, 105, 99, 0.3);">
                        Set New Workstation Password &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Link Fallback -->
                <p style="font-size: 12px; color: #94a3b8; line-height: 18px; margin: 32px 0 0 0; word-break: break-all;">
                  Or copy and paste this link into your browser:<br />
                  <a href="{{resetUrl}}" style="color: #0D6963; text-decoration: underline;">{{resetUrl}}</a>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0;">
                  This password reset link expires in <strong>7 days</strong>.
                </p>
                <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                  If you did not request or expect this password reset, please contact your clinic administrator.
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """;
}
