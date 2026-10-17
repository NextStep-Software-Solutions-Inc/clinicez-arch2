namespace ClinicEz.Clinic.Application.Tests.Features.Audit;

using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Behaviors;
using ClinicEz.Clinic.Application.Common.Audit;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

// Sample command and query for testing
public sealed record TestAuditedCommand(Guid Id, string Name) : IRequest<ApiResponse<Guid>>;
public sealed record TestNonAuditedRequest(string Data) : IRequest<string>;

public class AuditLoggingBehaviorTests
{
    private readonly IAuditLogQueue _auditQueue;
    private readonly IClinicContext _clinicContext;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuditLoggingBehavior<TestAuditedCommand, ApiResponse<Guid>>> _logger;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_test_123";

    public AuditLoggingBehaviorTests()
    {
        _auditQueue = Substitute.For<IAuditLogQueue>();
        _clinicContext = Substitute.For<IClinicContext>();
        _httpContextAccessor = Substitute.For<IHttpContextAccessor>();
        _logger = Substitute.For<ILogger<AuditLoggingBehavior<TestAuditedCommand, ApiResponse<Guid>>>>();

        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.StaffId.Returns(_staffId);
        _clinicContext.TenantId.Returns(_tenantId);

        var httpContext = new DefaultHttpContext();
        httpContext.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("192.168.1.100");
        httpContext.Request.Headers.UserAgent = "TestRunner/1.0";

        var claims = new[]
        {
            new Claim("sub", _staffId.ToString()),
            new Claim("name", "Dr. Jane Doe"),
            new Claim("staff_role", "Physician"),
            new Claim("tenant_id", _tenantId),
            new Claim("clinic_id", _clinicId.ToString())
        };
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));

        _httpContextAccessor.HttpContext.Returns(httpContext);
    }

    [Fact]
    public async Task Handle_StateModifyingCommand_EnqueuesAuditMessageWithOutcomeSuccess()
    {
        // Arrange
        var behavior = new AuditLoggingBehavior<TestAuditedCommand, ApiResponse<Guid>>(
            _auditQueue, _clinicContext, _httpContextAccessor, _logger);

        var command = new TestAuditedCommand(Guid.NewGuid(), "Test Entity");
        var expectedResponse = ApiResponse<Guid>.Success(command.Id);

        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        // Act
        var result = await behavior.Handle(command, _ => Task.FromResult(expectedResponse), CancellationToken.None);

        // Assert
        result.Should().Be(expectedResponse);
        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.ClinicId == _clinicId &&
            msg.TenantId == _tenantId &&
            msg.ActorStaffId == _staffId &&
            msg.ActorName == "Dr. Jane Doe" &&
            msg.ActorRole == "Physician" &&
            msg.Outcome == ClinicAuditOutcomes.Success &&
            msg.TargetEntityId == command.Id.ToString() &&
            msg.ClientIpAddress == "192.168.1.100" &&
            msg.UserAgent == "TestRunner/1.0"));
    }

    [Fact]
    public async Task Handle_CommandThrowsValidationException_EnqueuesAuditMessageWithOutcomeFailure_AndRethrows()
    {
        // Arrange
        var behavior = new AuditLoggingBehavior<TestAuditedCommand, ApiResponse<Guid>>(
            _auditQueue, _clinicContext, _httpContextAccessor, _logger);

        var command = new TestAuditedCommand(Guid.NewGuid(), "Invalid");
        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        var validationErrors = new Dictionary<string, string[]>
        {
            { "Name", new[] { "Name is too short." } }
        };
        var validationException = new ValidationException("Validation failed.", validationErrors);

        // Act
        Func<Task> act = async () => await behavior.Handle(
            command,
            _ => throw validationException,
            CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ValidationException>();

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Outcome == ClinicAuditOutcomes.Failure &&
            msg.Severity == ClinicAuditSeverities.Urgent &&
            msg.Description.Contains("Failed executing") &&
            msg.MetadataJson.Contains("ValidationException") &&
            msg.MetadataJson.Contains("Validation failed.")));
    }

    [Fact]
    public async Task Handle_CommandThrowsDomainException_EnqueuesAuditMessageWithOutcomeFailure_AndRethrows()
    {
        // Arrange
        var behavior = new AuditLoggingBehavior<TestAuditedCommand, ApiResponse<Guid>>(
            _auditQueue, _clinicContext, _httpContextAccessor, _logger);

        var command = new TestAuditedCommand(Guid.NewGuid(), "Conflict");
        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        var domainException = new ConflictException("Resource conflict occurred.");

        // Act
        Func<Task> act = async () => await behavior.Handle(
            command,
            _ => throw domainException,
            CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ConflictException>();

        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.Outcome == ClinicAuditOutcomes.Failure &&
            msg.Description.Contains("Resource conflict occurred.") &&
            msg.MetadataJson.Contains("ConflictException")));
    }

    [Fact]
    public async Task Handle_WhenChannelIsFull_DoesNotBlockOrThrowException()
    {
        // Arrange
        var behavior = new AuditLoggingBehavior<TestAuditedCommand, ApiResponse<Guid>>(
            _auditQueue, _clinicContext, _httpContextAccessor, _logger);

        var command = new TestAuditedCommand(Guid.NewGuid(), "Load Test");
        var expectedResponse = ApiResponse<Guid>.Success(command.Id);

        // Simulate channel full
        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(false);

        // Act
        var result = await behavior.Handle(command, _ => Task.FromResult(expectedResponse), CancellationToken.None);

        // Assert
        result.Should().Be(expectedResponse);
        _auditQueue.Received(1).TryEnqueue(Arg.Any<AuditLogMessage>());
    }

    [Fact]
    public async Task Handle_NonAuditedRequest_BypassesAuditQueue()
    {
        // Arrange
        var logger = Substitute.For<ILogger<AuditLoggingBehavior<TestNonAuditedRequest, string>>>();
        var behavior = new AuditLoggingBehavior<TestNonAuditedRequest, string>(
            _auditQueue, _clinicContext, _httpContextAccessor, logger);

        var request = new TestNonAuditedRequest("Ignore me");

        // Act
        var result = await behavior.Handle(request, _ => Task.FromResult("Done"), CancellationToken.None);

        // Assert
        result.Should().Be("Done");
        _auditQueue.DidNotReceive().TryEnqueue(Arg.Any<AuditLogMessage>());
    }

    [Fact]
    public async Task Handle_ExtractsClientIpFromXForwardedForHeader()
    {
        // Arrange
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers["X-Forwarded-For"] = "203.0.113.195, 70.41.3.18";
        _httpContextAccessor.HttpContext.Returns(httpContext);

        var behavior = new AuditLoggingBehavior<TestAuditedCommand, ApiResponse<Guid>>(
            _auditQueue, _clinicContext, _httpContextAccessor, _logger);

        var command = new TestAuditedCommand(Guid.NewGuid(), "Proxy Test");
        _auditQueue.TryEnqueue(Arg.Any<AuditLogMessage>()).Returns(true);

        // Act
        await behavior.Handle(command, _ => Task.FromResult(ApiResponse<Guid>.Success(command.Id)), CancellationToken.None);

        // Assert
        _auditQueue.Received(1).TryEnqueue(Arg.Is<AuditLogMessage>(msg =>
            msg.ClientIpAddress == "203.0.113.195"));
    }
}
