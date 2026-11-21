using System;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading.Tasks;
using ClinicEz.Comms.Domain.Entities;
using ClinicEz.Comms.Infrastructure.Hubs;
using ClinicEz.Comms.Infrastructure.Middleware;
using ClinicEz.Comms.Infrastructure.Services;
using ClinicEz.Comms.MigrationTool.Services;
using ClinicEz.Comms.MigrationTool.Tests.Helpers;
using ClinicEz.Shared.Interop.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Comms.MigrationTool.Tests;

public class AdversarialWritePauseAndRollbackChallengeTests : IDisposable
{
    private readonly MigrationTestFixture _fixture = new();

    #region Scope 1: Concurrency and Write-Pause Gate

    [Theory]
    [InlineData("POST")]
    [InlineData("PUT")]
    [InlineData("PATCH")]
    [InlineData("DELETE")]
    public async Task WritePause_MutatingMethods_Return423WithProblemDetailsAndRetryAfter(string method)
    {
        // Arrange
        const string lockedTenantId = "tenant-adv-locked-1";
        var gate = new TenantMigrationGate();
        gate.SetState(new TenantMigrationState
        {
            TenantId = lockedTenantId,
            State = MigrationLifecycleState.Exporting,
            LockedAtUtc = DateTime.UtcNow,
            SourceCellId = "cloud-main",
            TargetCellId = "onprem-edge",
            TargetCellType = "OnPremise"
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

        var context = new DefaultHttpContext();
        context.Request.Method = method;
        context.Request.Path = "/api/v1/comms/conversations";
        context.Request.Headers["X-Tenant-Id"] = lockedTenantId;
        context.Response.Body = new MemoryStream();

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        Assert.False(nextCalled, $"Pipeline should have been halted for mutating method {method}");
        Assert.Equal(StatusCodes.Status423Locked, context.Response.StatusCode);
        Assert.Equal("5", context.Response.Headers.RetryAfter.ToString());
        Assert.Equal("application/problem+json", context.Response.ContentType);

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(context.Response.Body);
        var bodyJson = await reader.ReadToEndAsync();
        using var doc = JsonDocument.Parse(bodyJson);

        Assert.Equal(423, doc.RootElement.GetProperty("status").GetInt32());
        Assert.Equal("Tenant Locked for Migration", doc.RootElement.GetProperty("title").GetString());
        Assert.Equal("https://clinicez.com/errors/tenant-locked-for-migration", doc.RootElement.GetProperty("type").GetString());
        Assert.Equal(lockedTenantId, doc.RootElement.GetProperty("tenantId").GetString());
        Assert.Equal("Exporting", doc.RootElement.GetProperty("migrationState").GetString());
        Assert.Equal("OnPremise", doc.RootElement.GetProperty("targetCellType").GetString());
        Assert.Equal(5, doc.RootElement.GetProperty("retryAfterSeconds").GetInt32());
    }

    [Fact]
    public async Task WritePause_UnlockedTenant_MutatingRequestsPassThrough()
    {
        // Arrange
        const string unlockedTenantId = "tenant-adv-unlocked";
        var gate = new TenantMigrationGate();

        bool nextCalled = false;
        RequestDelegate next = (ctx) =>
        {
            nextCalled = true;
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            return Task.CompletedTask;
        };

        var middleware = new TenantMigrationWritePauseMiddleware(
            next, gate, NullLogger<TenantMigrationWritePauseMiddleware>.Instance);

        var context = new DefaultHttpContext();
        context.Request.Method = "POST";
        context.Request.Path = "/api/v1/comms/conversations";
        context.Request.Headers["X-Tenant-Id"] = unlockedTenantId;

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        Assert.True(nextCalled);
        Assert.Equal(StatusCodes.Status200OK, context.Response.StatusCode);
    }

    [Theory]
    [InlineData("true")]
    [InlineData("admin-key-xyz")]
    public async Task WritePause_XMigrationBypass_AllowsAuthorizedOperationalBypass(string bypassValue)
    {
        // Arrange
        const string lockedTenantId = "tenant-adv-bypass";
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
            ctx.Response.StatusCode = StatusCodes.Status201Created;
            return Task.CompletedTask;
        };

        var middleware = new TenantMigrationWritePauseMiddleware(
            next, gate, NullLogger<TenantMigrationWritePauseMiddleware>.Instance);

        var context = new DefaultHttpContext();
        context.Request.Method = "POST";
        context.Request.Path = "/api/v1/comms/conversations";
        context.Request.Headers["X-Tenant-Id"] = lockedTenantId;
        context.Request.Headers["X-Migration-Bypass"] = bypassValue;

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        Assert.True(nextCalled);
        Assert.Equal(StatusCodes.Status201Created, context.Response.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task WritePause_EmptyOrWhitespaceBypass_IsRejectedWith423(string emptyBypass)
    {
        // Arrange
        const string lockedTenantId = "tenant-adv-empty-bypass";
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
            return Task.CompletedTask;
        };

        var middleware = new TenantMigrationWritePauseMiddleware(
            next, gate, NullLogger<TenantMigrationWritePauseMiddleware>.Instance);

        var context = new DefaultHttpContext();
        context.Request.Method = "POST";
        context.Request.Path = "/api/v1/comms/conversations";
        context.Request.Headers["X-Tenant-Id"] = lockedTenantId;
        context.Request.Headers["X-Migration-Bypass"] = emptyBypass;
        context.Response.Body = new MemoryStream();

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        Assert.False(nextCalled);
        Assert.Equal(StatusCodes.Status423Locked, context.Response.StatusCode);
    }

    [Theory]
    [InlineData("GET")]
    [InlineData("HEAD")]
    [InlineData("OPTIONS")]
    public async Task WritePause_NonMutatingMethods_PassThroughWhenLocked(string method)
    {
        // Arrange
        const string lockedTenantId = "tenant-adv-reads";
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

        var context = new DefaultHttpContext();
        context.Request.Method = method;
        context.Request.Path = "/api/v1/comms/conversations/123";
        context.Request.Headers["X-Tenant-Id"] = lockedTenantId;

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        Assert.True(nextCalled);
        Assert.Equal(StatusCodes.Status200OK, context.Response.StatusCode);
    }

    [Fact]
    public async Task SignalR_MutatingMethods_BlockedWhenLocked_AndReadMethodsAllowed()
    {
        // Arrange
        const string lockedTenantId = "tenant-adv-signalr";
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

        // 1. Mutating methods MUST throw HubException
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

            var ex = await Assert.ThrowsAsync<HubException>(async () =>
            {
                await filter.InvokeMethodAsync(invocationContext, next);
            });

            Assert.Contains("Tenant is moving to on-premise/cloud. Writes are temporarily paused.", ex.Message);
        }

        // 2. Read methods MUST pass through even when locked
        var readMethodInfo = typeof(CommsHub).GetMethod(nameof(CommsHub.GetMessagesAfterSeq))!;
        var readInvocationContext = new HubInvocationContext(
            hubCallerContextMock.Object,
            Mock.Of<IServiceProvider>(),
            hubMock.Object,
            readMethodInfo,
            new object?[] { Guid.NewGuid(), 0L });

        bool readNextCalled = false;
        Func<HubInvocationContext, ValueTask<object?>> readNext = (ctx) =>
        {
            readNextCalled = true;
            return ValueTask.FromResult<object?>("ReadSuccess");
        };

        var readResult = await filter.InvokeMethodAsync(readInvocationContext, readNext);
        Assert.True(readNextCalled);
        Assert.Equal("ReadSuccess", readResult);
    }

    #endregion

    #region Scope 2: Outbox Drain and Replay Protection

    [Fact]
    public async Task OutboxDrain_DrainsInFlightAndStampsDispatchedAtUtc()
    {
        // Arrange
        const string tenantId = "tenant-adv-drain";
        var db = _fixture.CreateDbContext("adv_drain_db");

        var targetMsg = new InteropOutboxMessage
        {
            MessageId = Guid.NewGuid(),
            CorrelationId = Guid.NewGuid(),
            Type = "comms.message.replicate",
            EnvelopeJson = $"{{\"TenantId\":\"{tenantId}\",\"Content\":\"Target Msg\"}}",
            CreatedAtUtc = DateTime.UtcNow,
            DispatchedAtUtc = null
        };

        var otherMsg = new InteropOutboxMessage
        {
            MessageId = Guid.NewGuid(),
            CorrelationId = Guid.NewGuid(),
            Type = "comms.message.replicate",
            EnvelopeJson = "{\"TenantId\":\"other-tenant\",\"Content\":\"Other Msg\"}",
            CreatedAtUtc = DateTime.UtcNow,
            DispatchedAtUtc = null
        };

        db.InteropOutbox.AddRange(targetMsg, otherMsg);
        await db.SaveChangesAsync();

        var drainService = new OutboxDrainService(db, NullLogger<OutboxDrainService>.Instance);

        // Act
        var drainResult = await drainService.DrainAsync(tenantId, TimeSpan.FromSeconds(5));

        // Assert
        Assert.True(drainResult.IsDrained);
        Assert.Equal(0, drainResult.PendingCount);

        var refreshedTarget = await db.InteropOutbox.FindAsync(targetMsg.MessageId);
        var refreshedOther = await db.InteropOutbox.FindAsync(otherMsg.MessageId);

        Assert.NotNull(refreshedTarget?.DispatchedAtUtc);
        Assert.Equal(1, refreshedTarget?.AttemptCount);
        Assert.Null(refreshedOther?.DispatchedAtUtc);
    }

    [Fact]
    public async Task TargetImport_OutboxReplayProtection_ImportedOutboxHasDispatchedAtUtcAndCannotBeReDispatched()
    {
        // Arrange
        const string tenantId = "tenant-adv-replay-guard";
        var sourceDb = _fixture.CreateDbContext("source_replay_guard_db");
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, "replay-guard.clinicez-comms-bundle");
        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);
        await exportService.ExportAsync(tenantId, bundlePath, _fixture.MigrationPassphrase, _fixture.SignerPrivateKeyPem);

        var targetDb = _fixture.CreateDbContext("target_replay_guard_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        // Act
        var importResult = await importService.ImportAsync(
            bundlePath,
            _fixture.MigrationPassphrase,
            _fixture.SignerPublicKeyPem);

        // Assert
        Assert.True(importResult.IsSuccess);

        var importedOutbox = await targetDb.InteropOutbox.ToListAsync();
        Assert.NotEmpty(importedOutbox);

        // Every imported message must have DispatchedAtUtc stamped (non-null)
        Assert.All(importedOutbox, msg =>
        {
            Assert.NotNull(msg.DispatchedAtUtc);
        });

        // The query executed by InteropRelayService MUST find 0 pending messages
        var now = DateTime.UtcNow;
        var pendingRelayMessages = await targetDb.InteropOutbox
            .Where(x => x.DispatchedAtUtc == null && x.DeadLetteredAtUtc == null && x.NextAttemptAtUtc <= now)
            .ToListAsync();

        Assert.Empty(pendingRelayMessages);
    }

    #endregion

    #region Scope 3: Atomic Rollback and Collision Detection

    [Fact]
    public async Task AtomicRollback_MidImportFailure_CleansStagedFilesAndRollsBackDb()
    {
        // Arrange: Create a valid bundle first
        const string tenantId = "tenant-adv-mid-import-fail";
        var sourceDb = _fixture.CreateDbContext("source_mid_fail_db");
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, "mid-fail.clinicez-comms-bundle");
        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);
        await exportService.ExportAsync(tenantId, bundlePath, _fixture.MigrationPassphrase, _fixture.SignerPrivateKeyPem);

        // Tamper with the attachment file inside the ZIP archive so decryption fails during attachment loop
        var extractedDir = Path.Combine(_fixture.TempDirectory, "tampered_extracted");
        Directory.CreateDirectory(extractedDir);
        System.IO.Compression.ZipFile.ExtractToDirectory(bundlePath, extractedDir);

        var attachmentsDir = Path.Combine(extractedDir, "attachments");
        var attachmentFiles = Directory.GetFiles(attachmentsDir);
        Assert.NotEmpty(attachmentFiles);

        // Flip bytes in the first attachment to cause AES-GCM tag mismatch
        var firstAtt = attachmentFiles[0];
        var bytes = await File.ReadAllBytesAsync(firstAtt);
        bytes[0] ^= 0xFF;
        await File.WriteAllBytesAsync(firstAtt, bytes);

        // Re-zip
        var tamperedBundlePath = Path.Combine(_fixture.BundlesDirectory, "tampered-mid-fail.clinicez-comms-bundle");
        System.IO.Compression.ZipFile.CreateFromDirectory(extractedDir, tamperedBundlePath);

        var targetDb = _fixture.CreateDbContext("target_mid_fail_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        // Act & Assert
        await Assert.ThrowsAnyAsync<CryptographicException>(() =>
            importService.ImportAsync(
                tamperedBundlePath,
                _fixture.MigrationPassphrase,
                _fixture.SignerPublicKeyPem));

        // Verify DB transaction rolled back completely (0 rows)
        var convs = await targetDb.Conversations.IgnoreQueryFilters().CountAsync();
        var msgs = await targetDb.Messages.IgnoreQueryFilters().CountAsync();
        var atts = await targetDb.MessageAttachments.IgnoreQueryFilters().CountAsync();
        Assert.Equal(0, convs);
        Assert.Equal(0, msgs);
        Assert.Equal(0, atts);

        // Verify staging storage has zero leftover files
        var storageFiles = Directory.GetFiles(_fixture.TargetStorageDirectory, "*.*", SearchOption.AllDirectories);
        Assert.Empty(storageFiles);

        // Verify state is Aborted
        var state = targetGate.GetState(tenantId);
        Assert.NotNull(state);
        Assert.Equal(MigrationLifecycleState.Aborted, state.State);
    }

    [Fact]
    public async Task AtomicRollback_DryRun_CommitsZeroRowsAndCleansStagingFiles()
    {
        // Arrange
        const string tenantId = "tenant-adv-dryrun";
        var sourceDb = _fixture.CreateDbContext("source_dryrun_adv_db");
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, "adv-dryrun.clinicez-comms-bundle");
        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);
        await exportService.ExportAsync(tenantId, bundlePath, _fixture.MigrationPassphrase, _fixture.SignerPrivateKeyPem);

        var targetDb = _fixture.CreateDbContext("target_dryrun_adv_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        // Act
        var result = await importService.ImportAsync(
            bundlePath,
            _fixture.MigrationPassphrase,
            _fixture.SignerPublicKeyPem,
            dryRun: true);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.True(result.IsDryRun);

        // 0 rows committed to DB
        Assert.Equal(0, await targetDb.Conversations.IgnoreQueryFilters().CountAsync());
        Assert.Equal(0, await targetDb.Messages.IgnoreQueryFilters().CountAsync());
        Assert.Equal(0, await targetDb.MessageAttachments.IgnoreQueryFilters().CountAsync());
        Assert.Equal(0, await targetDb.Participants.IgnoreQueryFilters().CountAsync());

        // Staging storage is 100% clean
        var storageFiles = Directory.GetFiles(_fixture.TargetStorageDirectory, "*.*", SearchOption.AllDirectories);
        Assert.Empty(storageFiles);

        // Gate state unlocked and Idle
        var state = targetGate.GetState(tenantId);
        Assert.NotNull(state);
        Assert.Equal(MigrationLifecycleState.Idle, state.State);
    }

    [Fact]
    public async Task CollisionDetection_BlocksImportUnlessAllowOverwrite()
    {
        // Arrange
        const string tenantId = "tenant-adv-collision";
        var sourceDb = _fixture.CreateDbContext("source_adv_collision_db");
        var sourceStorage = _fixture.CreateStorageService(_fixture.SourceStorageDirectory);
        var sourceCrypto = _fixture.CreateCryptoService(_fixture.SourceCellSecret);
        var sourceGate = new TenantMigrationGate();
        var sourceDrain = new OutboxDrainService(sourceDb, null!);

        await _fixture.SeedTenantDataAsync(sourceDb, sourceStorage, sourceCrypto, tenantId);

        var bundlePath = Path.Combine(_fixture.BundlesDirectory, "adv-collision.clinicez-comms-bundle");
        var exportService = new MigrationExportService(sourceDb, sourceStorage, sourceCrypto, sourceGate, sourceDrain);
        await exportService.ExportAsync(tenantId, bundlePath, _fixture.MigrationPassphrase, _fixture.SignerPrivateKeyPem);

        var targetDb = _fixture.CreateDbContext("target_adv_collision_db");
        var targetStorage = _fixture.CreateStorageService(_fixture.TargetStorageDirectory);
        var targetCrypto = _fixture.CreateCryptoService(_fixture.TargetCellSecret);
        var targetGate = new TenantMigrationGate();

        // Pre-seed an existing conversation for this tenant in the target DB
        targetDb.Conversations.Add(new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = "facility-pre-existing",
            Title = "Pre-existing Conversation Before Migration"
        });
        await targetDb.SaveChangesAsync();

        var importService = new MigrationImportService(targetDb, targetStorage, targetCrypto, targetGate);

        // Act 1: Import with allowOverwrite = false MUST fail
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            importService.ImportAsync(
                bundlePath,
                _fixture.MigrationPassphrase,
                _fixture.SignerPublicKeyPem,
                allowOverwrite: false));

        Assert.Contains("collision", ex.Message, StringComparison.OrdinalIgnoreCase);

        // Existing data must remain untouched
        var convsAfterCollision = await targetDb.Conversations.IgnoreQueryFilters().Where(c => c.TenantId == tenantId).ToListAsync();
        Assert.Single(convsAfterCollision);
        Assert.Equal("Pre-existing Conversation Before Migration", convsAfterCollision[0].Title);

        // Act 2: Import with allowOverwrite = true MUST succeed and overwrite cleanly
        var overwriteResult = await importService.ImportAsync(
            bundlePath,
            _fixture.MigrationPassphrase,
            _fixture.SignerPublicKeyPem,
            allowOverwrite: true);

        Assert.True(overwriteResult.IsSuccess);
        var convsAfterOverwrite = await targetDb.Conversations.IgnoreQueryFilters().Where(c => c.TenantId == tenantId).ToListAsync();
        // Bundle has 2 seeded conversations
        Assert.Equal(2, convsAfterOverwrite.Count);
        Assert.DoesNotContain(convsAfterOverwrite, c => c.Title == "Pre-existing Conversation Before Migration");
    }

    #endregion

    public void Dispose() => _fixture.Dispose();
}
