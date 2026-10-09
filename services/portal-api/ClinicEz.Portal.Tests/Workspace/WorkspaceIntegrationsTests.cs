using ClinicEz.Portal.Application.Features.Integrations;
using ClinicEz.Portal.Application.Features.Workspace;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Infrastructure.Webhooks;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Moq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace ClinicEz.Portal.Tests.Workspace;

public class WorkspaceIntegrationsTests : IDisposable
{
    private const string Slug = "metro-clinic";
    private static readonly WorkspaceActor Admin = new("clerk_admin_1", "Ana Admin", "Admin");

    private readonly ApplicationDbContext _context;
    private readonly Guid _tenantId = Guid.NewGuid();

    public WorkspaceIntegrationsTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new ApplicationDbContext(options);
        _context.Tenants.Add(new Tenant
        {
            Id = _tenantId,
            TenantSlug = Slug,
            Name = "Metro Clinic",
            OwnerId = "clerk_owner_1",
            Email = "owner@metro.ph"
        });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private Task<CreatedApiKeyDto> CreateKey(string name = "ERP sync", params string[] scopes) =>
        new CreateApiKeyCommandHandler(_context).Handle(
            new CreateApiKeyCommand(Slug, Admin, name, scopes.Length == 0 ? [IntegrationCatalog.ScopeWorkspaceRead] : scopes.ToList()),
            CancellationToken.None);

    private Task<CreatedWebhookEndpointDto> CreateHook(string url = "https://hooks.example.com/clinicez?token=abc", params string[] events) =>
        new CreateWebhookEndpointCommandHandler(_context).Handle(
            new CreateWebhookEndpointCommand(Slug, Admin, url, "Billing system", events.Length == 0 ? [IntegrationCatalog.EventFacilityCreated] : events.ToList()),
            CancellationToken.None);

    // ---------- key + signature primitives ----------

    [Fact]
    public void ApiKeyHasher_GeneratesUniqueKeysWhoseHashMatches()
    {
        var a = ApiKeyHasher.Generate();
        var b = ApiKeyHasher.Generate();

        Assert.StartsWith("cez_", a.Key);
        Assert.NotEqual(a.Key, b.Key);
        Assert.Equal(a.Key[..ApiKeyHasher.PrefixLength], a.Prefix);
        Assert.Equal(a.Hash, ApiKeyHasher.Hash(a.Key));
        Assert.Equal(64, a.Hash.Length);
        Assert.DoesNotContain(a.Key, a.Hash);
    }

    [Fact]
    public void WebhookSigner_SignsTimestampAndBody_AndChangesWithEither()
    {
        const string secret = "whsec_test";
        var signature = WebhookSigner.Sign(secret, 1700000000, "{\"a\":1}");

        var expected = Convert.ToHexString(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes("1700000000.{\"a\":1}"))).ToLowerInvariant();

        Assert.Equal($"t=1700000000,v1={expected}", signature);
        Assert.NotEqual(signature, WebhookSigner.Sign(secret, 1700000001, "{\"a\":1}"));
        Assert.NotEqual(signature, WebhookSigner.Sign(secret, 1700000000, "{\"a\":2}"));
        Assert.NotEqual(signature, WebhookSigner.Sign("other", 1700000000, "{\"a\":1}"));
    }

    // ---------- API keys ----------

    [Fact]
    public async Task CreateApiKey_StoresOnlyTheHash_AndAuditsWithoutTheKey()
    {
        var created = await CreateKey("ERP sync", IntegrationCatalog.ScopeFacilitiesRead, IntegrationCatalog.ScopeWorkspaceRead);

        var stored = await _context.WorkspaceApiKeys.SingleAsync();
        Assert.Equal(ApiKeyHasher.Hash(created.Key), stored.KeyHash);
        Assert.NotEqual(created.Key, stored.KeyHash);
        Assert.Equal("facilities:read,workspace:read", stored.Scopes);
        Assert.Equal("Ana Admin", stored.CreatedByName);
        Assert.Equal(created.Key[..12], created.ApiKey.KeyPrefix);

        var audit = await _context.WorkspaceAuditEntries.SingleAsync();
        Assert.Equal("integrations", audit.Section);
        Assert.Equal("api_key_created", audit.Action);
        Assert.DoesNotContain(created.Key, audit.ChangesJson);
        Assert.DoesNotContain(stored.KeyHash, audit.ChangesJson);
    }

    [Fact]
    public void CreateApiKeyValidator_RequiresNameAndKnownScopes()
    {
        var validator = new CreateApiKeyCommandValidator();

        Assert.True(validator.Validate(new CreateApiKeyCommand(Slug, Admin, "ERP", ["workspace:read"])).IsValid);
        Assert.False(validator.Validate(new CreateApiKeyCommand(Slug, Admin, "E", ["workspace:read"])).IsValid);
        Assert.False(validator.Validate(new CreateApiKeyCommand(Slug, Admin, "ERP", [])).IsValid);
        Assert.False(validator.Validate(new CreateApiKeyCommand(Slug, Admin, "ERP", null)).IsValid);
        Assert.False(validator.Validate(new CreateApiKeyCommand(Slug, Admin, "ERP", ["patients:read"])).IsValid);
    }

    [Fact]
    public async Task CreateApiKey_RefusesMoreThanTheActiveLimit_ButRevokedKeysDoNotCount()
    {
        for (var i = 0; i < IntegrationCatalog.MaxActiveApiKeys; i++) await CreateKey($"key {i}");

        await Assert.ThrowsAsync<BadRequestException>(() => CreateKey("one too many"));

        var first = await _context.WorkspaceApiKeys.OrderBy(k => k.CreatedAt).FirstAsync();
        await new RevokeApiKeyCommandHandler(_context).Handle(new RevokeApiKeyCommand(Slug, Admin, first.Id), CancellationToken.None);

        await CreateKey("fits again");
    }

    [Fact]
    public async Task RevokeApiKey_MarksItRevoked_AndAudits_AndIsIdempotent()
    {
        var created = await CreateKey();
        var handler = new RevokeApiKeyCommandHandler(_context);

        await handler.Handle(new RevokeApiKeyCommand(Slug, Admin, created.ApiKey.Id), CancellationToken.None);
        await handler.Handle(new RevokeApiKeyCommand(Slug, Admin, created.ApiKey.Id), CancellationToken.None);

        Assert.NotNull((await _context.WorkspaceApiKeys.SingleAsync()).RevokedAt);
        Assert.Single(_context.WorkspaceAuditEntries.Where(a => a.Action == "api_key_revoked"));
    }

    [Fact]
    public async Task RevokeApiKey_OfAnotherWorkspace_IsNotFound()
    {
        var otherTenant = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = otherTenant, TenantSlug = "other", Name = "Other", OwnerId = "x", Email = "x@x.ph" });
        var foreign = new WorkspaceApiKey { TenantId = otherTenant, Name = "theirs", KeyHash = "h", KeyPrefix = "cez_", Scopes = "workspace:read" };
        _context.WorkspaceApiKeys.Add(foreign);
        await _context.SaveChangesAsync();

        await Assert.ThrowsAsync<NotFoundException>(() =>
            new RevokeApiKeyCommandHandler(_context).Handle(new RevokeApiKeyCommand(Slug, Admin, foreign.Id), CancellationToken.None));
    }

    // ---------- API key validation (what the auth handler calls) ----------

    [Fact]
    public async Task ApiKeyValidator_AcceptsAValidKey_WithItsScopes_AndTracksLastUse()
    {
        var created = await CreateKey("ERP", IntegrationCatalog.ScopeWorkspaceRead);

        var identity = await new ApiKeyValidator(_context).ValidateAsync(created.Key, CancellationToken.None);

        Assert.NotNull(identity);
        Assert.Equal(_tenantId, identity.TenantId);
        Assert.Equal(Slug, identity.TenantSlug);
        Assert.Equal(["workspace:read"], identity.Scopes);
        Assert.NotNull((await _context.WorkspaceApiKeys.SingleAsync()).LastUsedAt);
    }

    [Fact]
    public async Task ApiKeyValidator_RejectsUnknownMalformedAndRevokedKeys()
    {
        var created = await CreateKey();
        var validator = new ApiKeyValidator(_context);

        Assert.Null(await validator.ValidateAsync("cez_notarealkey", CancellationToken.None));
        Assert.Null(await validator.ValidateAsync("", CancellationToken.None));
        Assert.Null(await validator.ValidateAsync("Bearer " + created.Key, CancellationToken.None));
        Assert.Null(await validator.ValidateAsync(created.Key + new string('x', 200), CancellationToken.None));

        await new RevokeApiKeyCommandHandler(_context).Handle(new RevokeApiKeyCommand(Slug, Admin, created.ApiKey.Id), CancellationToken.None);
        Assert.Null(await validator.ValidateAsync(created.Key, CancellationToken.None));
    }

    [Fact]
    public async Task ApiKeyValidator_RejectsKeysOfAnArchivedWorkspace()
    {
        var created = await CreateKey();
        var tenant = await _context.Tenants.SingleAsync();
        tenant.ArchivedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        Assert.Null(await new ApiKeyValidator(_context).ValidateAsync(created.Key, CancellationToken.None));
    }

    // ---------- webhook endpoints ----------

    [Theory]
    [InlineData("https://hooks.example.com/in", true)]
    [InlineData("http://hooks.example.com/in", false)]
    [InlineData("https://localhost/in", false)]
    [InlineData("https://127.0.0.1/in", false)]
    [InlineData("https://169.254.169.254/latest/meta-data", false)]
    [InlineData("https://10.0.0.5/in", false)]
    [InlineData("https://user:pass@hooks.example.com/in", false)]
    [InlineData("not a url", false)]
    public void CreateWebhookValidator_OnlyAllowsPublicHttpsTargets(string url, bool valid)
    {
        var result = new CreateWebhookEndpointCommandValidator()
            .Validate(new CreateWebhookEndpointCommand(Slug, Admin, url, null, [IntegrationCatalog.EventFacilityCreated]));

        Assert.Equal(valid, result.IsValid);
    }

    [Fact]
    public void WebhookValidators_RequireKnownSubscribableEvents()
    {
        var validator = new CreateWebhookEndpointCommandValidator();

        Assert.False(validator.Validate(new CreateWebhookEndpointCommand(Slug, Admin, "https://a.example.com", null, [])).IsValid);
        Assert.False(validator.Validate(new CreateWebhookEndpointCommand(Slug, Admin, "https://a.example.com", null, ["patient.created"])).IsValid);
        Assert.False(validator.Validate(new CreateWebhookEndpointCommand(Slug, Admin, "https://a.example.com", null, [IntegrationCatalog.EventPing])).IsValid);
        Assert.False(validator.Validate(new CreateWebhookEndpointCommand(Slug, Admin, "https://a.example.com", new string('d', 201), ["facility.created"])).IsValid);
        Assert.True(validator.Validate(new CreateWebhookEndpointCommand(Slug, Admin, "https://a.example.com", null, ["facility.created"])).IsValid);
    }

    [Fact]
    public async Task CreateWebhook_ReturnsTheSecretOnce_AndAuditsOnlyHostAndPath()
    {
        var created = await CreateHook("https://hooks.example.com/clinicez?token=supersecrettoken");

        Assert.StartsWith("whsec_", created.Secret);
        Assert.Equal(created.Secret, (await _context.WebhookEndpoints.SingleAsync()).SigningSecret);

        var audit = await _context.WorkspaceAuditEntries.SingleAsync();
        Assert.Equal("webhook_created", audit.Action);
        Assert.Contains("https://hooks.example.com/clinicez", audit.ChangesJson);
        Assert.DoesNotContain("supersecrettoken", audit.ChangesJson);
        Assert.DoesNotContain(created.Secret, audit.ChangesJson);
    }

    [Fact]
    public async Task CreateWebhook_RefusesMoreThanTheEndpointLimit()
    {
        for (var i = 0; i < IntegrationCatalog.MaxWebhookEndpoints; i++) await CreateHook($"https://h{i}.example.com/in");

        await Assert.ThrowsAsync<BadRequestException>(() => CreateHook("https://extra.example.com/in"));
    }

    [Fact]
    public async Task UpdateWebhook_ChangesFields_KeepsTheSecret_AndAuditsTheDiff()
    {
        var created = await CreateHook();

        var dto = await new UpdateWebhookEndpointCommandHandler(_context).Handle(
            new UpdateWebhookEndpointCommand(Slug, Admin, created.Endpoint.Id, "https://new.example.com/in", null,
                [IntegrationCatalog.EventWorkspaceProfileUpdated, IntegrationCatalog.EventFacilityCreated], false),
            CancellationToken.None);

        Assert.False(dto.IsActive);
        Assert.Equal(["facility.created", "workspace.profile.updated"], dto.Events);
        var stored = await _context.WebhookEndpoints.SingleAsync();
        Assert.Equal(created.Secret, stored.SigningSecret);
        Assert.Equal("https://new.example.com/in", stored.Url);

        var audit = await _context.WorkspaceAuditEntries.SingleAsync(a => a.Action == "webhook_updated");
        Assert.DoesNotContain(created.Secret, audit.ChangesJson);
    }

    [Fact]
    public async Task UpdateWebhook_WithNoChange_WritesNoAudit()
    {
        var created = await CreateHook();

        await new UpdateWebhookEndpointCommandHandler(_context).Handle(
            new UpdateWebhookEndpointCommand(Slug, Admin, created.Endpoint.Id, created.Endpoint.Url, "Billing system",
                created.Endpoint.Events.ToList(), true),
            CancellationToken.None);

        Assert.Empty(_context.WorkspaceAuditEntries.Where(a => a.Action == "webhook_updated"));
    }

    [Fact]
    public async Task DeleteWebhook_RemovesItForGood_AndAudits()
    {
        var created = await CreateHook();

        await new DeleteWebhookEndpointCommandHandler(_context).Handle(
            new DeleteWebhookEndpointCommand(Slug, Admin, created.Endpoint.Id), CancellationToken.None);

        Assert.Empty(_context.WebhookEndpoints.IgnoreQueryFilters());
        Assert.Single(_context.WorkspaceAuditEntries.Where(a => a.Action == "webhook_deleted"));
    }

    [Fact]
    public async Task SendTest_QueuesAPing_OnlyForAnActiveEndpoint()
    {
        var created = await CreateHook();
        var handler = new SendTestWebhookCommandHandler(_context, new WebhookDispatcher(_context));

        await handler.Handle(new SendTestWebhookCommand(Slug, created.Endpoint.Id), CancellationToken.None);

        var delivery = await _context.WebhookDeliveries.SingleAsync();
        Assert.Equal(IntegrationCatalog.EventPing, delivery.EventType);
        Assert.Equal(created.Endpoint.Id, delivery.EndpointId);

        var endpoint = await _context.WebhookEndpoints.SingleAsync();
        endpoint.IsActive = false;
        await _context.SaveChangesAsync();
        await Assert.ThrowsAsync<BadRequestException>(() =>
            handler.Handle(new SendTestWebhookCommand(Slug, created.Endpoint.Id), CancellationToken.None));
    }

    [Fact]
    public async Task ApiResponses_NeverCarrySecretsAfterCreation()
    {
        await CreateKey();
        await CreateHook();

        var dto = await new GetIntegrationsQueryHandler(_context).Handle(new GetIntegrationsQuery(Slug), CancellationToken.None);
        var json = JsonSerializer.Serialize(dto);

        Assert.Single(dto.ApiKeys);
        Assert.Single(dto.Webhooks);
        Assert.DoesNotContain("whsec_", json);
        Assert.DoesNotContain("KeyHash", json);
        Assert.DoesNotContain("Secret", json);
        Assert.DoesNotContain(_context.WorkspaceApiKeys.Single().KeyHash, json);
    }

    // ---------- dispatcher ----------

    [Fact]
    public async Task Dispatcher_QueuesOnlyForActiveSubscribedEndpoints()
    {
        var subscribed = await CreateHook("https://a.example.com/in", IntegrationCatalog.EventFacilityCreated);
        await CreateHook("https://b.example.com/in", IntegrationCatalog.EventWorkspaceProfileUpdated);
        var disabled = await CreateHook("https://c.example.com/in", IntegrationCatalog.EventFacilityCreated);
        (await _context.WebhookEndpoints.SingleAsync(e => e.Id == disabled.Endpoint.Id)).IsActive = false;
        await _context.SaveChangesAsync();

        var queued = await new WebhookDispatcher(_context).EnqueueAsync(
            _tenantId, Slug, IntegrationCatalog.EventFacilityCreated, new { name = "North Clinic" }, null, CancellationToken.None);

        Assert.Equal(1, queued);
        var delivery = await _context.WebhookDeliveries.SingleAsync();
        Assert.Equal(subscribed.Endpoint.Id, delivery.EndpointId);
        Assert.Equal(WebhookDeliveryStatus.Pending, delivery.Status);

        using var payload = JsonDocument.Parse(delivery.Payload);
        Assert.Equal("facility.created", payload.RootElement.GetProperty("type").GetString());
        Assert.Equal(Slug, payload.RootElement.GetProperty("tenantSlug").GetString());
        Assert.Equal("North Clinic", payload.RootElement.GetProperty("data").GetProperty("name").GetString());
    }

    [Fact]
    public async Task Dispatcher_DoesNotCrossWorkspaces()
    {
        await CreateHook();
        var otherTenant = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = otherTenant, TenantSlug = "other", Name = "Other", OwnerId = "x", Email = "x@x.ph" });
        await _context.SaveChangesAsync();

        var queued = await new WebhookDispatcher(_context).EnqueueAsync(
            otherTenant, "other", IntegrationCatalog.EventFacilityCreated, new { }, null, CancellationToken.None);

        Assert.Equal(0, queued);
        Assert.Empty(_context.WebhookDeliveries);
    }

    [Fact]
    public async Task FacilityCreatedConsumer_ForwardsFacilityMetadata_ButNeverTheLicense()
    {
        await CreateHook("https://a.example.com/in", IntegrationCatalog.EventFacilityCreated);
        var consume = new Mock<ConsumeContext<FacilityCreatedEvent>>();
        consume.SetupGet(c => c.CancellationToken).Returns(CancellationToken.None);
        consume.SetupGet(c => c.Message).Returns(new FacilityCreatedEvent
        {
            TenantId = _tenantId.ToString(),
            TenantSlug = Slug,
            ResourceId = Guid.NewGuid(),
            Name = "North Clinic",
            Slug = "north-clinic",
            PlanTier = "Community",
            LicenseToken = "SUPER-SECRET-LICENSE-TOKEN"
        });

        await new FacilityCreatedWebhookConsumer(new WebhookDispatcher(_context)).Consume(consume.Object);

        var delivery = await _context.WebhookDeliveries.SingleAsync();
        Assert.Contains("north-clinic", delivery.Payload);
        Assert.DoesNotContain("SUPER-SECRET-LICENSE-TOKEN", delivery.Payload);
    }

    // ---------- delivery job ----------

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string Body)> Calls { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls.Add((request, await request.Content!.ReadAsStringAsync(cancellationToken)));
            return respond(request);
        }
    }

    private WebhookDeliveryJob JobWith(StubHandler handler)
    {
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(WebhookDeliveryJob.HttpClientName)).Returns(new HttpClient(handler));
        return new WebhookDeliveryJob(_context, factory.Object);
    }

    private async Task<(WebhookEndpoint Endpoint, WebhookDelivery Delivery)> QueueDelivery(string url = "https://hooks.example.com/in")
    {
        var created = await CreateHook(url, IntegrationCatalog.EventFacilityCreated);
        await new WebhookDispatcher(_context).EnqueueAsync(
            _tenantId, Slug, IntegrationCatalog.EventFacilityCreated, new { name = "North" }, null, CancellationToken.None);
        var delivery = await _context.WebhookDeliveries.SingleAsync();
        delivery.CreatedAt = DateTime.UtcNow; // production stamps this in SoftDeleteInterceptor; the in-memory context has none
        await _context.SaveChangesAsync();
        return (await _context.WebhookEndpoints.SingleAsync(e => e.Id == created.Endpoint.Id), delivery);
    }

    [Fact]
    public async Task Job_SendsASignedPost_AndMarksItSucceeded()
    {
        var (endpoint, delivery) = await QueueDelivery();
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.NoContent));

        await JobWith(handler).DeliverDueAsync(CancellationToken.None);

        var call = Assert.Single(handler.Calls);
        Assert.Equal(HttpMethod.Post, call.Request.Method);
        Assert.Equal("https://hooks.example.com/in", call.Request.RequestUri!.ToString());
        Assert.Equal(delivery.Payload, call.Body);
        Assert.Equal("facility.created", call.Request.Headers.GetValues("X-ClinicEz-Event").Single());
        Assert.Equal(delivery.Id.ToString(), call.Request.Headers.GetValues("X-ClinicEz-Delivery").Single());

        var signature = call.Request.Headers.GetValues("X-ClinicEz-Signature").Single();
        var timestamp = long.Parse(signature.Split(',')[0][2..]);
        Assert.Equal(WebhookSigner.Sign(endpoint.SigningSecret, timestamp, delivery.Payload), signature);

        var stored = await _context.WebhookDeliveries.SingleAsync();
        Assert.Equal(WebhookDeliveryStatus.Succeeded, stored.Status);
        Assert.Equal(1, stored.AttemptCount);
        Assert.Equal(204, stored.ResponseStatusCode);
        Assert.NotNull(stored.DeliveredAt);
    }

    [Fact]
    public async Task Job_RetriesWithBackoff_ThenGivesUp()
    {
        await QueueDelivery();
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.InternalServerError));
        var job = JobWith(handler);

        await job.DeliverDueAsync(CancellationToken.None);

        var afterFirst = await _context.WebhookDeliveries.SingleAsync();
        Assert.Equal(WebhookDeliveryStatus.Pending, afterFirst.Status);
        Assert.Equal(1, afterFirst.AttemptCount);
        Assert.Equal(500, afterFirst.ResponseStatusCode);
        Assert.True(afterFirst.NextAttemptAt > DateTime.UtcNow.AddSeconds(30));
        Assert.DoesNotContain("hooks.example.com", afterFirst.LastError);

        // Not due yet: a second run must not send again.
        await job.DeliverDueAsync(CancellationToken.None);
        Assert.Single(handler.Calls);

        for (var attempt = 2; attempt <= WebhookDeliveryJob.MaxAttempts; attempt++)
        {
            afterFirst.NextAttemptAt = DateTime.UtcNow.AddSeconds(-1);
            await _context.SaveChangesAsync();
            await job.DeliverDueAsync(CancellationToken.None);
        }

        var final = await _context.WebhookDeliveries.SingleAsync();
        Assert.Equal(WebhookDeliveryStatus.Failed, final.Status);
        Assert.Equal(WebhookDeliveryJob.MaxAttempts, final.AttemptCount);
        Assert.Equal(WebhookDeliveryJob.MaxAttempts, handler.Calls.Count);
    }

    [Fact]
    public async Task Job_TreatsAConnectionError_AsARetry_WithoutLeakingDetails()
    {
        await QueueDelivery();
        var handler = new StubHandler(_ => throw new HttpRequestException("The webhook host does not resolve to a public address."));

        await JobWith(handler).DeliverDueAsync(CancellationToken.None);

        var stored = await _context.WebhookDeliveries.SingleAsync();
        Assert.Equal(WebhookDeliveryStatus.Pending, stored.Status);
        Assert.Equal(1, stored.AttemptCount);
        Assert.Null(stored.ResponseStatusCode);
        Assert.Equal("The webhook host does not resolve to a public address.", stored.LastError);
    }

    [Fact]
    public async Task Job_DoesNotSendToADisabledEndpoint()
    {
        var (endpoint, _) = await QueueDelivery();
        endpoint.IsActive = false;
        await _context.SaveChangesAsync();
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));

        await JobWith(handler).DeliverDueAsync(CancellationToken.None);

        Assert.Empty(handler.Calls);
        Assert.Equal(WebhookDeliveryStatus.Failed, (await _context.WebhookDeliveries.SingleAsync()).Status);
    }

    [Fact]
    public async Task Job_RecheckesTheUrlAtSendTime()
    {
        var (endpoint, _) = await QueueDelivery();
        endpoint.Url = "http://127.0.0.1/internal";
        await _context.SaveChangesAsync();
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));

        await JobWith(handler).DeliverDueAsync(CancellationToken.None);

        Assert.Empty(handler.Calls);
        Assert.Equal(WebhookDeliveryStatus.Failed, (await _context.WebhookDeliveries.SingleAsync()).Status);
    }

    [Fact]
    public async Task Job_PurgesFinishedDeliveriesOlderThanRetention()
    {
        var (endpoint, recent) = await QueueDelivery();
        _context.WebhookDeliveries.Add(new WebhookDelivery
        {
            TenantId = _tenantId, EndpointId = endpoint.Id, EventType = "facility.created",
            Status = WebhookDeliveryStatus.Succeeded, CreatedAt = DateTime.UtcNow.AddDays(-40)
        });
        await _context.SaveChangesAsync();

        await JobWith(new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK))).DeliverDueAsync(CancellationToken.None);

        // The 40-day-old finished delivery is gone; the fresh one (just delivered) stays in the log.
        var remaining = await _context.WebhookDeliveries.SingleAsync();
        Assert.Equal(recent.Id, remaining.Id);
    }

    // ---------- SSRF guard ----------

    [Theory]
    [InlineData("https://127.0.0.1:9/")]
    [InlineData("https://10.1.2.3:9/")]
    [InlineData("https://169.254.169.254/latest/meta-data/")]
    [InlineData("https://[::1]:9/")]
    public async Task SafeConnect_RefusesPrivateAndReservedAddresses_EvenWhenTheUrlGotThroughValidation(string url)
    {
        using var handler = new SocketsHttpHandler { ConnectCallback = SafeWebhookConnect.ConnectAsync };
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(5) };

        var ex = await Assert.ThrowsAsync<HttpRequestException>(() => client.GetAsync(url));
        Assert.Contains("public address", ex.Message);
    }
}
