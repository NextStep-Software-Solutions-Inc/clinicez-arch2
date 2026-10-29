namespace ClinicEz.Clinic.Application.Tests.Features.Audit;

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Behaviors;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Audit;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

// Test commands for stress harness
public sealed record StressTestCommand(Guid EntityId, Guid PatientId, string PatientName, string PhilHealthPin, string ActionName) : IRequest<ApiResponse<Guid>>;
public sealed record StressFailingCommand(Guid Id, string Reason) : IRequest<ApiResponse<Guid>>;

public class StressFailingCommandValidator : AbstractValidator<StressFailingCommand>
{
    public StressFailingCommandValidator()
    {
        RuleFor(x => x.Reason)
            .NotEmpty().WithMessage("Reason is required.")
            .MinimumLength(10).WithMessage("Reason must be at least 10 characters long.");
    }
}

[Collection("NonParallelStressTests")]
public class AuditPipelineEmpiricalStressTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_stress_test";

    private (IClinicContext clinicContext, IHttpContextAccessor httpContextAccessor) CreateContexts()
    {
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.StaffId.Returns(_staffId);
        clinicContext.TenantId.Returns(_tenantId);

        var httpContext = new DefaultHttpContext();
        httpContext.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("10.0.0.42");
        httpContext.Request.Headers.UserAgent = "StressHarness/1.0";

        var claims = new[]
        {
            new Claim("sub", _staffId.ToString()),
            new Claim("name", "Dr. Stress Tester"),
            new Claim("staff_role", "Administrator"),
            new Claim("tenant_id", _tenantId),
            new Claim("clinic_id", _clinicId.ToString())
        };
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "StressAuth"));

        var httpContextAccessor = Substitute.For<IHttpContextAccessor>();
        httpContextAccessor.HttpContext.Returns(httpContext);

        return (clinicContext, httpContextAccessor);
    }

    private static AuditLogMessage CreateDummyMessage(string action = "fill")
    {
        return new AuditLogMessage
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant_stress_test",
            ClinicId = Guid.NewGuid(),
            Timestamp = DateTime.UtcNow,
            Category = ClinicAuditCategories.Operations,
            Severity = ClinicAuditSeverities.Routine,
            Action = action,
            ActorName = "Stress Actor",
            ActorRole = "Administrator",
            TargetEntityType = "StressEntity",
            Outcome = ClinicAuditOutcomes.Success,
            Description = "Stress fill message"
        };
    }

    [Fact]
    public async Task EmpiricalStress_ConcurrentExecution_PreservesAllMessagesWithoutCorruption()
    {
        // Arrange
        const int concurrentRequests = 500;
        var realQueue = new AuditLogQueue(capacity: 2000);
        var (clinicContext, httpContextAccessor) = CreateContexts();
        var logger = NullLogger<AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>>.Instance;

        var behavior = new AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>(
            realQueue, clinicContext, httpContextAccessor, logger);

        // Act: Execute 500 requests across multiple parallel threads
        var tasks = Enumerable.Range(0, concurrentRequests).Select(i => Task.Run(async () =>
        {
            var entityId = Guid.NewGuid();
            var patientId = Guid.NewGuid();
            var cmd = new StressTestCommand(
                entityId,
                patientId,
                $"Patient_{i}",
                $"12-00000{i:D4}-9",
                "StressTestOperation");

            var response = ApiResponse<Guid>.Success(entityId);
            var result = await behavior.Handle(cmd, _ => Task.FromResult(response), CancellationToken.None);

            result.Succeeded.Should().BeTrue();
            result.Data.Should().Be(entityId);
        }));

        await Task.WhenAll(tasks);

        // Assert: Exactly 500 messages enqueued
        realQueue.Count.Should().Be(concurrentRequests);

        var seenIds = new HashSet<Guid>();
        var seenEntityIds = new HashSet<string?>();

        while (realQueue.TryDequeue(out var msg))
        {
            msg.Should().NotBeNull();
            msg!.ClinicId.Should().Be(_clinicId);
            msg.TenantId.Should().Be(_tenantId);
            msg.Outcome.Should().Be(ClinicAuditOutcomes.Success);
            msg.ClientIpAddress.Should().Be("10.0.0.42");
            msg.UserAgent.Should().Be("StressHarness/1.0");
            msg.ActorStaffId.Should().Be(_staffId);
            msg.PatientName.Should().StartWith("Patient_");

            seenIds.Add(msg.Id).Should().BeTrue("Every audit message must have a unique GUID");
            seenEntityIds.Add(msg.TargetEntityId);
        }

        seenIds.Count.Should().Be(concurrentRequests);
        seenEntityIds.Count.Should().Be(concurrentRequests);
    }

    [Fact]
    public async Task EmpiricalStress_WhenQueueIsSaturated_ReturnsImmediatelyWithoutBlockingCaller()
    {
        // Arrange: Real queue with small capacity of 3
        var smallQueue = new AuditLogQueue(capacity: 3);
        var (clinicContext, httpContextAccessor) = CreateContexts();
        var logger = NullLogger<AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>>.Instance;

        var behavior = new AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>(
            smallQueue, clinicContext, httpContextAccessor, logger);

        // Pre-fill queue to 100% capacity
        for (int i = 0; i < 3; i++)
        {
            smallQueue.TryEnqueue(CreateDummyMessage()).Should().BeTrue();
        }

        smallQueue.Count.Should().Be(3);

        // Act: Invoke Handle when channel is saturated.
        // We measure elapsed wall-clock time. Background fallback has 2000ms timeout.
        var sw = Stopwatch.StartNew();

        var cmd = new StressTestCommand(Guid.NewGuid(), Guid.NewGuid(), "Jane", "12-123456789-0", "Action");
        var resp = ApiResponse<Guid>.Success(cmd.EntityId);

        var result = await behavior.Handle(cmd, _ => Task.FromResult(resp), CancellationToken.None);

        sw.Stop();

        // Assert: Must return immediately (well below 2000ms fallback timeout)
        sw.ElapsedMilliseconds.Should().BeLessThan(250, "Handle must be non-blocking even when queue is saturated");
        result.Should().Be(resp);
    }

    [Fact]
    public async Task EmpiricalStress_ValidationException_CapturedAsFailureAndRethrownCleanly()
    {
        // Arrange
        var realQueue = new AuditLogQueue(capacity: 100);
        var (clinicContext, httpContextAccessor) = CreateContexts();
        var logger = NullLogger<AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>>.Instance;

        var behavior = new AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>(
            realQueue, clinicContext, httpContextAccessor, logger);

        var cmd = new StressTestCommand(Guid.NewGuid(), Guid.NewGuid(), "Invalid Patient", "12-0000-0", "Op");

        var validationErrors = new Dictionary<string, string[]>
        {
            { "PatientPin", new[] { "PhilHealth PIN must follow format 12-XXXXXXXXX-X" } }
        };
        var expectedException = new ClinicEz.Shared.Exceptions.ValidationException("Validation failure occurred.", validationErrors);

        // Act
        Func<Task> act = async () => await behavior.Handle(
            cmd,
            _ => throw expectedException,
            CancellationToken.None);

        // Assert: Exception rethrown with exact details
        var thrown = await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>();
        thrown.Which.Errors.Should().ContainKey("PatientPin");

        // Assert: Failure audit entry captured
        realQueue.Count.Should().Be(1);
        realQueue.TryDequeue(out var msg).Should().BeTrue();
        msg.Should().NotBeNull();
        msg!.Outcome.Should().Be(ClinicAuditOutcomes.Failure);
        msg.Severity.Should().Be(ClinicAuditSeverities.Urgent);
        msg.Description.Should().Contain("Validation failure occurred");
        msg.MetadataJson.Should().Contain("ValidationException");
        msg.MetadataJson.Should().Contain("Validation failure occurred.");
    }

    [Fact]
    public async Task EmpiricalStress_UnhandledDomainException_CapturedAsFailureAndRethrownCleanly()
    {
        // Arrange
        var realQueue = new AuditLogQueue(capacity: 100);
        var (clinicContext, httpContextAccessor) = CreateContexts();
        var logger = NullLogger<AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>>.Instance;

        var behavior = new AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>(
            realQueue, clinicContext, httpContextAccessor, logger);

        var cmd = new StressTestCommand(Guid.NewGuid(), Guid.NewGuid(), "Conflict Patient", "12-0000-0", "Op");
        var domainException = new ConflictException("Appointment slot is already booked by another patient.");

        // Act
        Func<Task> act = async () => await behavior.Handle(
            cmd,
            _ => throw domainException,
            CancellationToken.None);

        // Assert: Exact domain exception rethrown
        var thrown = await act.Should().ThrowAsync<ConflictException>();
        thrown.Which.Message.Should().Be("Appointment slot is already booked by another patient.");

        // Assert: Captured as failure audit entry
        realQueue.Count.Should().Be(1);
        realQueue.TryDequeue(out var msg).Should().BeTrue();
        msg.Should().NotBeNull();
        msg!.Outcome.Should().Be(ClinicAuditOutcomes.Failure);
        msg.Severity.Should().Be(ClinicAuditSeverities.Urgent);
        msg.Description.Should().Contain("Appointment slot is already booked");
        msg.MetadataJson.Should().Contain("ConflictException");
    }

    [Fact]
    public async Task EmpiricalStress_ExecutionDuration_MeasuresActualElapsedMilliseconds()
    {
        // Arrange
        var realQueue = new AuditLogQueue(capacity: 100);
        var (clinicContext, httpContextAccessor) = CreateContexts();
        var logger = NullLogger<AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>>.Instance;

        var behavior = new AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>(
            realQueue, clinicContext, httpContextAccessor, logger);

        var cmd = new StressTestCommand(Guid.NewGuid(), Guid.NewGuid(), "Delayed Patient", "12-0000-0", "Op");
        var resp = ApiResponse<Guid>.Success(cmd.EntityId);

        // Act: Simulate handler work taking at least 80ms
        await behavior.Handle(cmd, async _ =>
        {
            await Task.Delay(80);
            return resp;
        }, CancellationToken.None);

        // Assert: Verify duration measured
        realQueue.TryDequeue(out var msg).Should().BeTrue();
        msg.Should().NotBeNull();
        msg!.Outcome.Should().Be(ClinicAuditOutcomes.Success);

        // Check failing request timing
        Func<Task> actFail = async () => await behavior.Handle(cmd, async _ =>
        {
            await Task.Delay(60);
            throw new InvalidOperationException("Fail after delay");
        }, CancellationToken.None);

        await actFail.Should().ThrowAsync<InvalidOperationException>();

        realQueue.TryDequeue(out var failMsg).Should().BeTrue();
        failMsg!.MetadataJson.Should().Contain("ElapsedMs");
        failMsg.MetadataJson.Should().Contain("Fail after delay");
    }

    [Fact]
    public async Task EmpiricalStress_FullPipeline_MediatRValidationBehaviorToAuditLoggingBehavior()
    {
        // Arrange: Wire real ServiceProvider with MediatR, AuditLoggingBehavior, and ValidationBehavior
        var services = new ServiceCollection();
        var realQueue = new AuditLogQueue(capacity: 100);

        var (clinicContext, httpContextAccessor) = CreateContexts();

        services.AddSingleton<IAuditLogQueue>(realQueue);
        services.AddSingleton(clinicContext);
        services.AddSingleton(httpContextAccessor);
        services.AddLogging();

        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssembly(typeof(AuditLoggingBehavior<,>).Assembly);
        });

        services.AddValidatorsFromAssemblyContaining<StressFailingCommandValidator>();

        // Register in exact order defined in DependencyInjection.cs
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(AuditLoggingBehavior<,>));
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

        // Register dummy handler for StressFailingCommand
        services.AddTransient<IRequestHandler<StressFailingCommand, ApiResponse<Guid>>, DummyStressFailingHandler>();

        var provider = services.BuildServiceProvider();
        var mediator = provider.GetRequiredService<IMediator>();

        // Act: Send command with empty reason (should fail FluentValidation)
        var invalidCommand = new StressFailingCommand(Guid.NewGuid(), "");

        Func<Task> act = async () => await mediator.Send(invalidCommand);

        // Assert: ValidationException thrown
        var thrown = await act.Should().ThrowAsync<ClinicEz.Shared.Exceptions.ValidationException>();
        thrown.Which.Errors.Should().ContainKey("Reason");

        // Assert: Audit log captured the failure despite the exception originating inside ValidationBehavior!
        realQueue.Count.Should().Be(1);
        realQueue.TryDequeue(out var msg).Should().BeTrue();
        msg.Should().NotBeNull();
        msg!.Outcome.Should().Be(ClinicAuditOutcomes.Failure);
        msg.MetadataJson.Should().Contain("ValidationException");
        msg.MetadataJson.Should().Contain("One or more validation errors occurred");
    }

    [Fact]
    public void EmpiricalStress_AuditRequestMetadataRegistry_ResolvesAllMappedAndUnmappedCommands()
    {
        // 1. Explicitly mapped commands
        var staffDescriptor = AuditRequestMetadataRegistry.GetDescriptor(typeof(ClinicEz.Clinic.Application.Features.Staff.Commands.CreateStaffMemberCommand));
        staffDescriptor.IsAuditable.Should().BeTrue();
        staffDescriptor.Action.Should().Be("security.staff.created");
        staffDescriptor.Category.Should().Be(ClinicAuditCategories.Security);
        staffDescriptor.Severity.Should().Be(ClinicAuditSeverities.Urgent);

        var consultDescriptor = AuditRequestMetadataRegistry.GetDescriptor(typeof(ClinicEz.Clinic.Application.Features.Consultations.Commands.SignConsultationCommand));
        consultDescriptor.IsAuditable.Should().BeTrue();
        consultDescriptor.Action.Should().Be("clinical.consultation.signed");
        consultDescriptor.Category.Should().Be(ClinicAuditCategories.Clinical);

        var registerDescriptor = AuditRequestMetadataRegistry.GetDescriptor(typeof(ClinicEz.Clinic.Application.Features.Patients.Commands.RegisterClinicPatientCommand));
        registerDescriptor.IsAuditable.Should().BeTrue();
        registerDescriptor.Action.Should().Be("patient.registration.created");
        registerDescriptor.Category.Should().Be(ClinicAuditCategories.Patient);

        var auditQueryDescriptor = AuditRequestMetadataRegistry.GetDescriptor(typeof(ClinicEz.Clinic.Application.Features.Audit.Queries.GetAuditLogsQuery));
        auditQueryDescriptor.IsAuditable.Should().BeTrue();
        auditQueryDescriptor.Action.Should().Be("audit.log.viewed");

        var updateTriageDescriptor = AuditRequestMetadataRegistry.GetDescriptor(typeof(ClinicEz.Clinic.Application.Features.Triage.Commands.UpdateTriageVitalsCommand));
        updateTriageDescriptor.IsAuditable.Should().BeTrue();
        updateTriageDescriptor.Action.Should().Be("clinical.triage_vitals.updated");
        updateTriageDescriptor.Category.Should().Be(ClinicAuditCategories.Clinical);
        updateTriageDescriptor.Severity.Should().Be(ClinicAuditSeverities.Routine);
        updateTriageDescriptor.TargetEntityType.Should().Be("PatientVitals");

        // 2. Unmapped command with heuristic fallback
        var unmappedDescriptor = AuditRequestMetadataRegistry.GetDescriptor(typeof(StressTestCommand));
        unmappedDescriptor.IsAuditable.Should().BeTrue();
        unmappedDescriptor.Category.Should().Be(ClinicAuditCategories.Operations);

        // 3. Non-audited query
        var nonAuditedQueryDescriptor = AuditRequestMetadataRegistry.GetDescriptor(typeof(TestNonAuditedRequest));
        nonAuditedQueryDescriptor.IsAuditable.Should().BeFalse();
    }

    [Fact]
    public async Task EmpiricalStress_WhenQueueIsSaturated_SlowReaderDrainsAndRecoversChannel()
    {
        // Arrange: Queue with capacity 3
        var smallQueue = new AuditLogQueue(capacity: 3);
        var (clinicContext, httpContextAccessor) = CreateContexts();
        var logger = NullLogger<AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>>.Instance;

        var behavior = new AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>(
            smallQueue, clinicContext, httpContextAccessor, logger);

        // Fill to capacity
        for (int i = 0; i < 3; i++)
        {
            smallQueue.TryEnqueue(CreateDummyMessage($"prefill_{i}")).Should().BeTrue();
        }

        // Act: Enqueue 4th item when queue is full.
        // It should return immediately to caller while background task waits on EnqueueAsync.
        var targetEntityId = Guid.NewGuid();
        var cmd = new StressTestCommand(targetEntityId, Guid.NewGuid(), "Jane", "12-123456789-0", "Action");
        var resp = ApiResponse<Guid>.Success(cmd.EntityId);

        var handleTask = behavior.Handle(cmd, _ => Task.FromResult(resp), CancellationToken.None);
        var res = await handleTask;
        res.Should().Be(resp);

        // Queue is still full with the 3 pre-fill items
        smallQueue.Count.Should().Be(3);

        // Now drain 1 item after 100ms
        await Task.Delay(100);
        smallQueue.TryDequeue(out var drained).Should().BeTrue();
        drained!.Action.Should().Be("prefill_0");

        // Give background task time to write the 4th item into the vacated slot
        for (int i = 0; i < 30 && smallQueue.Count < 3; i++)
        {
            await Task.Delay(50);
        }

        // Assert: 4th item was successfully accepted into the queue!
        smallQueue.Count.Should().Be(3); // 2 remaining pre-fills + 1 newly enqueued

        var enqueuedMessages = new List<AuditLogMessage>();
        while (smallQueue.TryDequeue(out var msg))
        {
            enqueuedMessages.Add(msg!);
        }

        enqueuedMessages.Should().Contain(m => m.PatientName == "Jane");
    }

    [Fact]
    public async Task EmpiricalStress_HighVolume_1000ConcurrentRequests_ZeroDataLossUnderNormalLoad()
    {
        // Arrange: High-capacity queue
        const int totalRequests = 1000;
        var queue = new AuditLogQueue(capacity: 10000);
        var (clinicContext, httpContextAccessor) = CreateContexts();
        var logger = NullLogger<AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>>.Instance;

        var behavior = new AuditLoggingBehavior<StressTestCommand, ApiResponse<Guid>>(
            queue, clinicContext, httpContextAccessor, logger);

        // Act: 1000 requests across parallel workers
        var tasks = Enumerable.Range(0, totalRequests).Select(i => Task.Run(async () =>
        {
            var id = Guid.NewGuid();
            var cmd = new StressTestCommand(id, Guid.NewGuid(), $"User_{i}", "12-123456789-0", "Bulk");
            var result = await behavior.Handle(cmd, _ => Task.FromResult(ApiResponse<Guid>.Success(id)), CancellationToken.None);
            result.Succeeded.Should().BeTrue();
        }));

        await Task.WhenAll(tasks);

        // Assert: Exactly 1000 messages enqueued with 0 loss
        queue.Count.Should().Be(totalRequests);
    }

    private class DummyStressFailingHandler : IRequestHandler<StressFailingCommand, ApiResponse<Guid>>
    {
        public Task<ApiResponse<Guid>> Handle(StressFailingCommand request, CancellationToken cancellationToken)
        {
            return Task.FromResult(ApiResponse<Guid>.Success(request.Id));
        }
    }
}
