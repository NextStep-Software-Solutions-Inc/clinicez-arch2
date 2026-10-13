using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Portal.Application.Features.Staff.Commands;
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

internal sealed class RecordingEmailSender : IEmailSender
{
    public List<EmailMessage> Sent { get; } = [];
    public Exception? FailWith { get; set; }

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        if (FailWith is not null) throw FailWith;
        Sent.Add(message);
        return Task.CompletedTask;
    }
}

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
}

public class StaffInvitationEmailTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
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
    public async Task Invite_StagesTheInvitationEmail_WithTheMemberTokenAndTheFrontendLink()
    {
        var handler = new InviteStaffMemberCommandHandler(_context, new Mock<ClinicEz.Portal.Application.Features.Entitlements.IEntitlementGuard>().Object, TestSupport.InvitationNotifier(_context), TimeProvider.System);

        var result = await handler.Handle(new InviteStaffMemberCommand("metro", "biller@metro.ph", "Bob Biller", "Biller"), CancellationToken.None);

        var envelope = Assert.Single(TestSupport.Outbox(_context, InteropTypes.NotificationEmailRequested));
        Assert.Equal(Party.Portal, envelope.From);
        Assert.Equal(Party.Portal, envelope.To);
        var payload = envelope.GetPayload<NotificationEmailRequestedPayload>();
        Assert.Equal("biller@metro.ph", payload.To);
        Assert.Equal(EmailTemplateKeys.StaffInvitation, payload.TemplateKey);
        Assert.Equal($"https://app.clinicez.test/invitations/{result.InvitationToken}", payload.Model["inviteUrl"]);
        Assert.Equal("Metro Clinic", payload.Model["workspaceName"]);
    }

    [Fact]
    public async Task Invite_WithoutAKnownFrontendUrl_StillInvites_ButQueuesNoEmail()
    {
        var handler = new InviteStaffMemberCommandHandler(
            _context,
            new Mock<ClinicEz.Portal.Application.Features.Entitlements.IEntitlementGuard>().Object,
            TestSupport.InvitationNotifier(_context, frontendUrl: null),
            TimeProvider.System);

        var result = await handler.Handle(new InviteStaffMemberCommand("metro", "biller@metro.ph", "Bob Biller", "Biller"), CancellationToken.None);

        Assert.Equal("PendingInvitation", result.Status);
        Assert.Empty(TestSupport.Outbox(_context, InteropTypes.NotificationEmailRequested));
    }

    [Fact]
    public async Task Resend_StagesAnEmailWithTheFreshToken()
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

        var result = await new ResendStaffInvitationCommandHandler(_context, TestSupport.InvitationNotifier(_context), TimeProvider.System)
            .Handle(new ResendStaffInvitationCommand("metro", member.Id), CancellationToken.None);

        var payload = Assert.Single(TestSupport.OutboxPayloads<NotificationEmailRequestedPayload>(_context, InteropTypes.NotificationEmailRequested));
        Assert.EndsWith($"/invitations/{result.InvitationToken}", payload.Model["inviteUrl"]);
        Assert.DoesNotContain("/old", payload.Model["inviteUrl"]);
    }
}

public class SendContactMessageCommandTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private SendContactMessageCommandHandler Handler(string? inbox) =>
        new(
            _context,
            new NotificationService(new InteropPublisher(_context)),
            new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Notifications:ContactInbox"] = inbox }).Build());

    [Fact]
    public async Task ConfiguredInbox_ReceivesTheMessage_ThroughTheOutbox()
    {
        var accepted = await Handler(" support@clinicez.test ").Handle(
            new SendContactMessageCommand(" Vera ", "vera@example.com", " Hello there, I have a question. "), CancellationToken.None);

        Assert.True(accepted);
        var payload = Assert.Single(TestSupport.OutboxPayloads<NotificationEmailRequestedPayload>(_context, InteropTypes.NotificationEmailRequested));
        Assert.Equal("support@clinicez.test", payload.To);
        Assert.Equal(EmailTemplateKeys.ContactMessage, payload.TemplateKey);
        Assert.Equal("Vera", payload.Model["name"]);
        Assert.Equal("Hello there, I have a question.", payload.Model["message"]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("  ")]
    public async Task WithoutAnInbox_NothingIsQueued(string? inbox)
    {
        var accepted = await Handler(inbox).Handle(new SendContactMessageCommand("Vera", "vera@example.com", "Hello there"), CancellationToken.None);

        Assert.False(accepted);
        Assert.Empty(TestSupport.Outbox(_context));
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

public class NotificationServiceTests
{
    [Fact]
    public async Task RequestEmail_AddressesThePortalItself_AndUsesTheCorrelationId()
    {
        using var context = TestSupport.NewContext();
        var correlationId = Guid.NewGuid();

        new NotificationService(new InteropPublisher(context)).RequestEmail(
            new NotificationEmailRequestedPayload { To = "a@example.com", Subject = "S", TemplateKey = EmailTemplateKeys.ContactMessage },
            correlationId);
        await context.SaveChangesAsync();

        var envelope = Assert.Single(TestSupport.Outbox(context));
        Assert.Equal(InteropTypes.NotificationEmailRequested, envelope.Type);
        Assert.Equal(Party.Portal, envelope.From);
        Assert.Equal(Party.Portal, envelope.To);
        Assert.Equal(correlationId, envelope.CorrelationId);
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
    public void SmtpMode_RequiresHostAndSender()
    {
        Assert.NotNull(new SmtpOptions { Mode = SmtpMode.Smtp }.FindProblem(false));
        Assert.NotNull(new SmtpOptions { Host = "smtp.example.com" }.FindProblem(false));
        Assert.NotNull(new SmtpOptions { FromEmail = "no-reply@example.com" }.FindProblem(false));
        Assert.Null(new SmtpOptions { Host = "smtp.example.com", FromEmail = "no-reply@example.com" }.FindProblem(false));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(70000)]
    public void SmtpMode_RejectsAnInvalidPort(int port)
    {
        Assert.NotNull(new SmtpOptions { Host = "h", FromEmail = "a@example.com", Port = port }.FindProblem(false));
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
