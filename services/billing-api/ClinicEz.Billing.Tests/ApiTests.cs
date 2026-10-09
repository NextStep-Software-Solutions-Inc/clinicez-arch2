using System.Net;
using System.Net.Http.Headers;
using System.Reflection;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using ClinicEz.Billing.Api;
using ClinicEz.Billing.Api.Authorization;
using ClinicEz.Billing.Api.Controllers;
using ClinicEz.Billing.Application;
using ClinicEz.Billing.Infrastructure;
using ClinicEz.Billing.Infrastructure.Auth;
using ClinicEz.Billing.Tests.TestSupport;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Billing.Tests;

/// <summary>
/// End-to-end HTTP tests of billing-api: the real controllers, auth pipeline, rate limiter and interop dispatcher on an in-process
/// test server and an in-memory database. They prove the cashier API cannot be reached without a billing session, that
/// tenant, facility and permissions come only from the verified session, and that a payment flows from sign-in to receipt.
/// </summary>
public class ApiTests
{
    private const string InternalKey = "internal-service-secret-key";
    private const string Password = "Str0ng-Passw0rd-2026";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private sealed record Reply(HttpStatusCode Status, JsonElement Body)
    {
        public JsonElement Data => Body.GetProperty("data");
    }

    private sealed class TestApp : IAsyncDisposable
    {
        public required WebApplication App { get; init; }
        public required HttpClient Client { get; init; }

        public IFacilityTokenService Tokens => App.Services.GetRequiredService<IFacilityTokenService>();

        public async Task<Reply> SendAsync(HttpMethod method, string url, string? bearer = null, object? body = null, params (string Name, string Value)[] headers)
        {
            using var request = new HttpRequestMessage(method, url);
            if (body is not null) request.Content = new StringContent(JsonSerializer.Serialize(body, Json), Encoding.UTF8, "application/json");
            if (bearer is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
            foreach (var (name, value) in headers) request.Headers.TryAddWithoutValidation(name, value);

            using var response = await Client.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            var parsed = text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
            return new Reply(response.StatusCode, parsed);
        }

        public Task<Reply> GetAsync(string url, string? bearer = null, params (string Name, string Value)[] headers) =>
            SendAsync(HttpMethod.Get, url, bearer, null, headers);

        public Task<Reply> PostAsync(string url, string? bearer, object? body, params (string Name, string Value)[] headers) =>
            SendAsync(HttpMethod.Post, url, bearer, body ?? new { }, headers);

        /// <summary>Creates a staff member the way provisioning does: with the internal service key for a tenant.</summary>
        public async Task<Guid> CreateStaffAsync(string tenantId, string facilityId, FacilityType type, string email, string role, string? bearer = null)
        {
            var reply = bearer is null
                ? await PostAsync("/api/v1/staff", null, new { facilityId, facilityType = type, email, fullName = $"{role} {email}", password = Password, role },
                    (FacilityAuthSchemes.InternalKeyHeader, InternalKey), ("X-Tenant-Id", tenantId))
                : await PostAsync("/api/v1/staff", bearer, new { facilityId, facilityType = type, email, fullName = $"{role} {email}", password = Password, role });
            reply.Status.Should().Be(HttpStatusCode.Created, reply.Body.ToString());
            return reply.Data.GetProperty("id").GetGuid();
        }

        public async Task<string> LoginAsync(string tenantId, string facilityId, string email, string password = Password)
        {
            var reply = await PostAsync("/api/v1/auth/login", null, new { tenantId, facilityId, email, password });
            reply.Status.Should().Be(HttpStatusCode.OK, reply.Body.ToString());
            return reply.Data.GetProperty("accessToken").GetString()!;
        }

        /// <summary>A tenant with a clinic admin, a supervisor and a cashier, all signed in.</summary>
        public async Task<Team> TeamAsync(string tenantId, string facilityId = BillingHost.Clinic, FacilityType type = FacilityType.Clinic)
        {
            var admin = await CreateStaffAsync(tenantId, facilityId, type, "admin@x.test", "Admin");
            var adminToken = await LoginAsync(tenantId, facilityId, "admin@x.test");
            await CreateStaffAsync(tenantId, facilityId, type, "sup@x.test", "Supervisor", adminToken);
            await CreateStaffAsync(tenantId, facilityId, type, "cash@x.test", "Cashier", adminToken);
            return new Team(admin, adminToken, await LoginAsync(tenantId, facilityId, "sup@x.test"), await LoginAsync(tenantId, facilityId, "cash@x.test"));
        }

        public async Task<InvoiceIds> ReceiveVisitAsync(string tenantId, string visitKey = "visit-1")
        {
            var clinic = await ReceiveAsync(tenantId, BillingHost.Clinic, FacilityType.Clinic, visitKey, 500m);
            var lab = await ReceiveAsync(tenantId, BillingHost.Lab, FacilityType.Laboratory, visitKey, 1250.50m);
            var pharmacy = await ReceiveAsync(tenantId, BillingHost.Pharmacy, FacilityType.Pharmacy, visitKey, 349.75m);
            return new InvoiceIds(clinic, lab, pharmacy);
        }

        private async Task<Guid> ReceiveAsync(string tenantId, string facilityId, FacilityType type, string visitKey, decimal amount)
        {
            var payload = BillingHost.Request(tenantId, facilityId, type, null, visitKey, "Juan Dela Cruz", PatientId, "branch-1", type.ToString(),
                new[] { BillingHost.Line("SVC", "Service", 1, amount) });
            var result = await App.Services.GetRequiredService<InteropDispatcher>().DispatchAsync(BillingHost.Envelope(payload), default);
            result.Outcome.Should().Be(DispatchOutcome.Handled);

            await using var scope = App.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ClinicEz.Billing.Infrastructure.Persistence.ApplicationDbContext>();
            return await db.Invoices.IgnoreQueryFilters().Where(i => i.TenantId == tenantId && i.InvoiceRequestId == payload.InvoiceRequestId).Select(i => i.Id).SingleAsync();
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.StopAsync();
            await App.DisposeAsync();
        }
    }

    private sealed record Team(Guid AdminId, string Admin, string Supervisor, string Cashier);

    private sealed record InvoiceIds(Guid Clinic, Guid Lab, Guid Pharmacy);

    private static readonly Guid PatientId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");

    private static async Task<TestApp> StartAsync(string audience = "clinicez-billing", string? signingKey = null, int rateLimit = 100)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var config = new Dictionary<string, string?>
        {
            ["Jwt:SigningKey"] = signingKey ?? Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ["Jwt:Audience"] = audience,
            ["Jwt:Issuer"] = audience,
            ["Internal:ApiKey"] = InternalKey,
            ["DbSchema"] = "billing",
            ["Messaging:Service"] = "billing",
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Enabled"] = "false",
            ["Auth:RateLimitPerMinute"] = rateLimit.ToString()
        };
        builder.Configuration.AddInMemoryCollection(config);

        var dbName = $"Billing_Api_{Guid.NewGuid()}";
        builder.Services
            .AddApiServices()
            .AddApplicationServices()
            .AddInfrastructureServices(builder.Configuration, o => o.UseInMemoryDatabase(dbName));
        builder.Services.AddFacilityLocalAuth(builder.Configuration, audience, BillingTokenEvents.OnTokenValidated);
        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy(FacilityLocalAuthExtensions.AuthRateLimitPolicy, httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = rateLimit, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        builder.Services.AddControllers().AddApplicationPart(typeof(HasPermissionAttribute).Assembly);

        var app = builder.Build();
        app.UseExceptionHandler();
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseInternalServiceGuard();
        app.UseMiddleware<BillingScopeMiddleware>();
        app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();
        app.MapControllers();
        await app.StartAsync();
        return new TestApp { App = app, Client = app.GetTestClient() };
    }

    // ── authentication ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Every_cashier_endpoint_is_401_without_credentials_and_only_health_and_login_are_open()
    {
        await using var app = await StartAsync();

        foreach (var url in new[] { "/api/v1/invoices", "/api/v1/visit-bills", "/api/v1/shifts/current", "/api/v1/staff", "/api/v1/auth/me", "/api/v1/audit", "/api/v1/reports/daily-collection" })
        {
            (await app.GetAsync(url)).Status.Should().Be(HttpStatusCode.Unauthorized, url);
        }

        (await app.PostAsync("/api/v1/payments", null, new { })).Status.Should().Be(HttpStatusCode.Unauthorized);
        (await app.GetAsync("/health")).Status.Should().Be(HttpStatusCode.OK);
        (await app.PostAsync("/api/v1/auth/login", null, new { tenantId = "t", facilityId = "f", email = "a@b.c", password = "x" })).Status.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Garbage_and_tampered_tokens_are_rejected()
    {
        await using var app = await StartAsync();
        var team = await app.TeamAsync(BillingHost.TenantA);

        (await app.GetAsync("/api/v1/auth/me", team.Cashier)).Status.Should().Be(HttpStatusCode.OK);
        (await app.GetAsync("/api/v1/auth/me", "not.a.jwt")).Status.Should().Be(HttpStatusCode.Unauthorized);
        var tampered = team.Cashier[..^3] + (team.Cashier.EndsWith("AAA") ? "BBB" : "AAA");
        (await app.GetAsync("/api/v1/auth/me", tampered)).Status.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task A_token_for_another_service_audience_is_rejected_even_with_the_same_signing_key()
    {
        var sharedKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        await using var billing = await StartAsync("clinicez-billing", sharedKey);
        await using var lab = await StartAsync("clinicez-lab", sharedKey);
        var team = await billing.TeamAsync(BillingHost.TenantA);

        var foreign = lab.Tokens.CreateAccessToken(new[]
        {
            new Claim(BillingClaimTypes.Subject, team.AdminId.ToString()),
            new Claim(BillingClaimTypes.TenantId, BillingHost.TenantA),
            new Claim(BillingClaimTypes.FacilityId, BillingHost.Clinic),
            new Claim(BillingClaimTypes.TokenVersion, "0")
        }).Token;

        (await billing.GetAsync("/api/v1/auth/me", foreign)).Status.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Login_failures_are_a_uniform_401_and_five_bad_passwords_lock_the_account()
    {
        await using var app = await StartAsync();
        await app.TeamAsync(BillingHost.TenantA);

        var unknown = await app.PostAsync("/api/v1/auth/login", null, new { tenantId = BillingHost.TenantA, facilityId = BillingHost.Clinic, email = "nobody@x.test", password = Password });
        var wrong = await app.PostAsync("/api/v1/auth/login", null, new { tenantId = BillingHost.TenantA, facilityId = BillingHost.Clinic, email = "cash@x.test", password = "wrong-password-1" });
        unknown.Status.Should().Be(HttpStatusCode.Unauthorized);
        wrong.Status.Should().Be(HttpStatusCode.Unauthorized);
        wrong.Body.GetProperty("message").GetString().Should().Be(unknown.Body.GetProperty("message").GetString(), "the response must not reveal which part was wrong");

        for (var attempt = 1; attempt < 5; attempt++)
        {
            (await app.PostAsync("/api/v1/auth/login", null, new { tenantId = BillingHost.TenantA, facilityId = BillingHost.Clinic, email = "cash@x.test", password = "wrong-password-1" }))
                .Status.Should().Be(HttpStatusCode.Unauthorized);
        }

        var locked = await app.PostAsync("/api/v1/auth/login", null, new { tenantId = BillingHost.TenantA, facilityId = BillingHost.Clinic, email = "cash@x.test", password = Password });
        locked.Status.Should().Be(HttpStatusCode.TooManyRequests, "even the right password is refused while locked");
    }

    [Fact]
    public async Task Login_is_scoped_to_the_tenant_and_counter_the_account_belongs_to()
    {
        await using var app = await StartAsync();
        await app.TeamAsync(BillingHost.TenantA);

        (await app.PostAsync("/api/v1/auth/login", null, new { tenantId = BillingHost.TenantB, facilityId = BillingHost.Clinic, email = "cash@x.test", password = Password })).Status.Should().Be(HttpStatusCode.Unauthorized);
        (await app.PostAsync("/api/v1/auth/login", null, new { tenantId = BillingHost.TenantA, facilityId = BillingHost.Lab, email = "cash@x.test", password = Password })).Status.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task The_login_endpoint_is_rate_limited()
    {
        await using var app = await StartAsync(rateLimit: 3);
        var statuses = new List<HttpStatusCode>();

        for (var n = 0; n < 5; n++)
        {
            statuses.Add((await app.PostAsync("/api/v1/auth/login", null, new { tenantId = "t", facilityId = "f", email = "a@b.c", password = "x" })).Status);
        }

        statuses.Count(s => s == HttpStatusCode.TooManyRequests).Should().Be(2);
    }

    [Fact]
    public async Task A_deactivated_staff_members_existing_token_stops_working_immediately()
    {
        await using var app = await StartAsync();
        var team = await app.TeamAsync(BillingHost.TenantA);
        var staff = await app.GetAsync("/api/v1/staff", team.Admin);
        var cashierId = staff.Data.EnumerateArray().Single(s => s.GetProperty("email").GetString() == "cash@x.test").GetProperty("id").GetGuid();
        (await app.GetAsync("/api/v1/auth/me", team.Cashier)).Status.Should().Be(HttpStatusCode.OK);

        (await app.PostAsync($"/api/v1/staff/{cashierId}/deactivate", team.Admin, null)).Status.Should().Be(HttpStatusCode.OK);

        (await app.GetAsync("/api/v1/auth/me", team.Cashier)).Status.Should().Be(HttpStatusCode.Unauthorized);
        (await app.PostAsync("/api/v1/auth/login", null, new { tenantId = BillingHost.TenantA, facilityId = BillingHost.Clinic, email = "cash@x.test", password = Password })).Status.Should().Be(HttpStatusCode.Unauthorized);
        (await app.PostAsync($"/api/v1/staff/{team.AdminId}/deactivate", team.Admin, null)).Status.Should().Be(HttpStatusCode.Conflict, "you cannot lock yourself out");
    }

    // ── internal service key ────────────────────────────────────────────────────────

    [Fact]
    public async Task The_internal_key_may_only_manage_staff_and_needs_a_tenant()
    {
        await using var app = await StartAsync();
        var headers = new[] { (FacilityAuthSchemes.InternalKeyHeader, InternalKey), ("X-Tenant-Id", BillingHost.TenantA) };

        (await app.GetAsync("/api/v1/staff", null, headers)).Status.Should().Be(HttpStatusCode.OK);
        (await app.GetAsync("/api/v1/staff", null, (FacilityAuthSchemes.InternalKeyHeader, InternalKey))).Status.Should().Be(HttpStatusCode.Forbidden, "no tenant");
        (await app.GetAsync("/api/v1/staff", null, (FacilityAuthSchemes.InternalKeyHeader, "wrong-key"), ("X-Tenant-Id", BillingHost.TenantA))).Status.Should().Be(HttpStatusCode.Unauthorized);

        foreach (var url in new[] { "/api/v1/invoices", "/api/v1/visit-bills", "/api/v1/shifts/current", "/api/v1/audit", "/api/v1/auth/me" })
        {
            (await app.GetAsync(url, null, headers)).Status.Should().Be(HttpStatusCode.Forbidden, url);
        }

        (await app.PostAsync("/api/v1/payments", null, new { method = "Cash", amount = 1m }, headers)).Status.Should().Be(HttpStatusCode.Forbidden);
    }

    // ── permissions ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Permissions_follow_the_role_stored_in_the_database()
    {
        await using var app = await StartAsync();
        var team = await app.TeamAsync(BillingHost.TenantA);
        var visit = await app.ReceiveVisitAsync(BillingHost.TenantA);
        var voidBody = new { reason = "Entered in error" };

        (await app.GetAsync($"/api/v1/invoices/{visit.Clinic}", team.Cashier)).Status.Should().Be(HttpStatusCode.OK);
        (await app.GetAsync("/api/v1/staff", team.Cashier)).Status.Should().Be(HttpStatusCode.Forbidden);
        (await app.GetAsync("/api/v1/staff", team.Supervisor)).Status.Should().Be(HttpStatusCode.Forbidden);
        (await app.GetAsync("/api/v1/reports/daily-collection?from=2026-03-10&to=2026-03-10", team.Cashier)).Status.Should().Be(HttpStatusCode.Forbidden);
        (await app.PostAsync($"/api/v1/invoices/{visit.Clinic}/void", team.Cashier, voidBody)).Status.Should().Be(HttpStatusCode.Forbidden);
        (await app.PostAsync($"/api/v1/invoices/{visit.Clinic}/refund", team.Cashier, new { reason = "x" })).Status.Should().Be(HttpStatusCode.Forbidden);
        (await app.PostAsync($"/api/v1/invoices/{visit.Clinic}/discounts", team.Cashier, new { kind = "Promo", mode = "Percentage", value = 10, reason = "Promo" })).Status.Should().Be(HttpStatusCode.Forbidden);

        var voided = await app.PostAsync($"/api/v1/invoices/{visit.Clinic}/void", team.Supervisor, voidBody);
        voided.Status.Should().Be(HttpStatusCode.OK, voided.Body.ToString());
        voided.Data.GetProperty("status").GetString().Should().Be("Void");
    }

    [Fact]
    public async Task A_forbidden_response_uses_the_api_response_envelope()
    {
        await using var app = await StartAsync();
        var team = await app.TeamAsync(BillingHost.TenantA);

        var reply = await app.GetAsync("/api/v1/staff", team.Cashier);

        reply.Status.Should().Be(HttpStatusCode.Forbidden);
        reply.Body.GetProperty("succeeded").GetBoolean().Should().BeFalse();
        reply.Body.GetProperty("message").GetString().Should().Contain("staff:manage");
    }

    [Fact]
    public async Task A_foreign_facility_header_is_refused_and_forged_tenant_headers_are_ignored()
    {
        await using var app = await StartAsync();
        var team = await app.TeamAsync(BillingHost.TenantA);

        (await app.GetAsync("/api/v1/shifts/current", team.Cashier, ("X-Facility-Id", BillingHost.Lab))).Status.Should().Be(HttpStatusCode.Forbidden);
        (await app.GetAsync("/api/v1/shifts/current", team.Cashier, ("X-Facility-Id", BillingHost.Clinic))).Status.Should().Be(HttpStatusCode.OK);

        var me = await app.GetAsync("/api/v1/auth/me", team.Cashier, ("X-Tenant-Id", "victim-tenant"), ("X-Permissions", "*"));
        me.Data.GetProperty("tenantId").GetString().Should().Be(BillingHost.TenantA);
        me.Data.GetProperty("permissions").EnumerateArray().Select(p => p.GetString()).Should().NotContain("billing:approve");
    }

    [Fact]
    public async Task A_cashier_of_another_tenant_gets_404_for_the_invoice_and_cannot_pay_it()
    {
        await using var app = await StartAsync();
        var a = await app.TeamAsync(BillingHost.TenantA);
        var b = await app.TeamAsync(BillingHost.TenantB);
        var visitB = await app.ReceiveVisitAsync(BillingHost.TenantB);
        await app.ReceiveVisitAsync(BillingHost.TenantA);
        (await app.PostAsync("/api/v1/shifts/open", a.Cashier, new { openingFloat = 100 })).Status.Should().Be(HttpStatusCode.Created);

        (await app.GetAsync($"/api/v1/invoices/{visitB.Clinic}", a.Cashier)).Status.Should().Be(HttpStatusCode.NotFound);
        (await app.GetAsync($"/api/v1/visit-bills/{visitB.Lab}", a.Cashier)).Status.Should().Be(HttpStatusCode.NotFound);
        (await app.PostAsync("/api/v1/payments", a.Cashier, new { method = "Cash", amount = 100m, anchorInvoiceId = visitB.Clinic }, ("Idempotency-Key", "x-1"))).Status.Should().Be(HttpStatusCode.NotFound);
        (await app.GetAsync($"/api/v1/invoices/{visitB.Clinic}", b.Cashier)).Status.Should().Be(HttpStatusCode.OK);

        var listA = await app.GetAsync("/api/v1/invoices", a.Cashier);
        listA.Data.GetProperty("total").GetInt32().Should().Be(3);
    }

    // ── a visit from sign-in to receipt ─────────────────────────────────────────────

    [Fact]
    public async Task A_cashier_collects_a_three_facility_visit_with_one_receipt_and_a_safe_retry()
    {
        await using var app = await StartAsync();
        var team = await app.TeamAsync(BillingHost.TenantA);
        var visit = await app.ReceiveVisitAsync(BillingHost.TenantA);

        var search = await app.GetAsync("/api/v1/visit-bills?search=juan", team.Cashier);
        search.Status.Should().Be(HttpStatusCode.OK);
        var summary = search.Data.EnumerateArray().Should().ContainSingle().Subject;
        summary.GetProperty("invoiceCount").GetInt32().Should().Be(3);
        var anchor = summary.GetProperty("anchorInvoiceId").GetGuid();
        var bill = await app.GetAsync($"/api/v1/visit-bills/{anchor}", team.Cashier);
        bill.Data.GetProperty("total").GetDecimal().Should().Be(2100.25m);
        bill.Data.GetProperty("facilities").GetArrayLength().Should().Be(3);

        (await app.PostAsync("/api/v1/payments", team.Cashier, new { method = "Cash", amount = 2100.25m, anchorInvoiceId = anchor }, ("Idempotency-Key", "no-shift")))
            .Status.Should().BeOneOf(HttpStatusCode.Conflict, HttpStatusCode.BadRequest);
        (await app.PostAsync("/api/v1/shifts/open", team.Cashier, new { openingFloat = 1000 })).Status.Should().Be(HttpStatusCode.Created);

        var body = new { method = "Cash", amount = 2100.25m, tendered = 2200m, anchorInvoiceId = anchor };
        var paid = await app.PostAsync("/api/v1/payments", team.Cashier, body, ("Idempotency-Key", "pay-1"));
        paid.Status.Should().Be(HttpStatusCode.Created, paid.Body.ToString());
        paid.Data.GetProperty("receiptNumber").GetString().Should().Be("OR-000001");
        paid.Data.GetProperty("change").GetDecimal().Should().Be(99.75m);
        paid.Data.GetProperty("allocations").GetArrayLength().Should().Be(3);
        paid.Data.GetProperty("isReplay").GetBoolean().Should().BeFalse();

        var replay = await app.PostAsync("/api/v1/payments", team.Cashier, body, ("Idempotency-Key", "pay-1"));
        replay.Status.Should().Be(HttpStatusCode.OK);
        replay.Data.GetProperty("isReplay").GetBoolean().Should().BeTrue();
        replay.Data.GetProperty("id").GetGuid().Should().Be(paid.Data.GetProperty("id").GetGuid());

        var reused = await app.PostAsync("/api/v1/payments", team.Cashier, new { method = "Cash", amount = 1m, anchorInvoiceId = anchor }, ("Idempotency-Key", "pay-1"));
        reused.Status.Should().Be(HttpStatusCode.Conflict, "the same key with a different body is refused");

        var receipt = await app.GetAsync($"/api/v1/payments/{paid.Data.GetProperty("id").GetGuid()}/receipt", team.Cashier);
        receipt.Status.Should().Be(HttpStatusCode.OK);
        receipt.Data.GetProperty("number").GetString().Should().Be("OR-000001");
        receipt.Data.GetProperty("invoices").GetArrayLength().Should().Be(3);
        receipt.Data.GetProperty("balanceRemaining").GetDecimal().Should().Be(0m);

        var invoices = await app.GetAsync("/api/v1/invoices?status=Paid", team.Cashier);
        invoices.Data.GetProperty("total").GetInt32().Should().Be(3);
        (await app.GetAsync($"/api/v1/invoices/{visit.Pharmacy}", team.Cashier)).Data.GetProperty("balance").GetDecimal().Should().Be(0m);
    }

    [Fact]
    public async Task A_shift_closes_with_the_counted_cash_variance_and_a_supervisor_sees_the_day_report_and_audit_trail()
    {
        await using var app = await StartAsync();
        var team = await app.TeamAsync(BillingHost.TenantA);
        var visit = await app.ReceiveVisitAsync(BillingHost.TenantA);
        var shift = await app.PostAsync("/api/v1/shifts/open", team.Cashier, new { openingFloat = 1000 });
        var shiftId = shift.Data.GetProperty("id").GetGuid();
        (await app.PostAsync("/api/v1/payments", team.Cashier, new { method = "Cash", amount = 500m, anchorInvoiceId = visit.Clinic }, ("Idempotency-Key", "p-1"))).Status.Should().Be(HttpStatusCode.Created);

        var closed = await app.PostAsync($"/api/v1/shifts/{shiftId}/close", team.Cashier, new { countedCash = 1490m, notes = "short 10" });
        closed.Status.Should().Be(HttpStatusCode.OK, closed.Body.ToString());
        closed.Data.GetProperty("expectedCash").GetDecimal().Should().Be(1500m);
        closed.Data.GetProperty("variance").GetDecimal().Should().Be(-10m);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var report = await app.GetAsync($"/api/v1/reports/daily-collection?from={today.AddDays(-1):yyyy-MM-dd}&to={today.AddDays(1):yyyy-MM-dd}&utcOffsetMinutes=0", team.Supervisor);
        report.Status.Should().Be(HttpStatusCode.OK, report.Body.ToString());
        report.Data.GetProperty("collected").GetDecimal().Should().Be(500m);

        var audit = await app.GetAsync("/api/v1/audit?entityType=CashierShift", team.Supervisor);
        audit.Data.EnumerateArray().Select(a => a.GetProperty("action").GetString()).Should().Contain("shift.closed");
    }

    [Fact]
    public async Task Enums_in_a_query_string_are_member_names_and_a_number_is_a_400()
    {
        await using var app = await StartAsync();
        var team = await app.TeamAsync(BillingHost.TenantA);

        (await app.GetAsync("/api/v1/invoices?status=Paid&status=open", team.Cashier)).Status.Should().Be(HttpStatusCode.OK);
        (await app.GetAsync("/api/v1/invoices?status=2", team.Cashier)).Status.Should().Be(HttpStatusCode.BadRequest);
        (await app.GetAsync("/api/v1/invoices?status=Paid&status=0", team.Cashier)).Status.Should().Be(HttpStatusCode.BadRequest);
        (await app.GetAsync("/api/v1/invoices?status=Bogus", team.Cashier)).Status.Should().Be(HttpStatusCode.BadRequest);
    }

    // ── structural guarantee ────────────────────────────────────────────────────────

    [Fact]
    public void Every_controller_action_declares_the_permission_it_needs_unless_it_is_login_or_me()
    {
        var controllers = typeof(HasPermissionAttribute).Assembly.GetTypes().Where(t => typeof(ControllerBase).IsAssignableFrom(t) && !t.IsAbstract).ToList();
        controllers.Should().NotBeEmpty();

        var publicActions = new List<string>();
        var unguarded = new List<string>();
        foreach (var controller in controllers)
        {
            var classAnonymous = controller.GetCustomAttributes<AllowAnonymousAttribute>(true).Any();
            var classPermission = controller.GetCustomAttributes<HasPermissionAttribute>(true).Any();
            foreach (var action in controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                         .Where(m => m.GetCustomAttributes().OfType<IActionHttpMethodProvider>().Any()))
            {
                var name = $"{controller.Name}.{action.Name}";
                if (classAnonymous || action.GetCustomAttributes<AllowAnonymousAttribute>(true).Any()) publicActions.Add(name);
                else if (!classPermission && !action.GetCustomAttributes<HasPermissionAttribute>(true).Any() && name != $"{nameof(AuthController)}.{nameof(AuthController.Me)}") unguarded.Add(name);
            }
        }

        publicActions.Should().BeEquivalentTo(new[] { "AuthController.Login" });
        unguarded.Should().BeEmpty("every non-public action must declare the permission it needs");
    }
}
