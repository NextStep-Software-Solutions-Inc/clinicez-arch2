using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Notifications;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Services;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.Notifications;

public class ResendSmtpIntegrationTests : IDisposable
{
    private static readonly string? ResendApiKey = Environment.GetEnvironmentVariable("RESEND_API_KEY");
    private const string ResendSmtpHost = "smtp.resend.com";
    private const int ResendSmtpPort = 587;
    private const string ResendFromEmail = "onboarding@resend.dev";
    private const string ResendTestRecipient = "delivered@resend.dev";

    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly SmtpEmailSender? _smtpSender;
    private readonly EmailTemplateRenderer _renderer = new();

    public ResendSmtpIntegrationTests()
    {
        if (string.IsNullOrEmpty(ResendApiKey)) return;

        var options = Options.Create(new SmtpOptions
        {
            Mode = SmtpMode.Smtp,
            User = "resend",
            Password = ResendApiKey
        });

        _context.SystemSettings.AddRange(
            new SystemSetting { Key = "Mailer:SmtpHost", Value = ResendSmtpHost, Category = "Mailer", Description = "", UpdatedAt = DateTime.UtcNow, UpdatedBy = "Test" },
            new SystemSetting { Key = "Mailer:SmtpPort", Value = ResendSmtpPort.ToString(), Category = "Mailer", Description = "", UpdatedAt = DateTime.UtcNow, UpdatedBy = "Test" },
            new SystemSetting { Key = "Mailer:SmtpSecurity", Value = "StartTls", Category = "Mailer", Description = "", UpdatedAt = DateTime.UtcNow, UpdatedBy = "Test" },
            new SystemSetting { Key = "Mailer:SmtpFromEmail", Value = ResendFromEmail, Category = "Mailer", Description = "", UpdatedAt = DateTime.UtcNow, UpdatedBy = "Test" },
            new SystemSetting { Key = "Mailer:SmtpFromName", Value = "Clinic EZ Testing", Category = "Mailer", Description = "", UpdatedAt = DateTime.UtcNow, UpdatedBy = "Test" }
        );
        _context.SaveChanges();

        var settingsService = new SystemSettingsService(
            _context,
            new Microsoft.Extensions.Caching.Memory.MemoryCache(new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions()),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<SystemSettingsService>.Instance);

        _smtpSender = new SmtpEmailSender(options, settingsService);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task ResendSmtp_SendStaffInvitation_DeliversSuccessfully()
    {
        if (_smtpSender == null) return;
        var model = new Dictionary<string, string>
        {
            ["inviteeName"] = "Dr. Maria Santos",
            ["workspaceName"] = "Metro Health Medical Center",
            ["role"] = "Attending Physician",
            ["inviteUrl"] = "https://clinicez.com/accept-invitation?token=test-invite-token-12345",
            ["facilityName"] = "Main Branch - Makati"
        };

        var rendered = _renderer.Render(EmailTemplateKeys.StaffInvitation, "Join Metro Health on Clinic EZ", model);

        var message = new EmailMessage(
            To: ResendTestRecipient,
            Subject: "Staff Invitation: Join Metro Health on Clinic EZ",
            HtmlBody: rendered.Html,
            TextBody: rendered.Text,
            FromDisplayName: "Metro Health Admin"
        );

        // Act & Assert: This sends directly through our SmtpEmailSender to Resend SMTP
        await _smtpSender.SendAsync(message, CancellationToken.None);
    }

    [Fact]
    public async Task ResendSmtp_SendPatientClaimInvitation_DeliversSuccessfully()
    {
        if (_smtpSender == null) return;
        var model = new Dictionary<string, string>
        {
            ["patientName"] = "Juan Dela Cruz",
            ["facilityName"] = "Metro Health Outpatient Clinic",
            ["claimUrl"] = "https://patient.clinicez.com/claim?token=secure-hmac-claim-token-67890",
            ["ttlHours"] = "48",
            ["expiresAt"] = "in 48 hours"
        };

        var rendered = _renderer.Render(EmailTemplateKeys.PatientClaimInvitation, "Claim your Clinic EZ Patient Account", model);

        var message = new EmailMessage(
            To: ResendTestRecipient,
            Subject: "Your Digital Health Records: Claim your Clinic EZ Patient Account",
            HtmlBody: rendered.Html,
            TextBody: rendered.Text,
            FromDisplayName: "Clinic EZ Patient Care"
        );

        await _smtpSender.SendAsync(message, CancellationToken.None);
    }

    [Fact]
    public async Task ResendSmtp_SendContactMessage_DeliversSuccessfully()
    {
        if (_smtpSender == null) return;
        var model = new Dictionary<string, string>
        {
            ["name"] = "Dr. Roberto Reyes",
            ["email"] = "roberto@example.com",
            ["message"] = "We are interested in setting up Clinic EZ for our multi-specialty clinic network."
        };

        var rendered = _renderer.Render(EmailTemplateKeys.ContactMessage, "Inquiry from Dr. Roberto Reyes", model);

        var message = new EmailMessage(
            To: ResendTestRecipient,
            Subject: "Inquiry from Dr. Roberto Reyes",
            HtmlBody: rendered.Html,
            TextBody: rendered.Text,
            FromDisplayName: "Clinic EZ Website",
            ReplyTo: rendered.ReplyTo
        );

        await _smtpSender.SendAsync(message, CancellationToken.None);
    }

    [Fact]
    public async Task ResendSmtp_FullInteropNotificationHandler_DeliversSuccessfully()
    {
        if (_smtpSender == null) return;
        var handler = new NotificationEmailRequestedHandler(
            _context,
            _renderer,
            _smtpSender,
            NullLogger<NotificationEmailRequestedHandler>.Instance);

        var payload = new NotificationEmailRequestedPayload
        {
            To = ResendTestRecipient,
            Subject = "Staff Invitation via Interop Hub",
            TemplateKey = EmailTemplateKeys.StaffInvitation,
            FromFacilityName = "Metro Health Hub",
            Model = new Dictionary<string, string>
            {
                ["inviteeName"] = "Nurse Joyce",
                ["workspaceName"] = "Metro Health",
                ["role"] = "Head Nurse",
                ["inviteUrl"] = "https://clinicez.com/invitations/hub-test-999"
            }
        };

        var interopMessage = new InteropMessageContext(
            InteropEnvelope.Create(
                InteropTypes.NotificationEmailRequested,
                Party.Portal,
                Party.Portal,
                Guid.NewGuid(),
                payload));

        // Act: Full handler flow through interop dispatcher
        await handler.HandleAsync(payload, interopMessage, CancellationToken.None);
    }
}
