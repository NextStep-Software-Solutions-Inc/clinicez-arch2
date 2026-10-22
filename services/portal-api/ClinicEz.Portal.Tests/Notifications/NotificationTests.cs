using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Features.Staff.Commands;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Notifications;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Hub;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Notifications;

public class NotificationEmailRequestedHandlerTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly RecordingEmailSender _sender = new();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Facility _facility;

    public NotificationEmailRequestedHandlerTests()
    {
        _facility = new Facility { Id = Guid.NewGuid(), TenantId = _tenantId, Name = "Clinic", FacilityType = FacilityType.Clinic, Status = FacilityStatus.Active };
        _context.Facilities.Add(_facility);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private NotificationEmailRequestedHandler Handler() =>
        new(_context, new EmailTemplateRenderer(), _sender, NullLogger<NotificationEmailRequestedHandler>.Instance);

    private static Party ControlPlane => new() { Kind = PartyKind.ControlPlane, Service = InteropServices.Portal };

    private Party FacilityParty => Party.ForFacility(_tenantId.ToString(), _facility.Id.ToString(), FacilityType.Clinic);

    private static InteropMessageContext From(Party from) =>
        new(InteropEnvelope.Create(InteropTypes.NotificationEmailRequested, from, Party.Portal, Guid.NewGuid(), new NotificationEmailRequestedPayload()));

    private static NotificationEmailRequestedPayload Invitation(string to = "nurse@example.com", string inviteeName = "Nina Nurse", string? fromName = "Metro Health") => new()
    {
        To = to,
        Subject = "You've been invited",
        TemplateKey = EmailTemplateKeys.StaffInvitation,
        FromFacilityName = fromName,
        Model = new Dictionary<string, string>
        {
            ["inviteeName"] = inviteeName,
            ["workspaceName"] = "Metro Health",
            ["role"] = "Nurse",
            ["inviteUrl"] = "https://app.clinicez.test/invitations/abc123"
        }
    };

    [Fact]
    public async Task ControlPlaneRequest_RendersTheInvitationAndSendsIt()
    {
        await Handler().HandleAsync(Invitation(), From(ControlPlane), CancellationToken.None);

        var mail = Assert.Single(_sender.Sent);
        Assert.Equal("nurse@example.com", mail.To);
        Assert.Equal("You've been invited", mail.Subject);
        Assert.Equal("Metro Health", mail.FromDisplayName);
        Assert.Contains("https://app.clinicez.test/invitations/abc123", mail.HtmlBody);
        Assert.Contains("Nina Nurse", mail.HtmlBody);
        Assert.Contains("https://app.clinicez.test/invitations/abc123", mail.TextBody);
    }

    [Fact]
    public async Task ExistingFacilityOfTheTenant_IsTrusted()
    {
        await Handler().HandleAsync(Invitation(), From(FacilityParty), CancellationToken.None);

        Assert.Single(_sender.Sent);
    }

    [Fact]
    public async Task UnknownFacility_IsIgnored()
    {
        var stranger = Party.ForFacility(_tenantId.ToString(), Guid.NewGuid().ToString(), FacilityType.Clinic);

        await Handler().HandleAsync(Invitation(), From(stranger), CancellationToken.None);

        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task FacilityClaimingAnotherTenant_IsIgnored()
    {
        var spoofed = Party.ForFacility(Guid.NewGuid().ToString(), _facility.Id.ToString(), FacilityType.Clinic);

        await Handler().HandleAsync(Invitation(), From(spoofed), CancellationToken.None);

        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task DeletedFacility_IsIgnored()
    {
        _facility.IsDeleted = true;
        await _context.SaveChangesAsync();

        await Handler().HandleAsync(Invitation(), From(FacilityParty), CancellationToken.None);

        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task PatientSender_IsIgnored()
    {
        var patient = new Party { Kind = PartyKind.Patient, PatientId = Guid.NewGuid().ToString() };

        await Handler().HandleAsync(Invitation(), From(patient), CancellationToken.None);

        Assert.Empty(_sender.Sent);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-an-email")]
    [InlineData("a@example.com,b@example.com")]
    [InlineData("a@example.com;b@example.com")]
    [InlineData("Name <a@example.com>")]
    public async Task InvalidOrMultipleRecipients_AreDropped(string to)
    {
        await Handler().HandleAsync(Invitation(to), From(ControlPlane), CancellationToken.None);

        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task SubjectWithLineBreak_IsDropped_SoHeadersCannotBeInjected()
    {
        var payload = Invitation() with { Subject = "Hi\r\nBcc: attacker@example.com" };

        await Handler().HandleAsync(payload, From(ControlPlane), CancellationToken.None);

        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task UnknownTemplate_IsDropped_WithoutRetry()
    {
        var payload = Invitation() with { TemplateKey = "raw.html" };

        await Handler().HandleAsync(payload, From(ControlPlane), CancellationToken.None);

        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task InvalidInviteUrl_IsDropped()
    {
        var payload = Invitation();
        payload.Model["inviteUrl"] = "javascript:alert(1)";

        await Handler().HandleAsync(payload, From(ControlPlane), CancellationToken.None);

        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task HtmlInTheModel_IsEscaped()
    {
        await Handler().HandleAsync(Invitation(inviteeName: "<script>alert(1)</script>"), From(ControlPlane), CancellationToken.None);

        var mail = Assert.Single(_sender.Sent);
        Assert.DoesNotContain("<script>", mail.HtmlBody);
        Assert.Contains("&lt;script&gt;", mail.HtmlBody);
    }

    [Fact]
    public async Task DisplayName_CannotCarryHeaderOrMarkupCharacters()
    {
        await Handler().HandleAsync(Invitation(fromName: "Evil\r\n\"<Clinic>\""), From(ControlPlane), CancellationToken.None);

        Assert.Equal("EvilClinic", Assert.Single(_sender.Sent).FromDisplayName);
    }

    [Fact]
    public async Task SendFailure_Throws_SoTheDispatcherRetries()
    {
        _sender.FailWith = new IOException("smtp down");

        await Assert.ThrowsAsync<IOException>(() => Handler().HandleAsync(Invitation(), From(ControlPlane), CancellationToken.None));
    }

    [Fact]
    public async Task ContactMessage_RepliesGoToTheVisitor()
    {
        var payload = new NotificationEmailRequestedPayload
        {
            To = "support@clinicez.test",
            Subject = "Contact Us Message",
            TemplateKey = EmailTemplateKeys.ContactMessage,
            Model = new Dictionary<string, string> { ["name"] = "Vera", ["email"] = "vera@example.com", ["message"] = "Hello\nthere" }
        };

        await Handler().HandleAsync(payload, From(ControlPlane), CancellationToken.None);

        var mail = Assert.Single(_sender.Sent);
        Assert.Equal("support@clinicez.test", mail.To);
        Assert.Equal("vera@example.com", mail.ReplyTo);
        Assert.Contains("Hello<br />there", mail.HtmlBody);
    }
}

public class EmailTemplateRendererTests
{
    private readonly EmailTemplateRenderer _renderer = new();

    [Fact]
    public void ValueContainingAPlaceholder_IsNotExpandedASecondTime()
    {
        var model = new Dictionary<string, string>
        {
            ["inviteeName"] = "{{inviteUrl}}",
            ["workspaceName"] = "Metro",
            ["role"] = "Nurse",
            ["inviteUrl"] = "https://app.clinicez.test/invitations/t"
        };

        var mail = _renderer.Render(EmailTemplateKeys.StaffInvitation, "Subject", model);

        Assert.Contains("Hello {{inviteUrl}},", mail.Html);
    }

    [Fact]
    public void OversizedValue_IsRejected()
    {
        var model = new Dictionary<string, string>
        {
            ["name"] = "Vera",
            ["email"] = "vera@example.com",
            ["message"] = new string('x', 5001)
        };

        Assert.Throws<EmailTemplateException>(() => _renderer.Render(EmailTemplateKeys.ContactMessage, "S", model));
    }

    [Fact]
    public void MissingRequiredValue_IsRejected()
    {
        var model = new Dictionary<string, string> { ["name"] = "Vera", ["email"] = "vera@example.com" };

        Assert.Throws<EmailTemplateException>(() => _renderer.Render(EmailTemplateKeys.ContactMessage, "S", model));
    }

    [Fact]
    public void FacilityName_IsShownOnlyWhenProvided()
    {
        var model = new Dictionary<string, string>
        {
            ["inviteeName"] = "Nina",
            ["workspaceName"] = "Metro",
            ["role"] = "Nurse",
            ["inviteUrl"] = "https://app.clinicez.test/invitations/t"
        };

        Assert.DoesNotContain("Branch Assignment", _renderer.Render(EmailTemplateKeys.StaffInvitation, "S", model).Html);

        model["facilityName"] = "BGC Lab";
        Assert.Contains("Branch Assignment:</strong> BGC Lab", _renderer.Render(EmailTemplateKeys.StaffInvitation, "S", model).Html);
    }

    [Fact]
    public void PatientClaimInvitation_RendersTealBrandingAndClaimLink()
    {
        var model = new Dictionary<string, string>
        {
            ["patientName"] = "Maria Clara",
            ["facilityName"] = "St. Jude Clinic",
            ["claimUrl"] = "https://portal.clinicez.ph/join/claim?token=sample.token",
            ["ttlHours"] = "48",
            ["expiresAt"] = "2026-10-15 12:00 UTC"
        };

        var mail = _renderer.Render(EmailTemplateKeys.PatientClaimInvitation, "Your Claim Link", model);

        Assert.Contains("Hello Maria Clara", mail.Html);
        Assert.Contains("St. Jude Clinic", mail.Html);
        Assert.Contains("#0D6963", mail.Html);
        Assert.Contains("https://portal.clinicez.ph/join/claim?token=sample.token", mail.Html);
        Assert.Contains("48 hours", mail.Html);
        Assert.Contains("2026-10-15 12:00 UTC", mail.Html);

        Assert.Contains("Maria Clara", mail.Text);
        Assert.Contains("https://portal.clinicez.ph/join/claim?token=sample.token", mail.Text);
    }

    [Fact]
    public void PatientClaimInvitation_RejectsNonHttpUrl()
    {
        var model = new Dictionary<string, string>
        {
            ["patientName"] = "Maria Clara",
            ["facilityName"] = "St. Jude Clinic",
            ["claimUrl"] = "javascript:alert(1)",
            ["ttlHours"] = "48"
        };

        Assert.Throws<EmailTemplateException>(() =>
            _renderer.Render(EmailTemplateKeys.PatientClaimInvitation, "Subject", model));
    }

    [Fact]
    public void ClinicStaffInvitation_RendersClinicDetailsAndInviteUrl()
    {
        var model = new Dictionary<string, string>
        {
            ["inviteeName"] = "Dr. Jose Rizal",
            ["clinicName"] = "Manila Family Health Clinic",
            ["role"] = "Doctor",
            ["inviteUrl"] = "https://manila-family.clinic.clinicez.ph/invitations/abcdef1234567890abcdef1234567890"
        };

        var mail = _renderer.Render(EmailTemplateKeys.ClinicStaffInvitation, "Invitation to join Manila Family Health Clinic on Clinic EZ", model);

        Assert.Contains("Dr. Jose Rizal", mail.Html);
        Assert.Contains("Manila Family Health Clinic", mail.Html);
        Assert.Contains("Doctor", mail.Html);
        Assert.Contains("https://manila-family.clinic.clinicez.ph/invitations/abcdef1234567890abcdef1234567890", mail.Html);
        Assert.Contains("Dr. Jose Rizal", mail.Text);
        Assert.Contains("https://manila-family.clinic.clinicez.ph/invitations/abcdef1234567890abcdef1234567890", mail.Text);
    }
}

public class StaffInvitationEmailTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly RecordingEmailSender _sender = new();
    private readonly Guid _tenantId = Guid.NewGuid();

    public StaffInvitationEmailTests()
    {
        _context.Tenants.Add(new Tenant { Id = _tenantId, TenantSlug = "metro", Name = "Metro Clinic", OwnerId = "owner", Email = "owner@metro.ph" });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    [Fact]
    public async Task Invite_DirectlyDispatchesTheInvitationEmail_WithTheMemberTokenAndTheFrontendLink()
    {
        var handler = new InviteStaffMemberCommandHandler(
            _context,
            new Mock<ClinicEz.Portal.Application.Features.Entitlements.IEntitlementGuard>().Object,
            TestSupport.InvitationNotifier(_context, emailSender: _sender),
            TimeProvider.System);

        var result = await handler.Handle(new InviteStaffMemberCommand("metro", "biller@metro.ph", "Bob Biller", "Biller"), CancellationToken.None);

        var mail = Assert.Single(_sender.Sent);
        Assert.Equal("biller@metro.ph", mail.To);
        Assert.Contains("Metro Clinic", mail.FromDisplayName);
        Assert.Contains($"https://app.clinicez.test/invitations/{result.InvitationToken}", mail.HtmlBody);
        Assert.Contains($"https://app.clinicez.test/invitations/{result.InvitationToken}", mail.TextBody);
        Assert.Contains("Metro Clinic", mail.HtmlBody);
    }

    [Fact]
    public async Task Invite_WithoutAKnownFrontendUrl_StillInvites_ButSendsNoEmail()
    {
        var handler = new InviteStaffMemberCommandHandler(
            _context,
            new Mock<ClinicEz.Portal.Application.Features.Entitlements.IEntitlementGuard>().Object,
            TestSupport.InvitationNotifier(_context, frontendUrl: null, emailSender: _sender),
            TimeProvider.System);

        var result = await handler.Handle(new InviteStaffMemberCommand("metro", "biller@metro.ph", "Bob Biller", "Biller"), CancellationToken.None);

        Assert.Equal("Invited", result.Status);
        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task Resend_DirectlyDispatchesAnEmailWithTheFreshToken()
    {
        var member = new WorkspaceMember
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Email = "renew@metro.ph",
            FullName = "Rena Renew",
            Role = WorkspaceMemberRole.Billing,
            Status = MemberStatus.Invited,
            InvitationToken = "old",
            InvitationExpiresAt = DateTime.UtcNow.AddDays(-1),
            CreatedBy = "owner"
        };
        _context.WorkspaceMembers.Add(member);
        await _context.SaveChangesAsync();

        var result = await new ResendStaffInvitationCommandHandler(_context, TestSupport.InvitationNotifier(_context, emailSender: _sender), TimeProvider.System)
            .Handle(new ResendStaffInvitationCommand("metro", member.Id), CancellationToken.None);

        var mail = Assert.Single(_sender.Sent);
        Assert.Equal("renew@metro.ph", mail.To);
        Assert.Contains($"/invitations/{result.InvitationToken}", mail.HtmlBody);
        Assert.DoesNotContain("/old", mail.HtmlBody);
    }
}

public class SendContactMessageCommandTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly RecordingEmailSender _sender = new();

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private SendContactMessageCommandHandler Handler(string? inbox)
    {
        var settingsMock = new Mock<ISystemSettingsService>();
        settingsMock.Setup(s => s.GetSettingValueAsync("Mailer:ContactInbox", It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(inbox ?? string.Empty);

        var job = new EmailDispatchJob(new EmailTemplateRenderer(), _sender, NullLogger<EmailDispatchJob>.Instance);
        var notifications = new TestNotificationService(job);

        return new(
            _context,
            notifications,
            settingsMock.Object);
    }

    [Fact]
    public async Task ConfiguredInbox_ReceivesTheMessage_DirectlyViaEmailSender()
    {
        var accepted = await Handler(" support@clinicez.test ").Handle(
            new SendContactMessageCommand(" Vera ", "vera@example.com", " Hello there, I have a question. "), CancellationToken.None);

        Assert.True(accepted);
        var mail = Assert.Single(_sender.Sent);
        Assert.Equal("support@clinicez.test", mail.To);
        Assert.Equal("Contact Us Message", mail.Subject);
        Assert.Equal("vera@example.com", mail.ReplyTo);
        Assert.Contains("Hello there, I have a question.", mail.HtmlBody);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("  ")]
    public async Task WithoutAnInbox_NothingIsSent(string? inbox)
    {
        var accepted = await Handler(inbox).Handle(new SendContactMessageCommand("Vera", "vera@example.com", "Hello there"), CancellationToken.None);

        Assert.False(accepted);
        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public void Validator_RejectsBadEmailAndEmptyFields()
    {
        var validator = new SendContactMessageCommandValidator();

        Assert.False(validator.Validate(new SendContactMessageCommand("Vera", "nope", "Hello")).IsValid);
        Assert.False(validator.Validate(new SendContactMessageCommand("", "vera@example.com", "Hello")).IsValid);
        Assert.False(validator.Validate(new SendContactMessageCommand("Vera", "vera@example.com", "")).IsValid);
        Assert.True(validator.Validate(new SendContactMessageCommand("Vera", "vera@example.com", "Hello")).IsValid);
    }
}

public class HangfireNotificationServiceTests
{
    [Fact]
    public void EnqueueEmail_DelegatesToBackgroundJobClient_AndReturnsJobId()
    {
        var client = new TestBackgroundJobClient();
        var service = new HangfireNotificationService(client);

        var correlationId = Guid.NewGuid();
        var payload = new NotificationEmailRequestedPayload
        {
            To = "admin@example.com",
            Subject = "Test Subject",
            TemplateKey = EmailTemplateKeys.AdminInvitation,
            Model = new Dictionary<string, string> { ["role"] = "Admin" }
        };

        var jobId = service.EnqueueEmail(payload, correlationId);

        Assert.NotNull(jobId);
        Assert.Single(client.EnqueuedJobs);
    }
}

public class EmailDispatchJobTests
{
    [Fact]
    public async Task SendEmailAsync_RendersTemplateAndDispatchesViaEmailSender()
    {
        var sender = new RecordingEmailSender();
        var job = new EmailDispatchJob(new EmailTemplateRenderer(), sender, NullLogger<EmailDispatchJob>.Instance);

        await job.SendEmailAsync(
            new NotificationEmailRequestedPayload
            {
                To = "admin@example.com",
                Subject = "Contact Message",
                TemplateKey = EmailTemplateKeys.ContactMessage,
                Model = new Dictionary<string, string>
                {
                    ["name"] = "Alice",
                    ["email"] = "alice@example.com",
                    ["message"] = "Test contact body"
                }
            },
            Guid.NewGuid(),
            CancellationToken.None);

        var mail = Assert.Single(sender.Sent);
        Assert.Equal("admin@example.com", mail.To);
        Assert.Equal("Contact Message", mail.Subject);
        Assert.Equal("alice@example.com", mail.ReplyTo);
        Assert.Contains("Test contact body", mail.HtmlBody);
    }

    [Fact]
    public async Task SendEmailAsync_InvalidRecipientOrSubject_IsDroppedWithoutThrowing()
    {
        var sender = new RecordingEmailSender();
        var job = new EmailDispatchJob(new EmailTemplateRenderer(), sender, NullLogger<EmailDispatchJob>.Instance);

        await job.SendEmailAsync(
            new NotificationEmailRequestedPayload
            {
                To = "not-an-email",
                Subject = "Bad Recipient",
                TemplateKey = EmailTemplateKeys.ContactMessage
            },
            Guid.NewGuid(),
            CancellationToken.None);

        Assert.Empty(sender.Sent);
    }

    [Fact]
    public async Task SendEmailAsync_SmtpFailure_ThrowsException_ToTriggerHangfireRetry()
    {
        var sender = new RecordingEmailSender { FailWith = new InvalidOperationException("SMTP connection timeout") };
        var job = new EmailDispatchJob(new EmailTemplateRenderer(), sender, NullLogger<EmailDispatchJob>.Instance);

        var payload = new NotificationEmailRequestedPayload
        {
            To = "admin@example.com",
            Subject = "Contact Message",
            TemplateKey = EmailTemplateKeys.ContactMessage,
            Model = new Dictionary<string, string>
            {
                ["name"] = "Alice",
                ["email"] = "alice@example.com",
                ["message"] = "Test contact body"
            }
        };

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            job.SendEmailAsync(payload, Guid.NewGuid(), CancellationToken.None));

        Assert.Equal("SMTP connection timeout", ex.Message);
    }
}

public class SmtpOptionsTests
{
    [Fact]
    public void LogMode_IsOnlyAllowedInDevelopment()
    {
        var options = new SmtpOptions { Mode = SmtpMode.Log };

        Assert.Null(options.FindProblem(isDevelopment: true));
        Assert.NotNull(options.FindProblem(isDevelopment: false));
    }

    [Fact]
    public void SmtpMode_HasNoStaticMailerParameters_OnlyCredentialsAndMode()
    {
        var options = new SmtpOptions { Mode = SmtpMode.Smtp, User = "resend", Password = "secret-password" };
        Assert.Null(options.FindProblem(false));
    }

    [Fact]
    public async Task LogSender_WritesTheEmailToTheLogAndSendsNothing()
    {
        var logger = new CapturingLogger<LogEmailSender>();

        await new LogEmailSender(logger).SendAsync(new EmailMessage("a@example.com", "Subject", "<p>x</p>", "plain body"), CancellationToken.None);

        var line = Assert.Single(logger.Messages);
        Assert.Contains("a@example.com", line);
        Assert.Contains("plain body", line);
    }
}

public class SmtpEmailSenderTests
{
    [Fact]
    public async Task SendAsync_ThrowsWhenHostIsNotConfiguredInPlatformSettings()
    {
        var options = Microsoft.Extensions.Options.Options.Create(new SmtpOptions());
        var settingsMock = new Mock<ISystemSettingsService>();
        settingsMock.Setup(s => s.GetSettingValueAsync("Mailer:SmtpHost", It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(string.Empty);
        var sender = new SmtpEmailSender(options, settingsMock.Object);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            sender.SendAsync(new EmailMessage("test@example.com", "Sub", "<p>hi</p>", "hi"), CancellationToken.None));

        Assert.Contains("SMTP host is not configured", ex.Message);
        Assert.Contains("Platform Settings", ex.Message);
    }

    [Fact]
    public async Task SendAsync_ThrowsWhenFromEmailIsNotConfiguredInPlatformSettings()
    {
        var options = Microsoft.Extensions.Options.Options.Create(new SmtpOptions());
        var settingsMock = new Mock<ISystemSettingsService>();
        settingsMock.Setup(s => s.GetSettingValueAsync("Mailer:SmtpHost", It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("smtp.resend.com");
        settingsMock.Setup(s => s.GetSettingValueAsync("Mailer:SmtpFromEmail", It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(string.Empty);
        var sender = new SmtpEmailSender(options, settingsMock.Object);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            sender.SendAsync(new EmailMessage("test@example.com", "Sub", "<p>hi</p>", "hi"), CancellationToken.None));

        Assert.Contains("SMTP sender email is not configured", ex.Message);
        Assert.Contains("Platform Settings", ex.Message);
    }
}
