using System;
using System.IO;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.Hubs;
using ClinicEz.Comms.Infrastructure.Middleware;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.MigrationTool.Tests.Helpers;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Comms.MigrationTool.Tests;

public class MigrationWritePauseAndOutboxTests : IDisposable
{
    private readonly MigrationTestFixture _fixture = new();

    [Fact]
    public async Task WritePauseMiddleware_ReturnsHttp423Locked_ForMutatingRequestsOnLockedTenant()
    {
        // Arrange
        const string lockedTenantId = "tenant-locked-001";
        var gate = new TenantMigrationGate();
        gate.SetState(new TenantMigrationState
        {
            TenantId = lockedTenantId,
            State = MigrationLifecycleState.Exporting,
            LockedAtUtc = DateTime.UtcNow,
            SourceCellId = "cloud",
            TargetCellId = "onprem"
        });

        bool nextCalled = false;
        RequestDelegate next = (ctx) =>
        {
            nextCalled = true;
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            return Task.CompletedTask;
        };

        var middleware = new TenantMigrationWritePauseMiddleware(
            next, gate, NullLogger<TenantMigrationWritePauseMiddleware>.Instance);

        // Test mutating methods: POST, PUT, PATCH, DELETE
        var mutatingMethods = new[] { "POST", "PUT", "PATCH", "DELETE" };
        foreach (var method in mutatingMethods)
        {
            nextCalled = false;
            var context = new DefaultHttpContext();
            context.Request.Method = method;
            context.Request.Path = "/api/v1/comms/conversations/123/messages";
            context.Request.Headers["X-Tenant-Id"] = lockedTenantId;
            context.Response.Body = new MemoryStream();

            // Act
            await middleware.InvokeAsync(context);

            // Assert
            Assert.False(nextCalled);
            Assert.Equal(StatusCodes.Status423Locked, context.Response.StatusCode);
            Assert.Equal("5", context.Response.Headers.RetryAfter.ToString());
            Assert.Contains("application/problem+json", context.Response.ContentType);

            context.Response.Body.Seek(0, SeekOrigin.Begin);
            using var reader = new StreamReader(context.Response.Body);
            var bodyText = await reader.ReadToEndAsync();
            using var doc = JsonDocument.Parse(bodyText);
            Assert.Equal(423, doc.RootElement.GetProperty("status").GetInt32());
            Assert.Equal(lockedTenantId, doc.RootElement.GetProperty("tenantId").GetString());
            Assert.Equal("Exporting", doc.RootElement.GetProperty("migrationState").GetString());
        }
    }

    [Fact]
    public async Task WritePauseMiddleware_AllowsSafeReadMethodsAndBypassHeader()
    {
        // Arrange
        const string lockedTenantId = "tenant-locked-002";
        var gate = new TenantMigrationGate();
        gate.SetState(new TenantMigrationState
        {
            TenantId = lockedTenantId,
            State = MigrationLifecycleState.Exporting
        });

        bool nextCalled = false;
        RequestDelegate next = (ctx) =>
        {
            nextCalled = true;
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            return Task.CompletedTask;
        };

        var middleware = new TenantMigrationWritePauseMiddleware(
            next, gate, NullLogger<TenantMigrationWritePauseMiddleware>.Instance);

        // 1. GET request passes through
        var getContext = new DefaultHttpContext();
        getContext.Request.Method = "GET";
        getContext.Request.Path = "/api/v1/comms/conversations/123";
        getContext.Request.Headers["X-Tenant-Id"] = lockedTenantId;

        await middleware.InvokeAsync(getContext);
        Assert.True(nextCalled);
        Assert.Equal(StatusCodes.Status200OK, getContext.Response.StatusCode);

        // 2. HEAD request passes through
        nextCalled = false;
        var headContext = new DefaultHttpContext();
        headContext.Request.Method = "HEAD";
        headContext.Request.Path = "/api/v1/comms/conversations/123";
        headContext.Request.Headers["X-Tenant-Id"] = lockedTenantId;

        await middleware.InvokeAsync(headContext);
        Assert.True(nextCalled);

        // 3. Mutating POST with X-Migration-Bypass passes through
        nextCalled = false;
        var bypassContext = new DefaultHttpContext();
        bypassContext.Request.Method = "POST";
        bypassContext.Request.Path = "/api/v1/comms/conversations";
        bypassContext.Request.Headers["X-Tenant-Id"] = lockedTenantId;
        bypassContext.Request.Headers["X-Migration-Bypass"] = "admin-secret";

        await middleware.InvokeAsync(bypassContext);
        Assert.True(nextCalled);
        Assert.Equal(StatusCodes.Status200OK, bypassContext.Response.StatusCode);
    }

    [Fact]
    public async Task SignalRHubFilter_ThrowsHubException_OnMutatingMethodsForLockedTenant()
    {
        // Arrange
        const string lockedTenantId = "tenant-signalr-locked";
        var gate = new TenantMigrationGate();
        gate.SetState(new TenantMigrationState
        {
            TenantId = lockedTenantId,
            State = MigrationLifecycleState.Exporting
        });

        var filter = new TenantMigrationHubFilter(gate);

        var user = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim("tenant_id", lockedTenantId),
            new Claim(ClaimTypes.NameIdentifier, "staff-01")
        }, "TestAuth"));

        var hubCallerContextMock = new Mock<HubCallerContext>();
        hubCallerContextMock.SetupGet(c => c.User).Returns(user);

        var hubMock = new Mock<Hub>();

        var mutatingMethods = new[]
        {
            nameof(CommsHub.SendMessage),
            nameof(CommsHub.SendReaction),
            nameof(CommsHub.AcknowledgeMessage),
            nameof(CommsHub.ConfirmDelivery)
        };

        foreach (var method in mutatingMethods)
        {
            var methodInfo = typeof(CommsHub).GetMethod(method)!;
            var invocationContext = new HubInvocationContext(
                hubCallerContextMock.Object,
                Mock.Of<IServiceProvider>(),
                hubMock.Object,
                methodInfo,
                Array.Empty<object?>());

            Func<HubInvocationContext, ValueTask<object?>> next = (ctx) => ValueTask.FromResult<object?>("Success");

            // Act & Assert
            var ex = await Assert.ThrowsAsync<HubException>(async () =>
            {
                await filter.InvokeMethodAsync(invocationContext, next);
            });

            Assert.Contains("Tenant is moving", ex.Message, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task OutboxDrainService_QuiescesPendingMessagesPriorToExport()
    {
        // Arrange
        const string tenantId = "tenant-drain-test";
        var db = _fixture.CreateDbContext("drain_test_db");

        var msg1 = new InteropOutboxMessage
        {
            MessageId = Guid.NewGuid(),
            CorrelationId = Guid.NewGuid(),
            Type = "comms.message.replicate",
            EnvelopeJson = $"{{\"TenantId\":\"{tenantId}\",\"Content\":\"Msg 1\"}}",
            CreatedAtUtc = DateTime.UtcNow,
            DispatchedAtUtc = null
        };
        var msg2 = new InteropOutboxMessage
        {
            MessageId = Guid.NewGuid(),
            CorrelationId = Guid.NewGuid(),
            Type = "comms.message.replicate",
            EnvelopeJson = $"{{\"TenantId\":\"{tenantId}\",\"Content\":\"Msg 2\"}}",
            CreatedAtUtc = DateTime.UtcNow,
            DispatchedAtUtc = null
        };
        var otherTenantMsg = new InteropOutboxMessage
        {
            MessageId = Guid.NewGuid(),
            CorrelationId = Guid.NewGuid(),
            Type = "comms.message.replicate",
            EnvelopeJson = "{\"TenantId\":\"other-tenant\",\"Content\":\"Msg 3\"}",
            CreatedAtUtc = DateTime.UtcNow,
            DispatchedAtUtc = null
        };

        db.InteropOutbox.AddRange(msg1, msg2, otherTenantMsg);
        await db.SaveChangesAsync();

        var drainService = new OutboxDrainService(db, NullLogger<OutboxDrainService>.Instance);

        // Act
        var result = await drainService.DrainAsync(tenantId, TimeSpan.FromSeconds(5));

        // Assert
        Assert.True(result.IsDrained);
        Assert.Equal(0, result.PendingCount);

        var refreshed1 = await db.InteropOutbox.FindAsync(msg1.MessageId);
        var refreshed2 = await db.InteropOutbox.FindAsync(msg2.MessageId);
        var refreshedOther = await db.InteropOutbox.FindAsync(otherTenantMsg.MessageId);

        Assert.NotNull(refreshed1?.DispatchedAtUtc);
        Assert.NotNull(refreshed2?.DispatchedAtUtc);
        // Other tenant's outbox is unaffected
        Assert.Null(refreshedOther?.DispatchedAtUtc);
    }

    public void Dispose() => _fixture.Dispose();
}
