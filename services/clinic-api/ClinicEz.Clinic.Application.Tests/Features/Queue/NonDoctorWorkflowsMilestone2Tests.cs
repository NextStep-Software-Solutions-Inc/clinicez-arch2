using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Api.Controllers;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Queue.Commands;
using ClinicEz.Clinic.Application.Features.Queue.DTOs;
using ClinicEz.Clinic.Application.Features.Queue.Queries;
using ClinicEz.Clinic.Application.Features.Queue.Services;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Queue;


public class NonDoctorWorkflowsMilestone2Tests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant_milestone2_test";
    private readonly Guid _staffId = Guid.NewGuid();

    public NonDoctorWorkflowsMilestone2Tests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
    }

    #region RBAC & Role Seeding Tests

    [Fact]
    public void CanonicalRoleTemplates_ContainMilestone2NonDoctorPermissions()
    {
        var templates = ClinicRoleSeeder.GetCanonicalSystemRoleTemplates();

        // 1. Nurse must have QueueCompleteNonDoctor
        var nurse = templates.SingleOrDefault(t => t.Name == ClinicRoleSeeder.NurseRoleName);
        nurse.Should().NotBeNull();
        nurse!.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);

        // 2. Receptionist must have QueueCompleteNonDoctor
        var receptionist = templates.SingleOrDefault(t => t.Name == ClinicRoleSeeder.ReceptionistRoleName);
        receptionist.Should().NotBeNull();
        receptionist!.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);

        // 3. Cashier must have QueueComplete, QueueCompleteNonDoctor, and PatientsRead
        var cashier = templates.SingleOrDefault(t => t.Name == ClinicRoleSeeder.CashierRoleName);
        cashier.Should().NotBeNull();
        cashier!.Permissions.Should().Contain(ClinicPermissions.QueueComplete);
        cashier.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);
        cashier.Permissions.Should().Contain(ClinicPermissions.PatientsRead);
    }

    [Fact]
    public async Task SeedOrUpdateAllClinicsAsync_SyncsMilestone2PermissionsToExistingRoles()
    {
        var (context, _, _) = TestDbHelper.CreateTestContext(_clinicContext);

        // Pre-seed outdated nurse role missing QueueCompleteNonDoctor
        var nurseRole = new Role
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Name = ClinicRoleSeeder.NurseRoleName,
            IsSystem = true,
            Permissions = new List<string> { ClinicPermissions.QueueRead, ClinicPermissions.TriageWrite }
        };

        // Pre-seed outdated receptionist role missing QueueCompleteNonDoctor
        var receptionistRole = new Role
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Name = ClinicRoleSeeder.ReceptionistRoleName,
            IsSystem = true,
            Permissions = new List<string> { ClinicPermissions.QueueRead, ClinicPermissions.QueueCheckIn }
        };

        // Pre-seed outdated cashier role missing QueueComplete, QueueCompleteNonDoctor, and PatientsRead
        var cashierRole = new Role
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            Name = ClinicRoleSeeder.CashierRoleName,
            IsSystem = true,
            Permissions = new List<string> { ClinicPermissions.BillingRead, ClinicPermissions.BillingWrite }
        };

        await context.Roles.AddRangeAsync(nurseRole, receptionistRole, cashierRole);
        await context.SaveChangesAsync();

        // Act: Run startup role sync
        var updatedCount = await ClinicRoleSeeder.SeedOrUpdateAllClinicsAsync(context, null, CancellationToken.None);

        // Assert: 1 clinic had its system roles updated
        updatedCount.Should().Be(1);

        var refreshedNurse = await context.Roles.FirstAsync(r => r.Id == nurseRole.Id);
        refreshedNurse.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);

        var refreshedReceptionist = await context.Roles.FirstAsync(r => r.Id == receptionistRole.Id);
        refreshedReceptionist.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);

        var refreshedCashier = await context.Roles.FirstAsync(r => r.Id == cashierRole.Id);
        refreshedCashier.Permissions.Should().Contain(ClinicPermissions.QueueComplete);
        refreshedCashier.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);
        refreshedCashier.Permissions.Should().Contain(ClinicPermissions.PatientsRead);
    }

    #endregion

    #region CompleteNonDoctorVisitCommand Tests

    [Fact]
    public async Task CompleteNonDoctorVisit_TriagedTicket_SuccessfullyDischargesWithAuditMetadata()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var notificationDispatcher = Substitute.For<IQueueNotificationDispatcher>();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-010",
            SequenceNumber = 10,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Pedro Cruz",
            Status = QueueStatus.Triaged,
            VisitType = VisitType.VitalsCheckOnly,
            CheckInTime = DateTime.UtcNow.AddMinutes(-30),
        };
        await context.Set<QueueItem>().AddAsync(queueItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CompleteNonDoctorVisitCommandHandler(queueRepo, uow, _clinicContext, notificationDispatcher);
        var command = new CompleteNonDoctorVisitCommand(queueItem.Id, "Vitals normal, BP stable. Patient discharged home.");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeTrue();

        // Verify in DB
        var savedItem = await context.Set<QueueItem>().FirstAsync(q => q.Id == queueItem.Id);
        savedItem.Status.Should().Be(QueueStatus.DischargedNonDoctor);
        savedItem.CompletedTime.Should().NotBeNull();
        savedItem.DischargedAt.Should().NotBeNull();
        savedItem.DischargeNotes.Should().Be("Vitals normal, BP stable. Patient discharged home.");
        savedItem.DischargedByStaffId.Should().Be(_staffId);

        // Verify approaching alerts dispatched
        await notificationDispatcher.Received(1).EvaluateAndDispatchApproachingAlertsAsync(
            _clinicId,
            today,
            Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData(QueueStatus.Waiting)]
    [InlineData(QueueStatus.InConsultation)]
    [InlineData(QueueStatus.OnHold)]
    public async Task CompleteNonDoctorVisit_OtherActiveStates_SuccessfullyDischarges(QueueStatus activeStatus)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var notificationDispatcher = Substitute.For<IQueueNotificationDispatcher>();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-011",
            SequenceNumber = 11,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Luna",
            Status = activeStatus,
            VisitType = VisitType.RetailPurchase,
            CheckInTime = DateTime.UtcNow.AddMinutes(-20)
        };
        await context.Set<QueueItem>().AddAsync(queueItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CompleteNonDoctorVisitCommandHandler(queueRepo, uow, _clinicContext, notificationDispatcher);
        var command = new CompleteNonDoctorVisitCommand(queueItem.Id, "OTC medicines purchased.");

        // Act
        var result = await handler.Handle(command, CancellationToken.None);

        // Assert
        result.Should().BeTrue();

        var savedItem = await context.Set<QueueItem>().FirstAsync(q => q.Id == queueItem.Id);
        savedItem.Status.Should().Be(QueueStatus.DischargedNonDoctor);
        savedItem.DischargeNotes.Should().Be("OTC medicines purchased.");
        savedItem.DischargedByStaffId.Should().Be(_staffId);
    }

    [Theory]
    [InlineData(QueueStatus.Completed)]
    [InlineData(QueueStatus.Cancelled)]
    [InlineData(QueueStatus.NoShow)]
    [InlineData(QueueStatus.DischargedNonDoctor)]
    [InlineData(QueueStatus.Diverted)]
    public async Task CompleteNonDoctorVisit_TerminalStatuses_ThrowsConflictException(QueueStatus terminalStatus)
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var notificationDispatcher = Substitute.For<IQueueNotificationDispatcher>();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-012",
            SequenceNumber = 12,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Antonio Luna",
            Status = terminalStatus,
            VisitType = VisitType.StandaloneProcedure,
            CheckInTime = DateTime.UtcNow.AddMinutes(-40),
            CompletedTime = DateTime.UtcNow.AddMinutes(-5)
        };
        await context.Set<QueueItem>().AddAsync(queueItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CompleteNonDoctorVisitCommandHandler(queueRepo, uow, _clinicContext, notificationDispatcher);
        var command = new CompleteNonDoctorVisitCommand(queueItem.Id, "Attempt re-discharge");

        // Act & Assert
        await Assert.ThrowsAsync<ConflictException>(() => handler.Handle(command, CancellationToken.None));
    }

    [Fact]
    public async Task CompleteNonDoctorVisit_ItemNotFound_ThrowsNotFoundException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var notificationDispatcher = Substitute.For<IQueueNotificationDispatcher>();

        var handler = new CompleteNonDoctorVisitCommandHandler(queueRepo, uow, _clinicContext, notificationDispatcher);
        var command = new CompleteNonDoctorVisitCommand(Guid.NewGuid(), "Non-existent ticket");

        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(command, CancellationToken.None));
    }

    [Fact]
    public async Task CompleteNonDoctorVisit_TicketBelongsToDifferentClinic_ThrowsNotFoundException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var notificationDispatcher = Substitute.For<IQueueNotificationDispatcher>();

        var differentClinicId = Guid.NewGuid();
        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = differentClinicId,
            QueueNumber = "Q-099",
            SequenceNumber = 99,
            QueueDate = DateOnly.FromDateTime(DateTime.UtcNow),
            PatientId = Guid.NewGuid(),
            PatientName = "Different Clinic Patient",
            Status = QueueStatus.Triaged,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(queueItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CompleteNonDoctorVisitCommandHandler(queueRepo, uow, _clinicContext, notificationDispatcher);
        var command = new CompleteNonDoctorVisitCommand(queueItem.Id, "Discharge different clinic ticket");

        await Assert.ThrowsAsync<NotFoundException>(() => handler.Handle(command, CancellationToken.None));
    }

    #endregion

    #region GetQueueQuery Filtering Tests

    [Fact]
    public async Task GetQueueQuery_DefaultActiveView_ExcludesDischargedNonDoctorAndDiverted()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var items = new List<QueueItem>
        {
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Active 1", Status = QueueStatus.Waiting, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-2", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Active 2", Status = QueueStatus.Triaged, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-3", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Active 3", Status = QueueStatus.InConsultation, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-4", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Active 4", Status = QueueStatus.OnHold, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-5", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Discharged", Status = QueueStatus.DischargedNonDoctor, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-6", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Diverted", Status = QueueStatus.Diverted, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-7", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Completed", Status = QueueStatus.Completed, CheckInTime = DateTime.UtcNow }
        };

        await context.Set<QueueItem>().AddRangeAsync(items);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // Act: Default query (Status is null)
        var query = new GetQueueQuery(Date: today);
        var result = await handler.Handle(query, CancellationToken.None);

        // Assert
        result.Should().HaveCount(4);
        result.Select(r => r.PatientName).Should().Contain(new[] { "Active 1", "Active 2", "Active 3", "Active 4" });
        result.Select(r => r.Status).Should().NotContain(QueueStatus.DischargedNonDoctor);
        result.Select(r => r.Status).Should().NotContain(QueueStatus.Diverted);
        result.Select(r => r.Status).Should().NotContain(QueueStatus.Completed);
    }

    [Fact]
    public async Task GetQueueQuery_MyRoomView_ExcludesDischargedNonDoctorAndDiverted()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var myRoomId = Guid.NewGuid();

        var items = new List<QueueItem>
        {
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, RoomId = myRoomId, QueueNumber = "Q-1", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Room Waiting", Status = QueueStatus.Waiting, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, RoomId = myRoomId, QueueNumber = "Q-2", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Room Discharged", Status = QueueStatus.DischargedNonDoctor, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, RoomId = myRoomId, QueueNumber = "Q-3", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Room Diverted", Status = QueueStatus.Diverted, CheckInTime = DateTime.UtcNow },
        };

        await context.Set<QueueItem>().AddRangeAsync(items);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // Act: MyRoom view
        var query = new GetQueueQuery(Date: today, View: "MyRoom", RoomId: myRoomId);
        var result = await handler.Handle(query, CancellationToken.None);

        // Assert
        result.Should().HaveCount(1);
        result[0].PatientName.Should().Be("Room Waiting");
    }

    [Fact]
    public async Task GetQueueQuery_CompletedStatusFilter_IncludesDischargedNonDoctor()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var items = new List<QueueItem>
        {
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-1", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Active", Status = QueueStatus.Waiting, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-2", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Doctor Completed", Status = QueueStatus.Completed, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-3", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Non-Doctor Discharged", Status = QueueStatus.DischargedNonDoctor, CheckInTime = DateTime.UtcNow },
            new() { Id = Guid.NewGuid(), TenantId = _tenantId, ClinicId = _clinicId, QueueNumber = "Q-4", QueueDate = today, PatientId = Guid.NewGuid(), PatientName = "Cancelled Visit", Status = QueueStatus.Cancelled, CheckInTime = DateTime.UtcNow },
        };

        await context.Set<QueueItem>().AddRangeAsync(items);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new GetQueueQueryHandler(queueRepo, _clinicContext);

        // Act: Filter by Status = Completed
        var query = new GetQueueQuery(Date: today, Status: QueueStatus.Completed);
        var result = await handler.Handle(query, CancellationToken.None);

        // Assert
        result.Should().HaveCount(2);
        result.Select(r => r.PatientName).Should().Contain(new[] { "Doctor Completed", "Non-Doctor Discharged" });
        result.Select(r => r.Status).Should().NotContain(QueueStatus.Cancelled);
        result.Select(r => r.Status).Should().NotContain(QueueStatus.Waiting);
    }

    #endregion

    #region Adversarial Probes: Permission Enforcement & HasPermission Guard

    [Fact]
    public void DischargeNonDoctor_Endpoint_HasStrictRouteAndHasPermissionAttribute()
    {
        var method = typeof(QueueController).GetMethod(nameof(QueueController.DischargeNonDoctorVisit));
        method.Should().NotBeNull("QueueController.DischargeNonDoctorVisit endpoint must exist");

        // Verify HttpPost route
        var httpPostAttr = method!.GetCustomAttribute<HttpPostAttribute>();
        httpPostAttr.Should().NotBeNull("Endpoint must be an HTTP POST");
        httpPostAttr!.Template.Should().Be("{id:guid}/discharge-non-doctor");

        // Verify HasPermission guard
        var permissionAttr = method.GetCustomAttribute<HasPermissionAttribute>();
        permissionAttr.Should().NotBeNull("Endpoint must be guarded by HasPermissionAttribute");
        permissionAttr!.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor);
        ClinicPermissions.QueueCompleteNonDoctor.Should().Be("queue:complete-non-doctor");
    }

    [Fact]
    public async Task DischargeNonDoctor_RoleWithoutQueueCompleteNonDoctor_IsRejectedWith403Forbidden()
    {
        var method = typeof(QueueController).GetMethod(nameof(QueueController.DischargeNonDoctorVisit));
        var attr = method!.GetCustomAttribute<HasPermissionAttribute>();
        attr.Should().NotBeNull();

        // Simulate context for role that lacks queue:complete-non-doctor (e.g. DPO or unauthorized role)
        var unauthorizedContext = Substitute.For<IClinicContext>();
        unauthorizedContext.HasPermission(ClinicPermissions.QueueCompleteNonDoctor).Returns(false);

        var services = new ServiceCollection().AddSingleton(unauthorizedContext).BuildServiceProvider();
        var httpContext = new DefaultHttpContext { RequestServices = services };
        var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
        var executingContext = new ActionExecutingContext(
            actionContext,
            new List<IFilterMetadata>(),
            new Dictionary<string, object?>(),
            controller: new object());

        var nextCalled = false;
        await attr!.OnActionExecutionAsync(executingContext, () =>
        {
            nextCalled = true;
            return Task.FromResult(new ActionExecutedContext(actionContext, new List<IFilterMetadata>(), new object()));
        });

        nextCalled.Should().BeFalse("Pipeline should halt when permission is missing");
        executingContext.Result.Should().BeOfType<ObjectResult>()
            .Which.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Theory]
    [InlineData(ClinicRoleSeeder.NurseRoleName)]
    [InlineData(ClinicRoleSeeder.ReceptionistRoleName)]
    [InlineData(ClinicRoleSeeder.CashierRoleName)]
    public async Task DischargeNonDoctor_NurseReceptionistCashier_SucceedPermissionCheck(string roleName)
    {
        var templates = ClinicRoleSeeder.GetCanonicalSystemRoleTemplates();
        var roleTemplate = templates.SingleOrDefault(t => t.Name == roleName);
        roleTemplate.Should().NotBeNull($"Role template for '{roleName}' must exist");

        // 1. Role template contains QueueCompleteNonDoctor
        roleTemplate!.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor,
            $"{roleName} must be granted '{ClinicPermissions.QueueCompleteNonDoctor}' in canonical templates");

        // 2. Action filter allows execution
        var authorizedContext = Substitute.For<IClinicContext>();
        authorizedContext.HasPermission(ClinicPermissions.QueueCompleteNonDoctor).Returns(true);

        var services = new ServiceCollection().AddSingleton(authorizedContext).BuildServiceProvider();
        var httpContext = new DefaultHttpContext { RequestServices = services };
        var actionContext = new ActionContext(httpContext, new RouteData(), new ActionDescriptor());
        var executingContext = new ActionExecutingContext(
            actionContext,
            new List<IFilterMetadata>(),
            new Dictionary<string, object?>(),
            controller: new object());

        var nextCalled = false;
        var attr = new HasPermissionAttribute(ClinicPermissions.QueueCompleteNonDoctor);
        await attr.OnActionExecutionAsync(executingContext, () =>
        {
            nextCalled = true;
            return Task.FromResult(new ActionExecutedContext(actionContext, new List<IFilterMetadata>(), new object()));
        });

        nextCalled.Should().BeTrue($"Execution must proceed for authorized role '{roleName}'");
        executingContext.Result.Should().BeNull();
    }

    [Fact]
    public void CanonicalRoles_CashierRole_HasPatientsReadAndQueueCompletePermissions()
    {
        var templates = ClinicRoleSeeder.GetCanonicalSystemRoleTemplates();
        var cashier = templates.SingleOrDefault(t => t.Name == ClinicRoleSeeder.CashierRoleName);
        cashier.Should().NotBeNull();

        cashier!.Permissions.Should().Contain(ClinicPermissions.PatientsRead,
            "Cashier must have PatientsRead permission to look up patients for standalone and retail billing");
        cashier.Permissions.Should().Contain(ClinicPermissions.QueueComplete,
            "Cashier must have QueueComplete permission for queue settlement");
        cashier.Permissions.Should().Contain(ClinicPermissions.QueueCompleteNonDoctor,
            "Cashier must have QueueCompleteNonDoctor permission for non-doctor discharge");
    }

    #endregion

    #region Adversarial Probes: Terminal State Guardrails & Validation

    [Fact]
    public async Task CompleteNonDoctorVisit_AttemptDoubleDischarge_ThrowsConflictException()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var notificationDispatcher = Substitute.For<IQueueNotificationDispatcher>();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            QueueNumber = "Q-050",
            SequenceNumber = 50,
            QueueDate = today,
            PatientId = Guid.NewGuid(),
            PatientName = "Double Discharge Patient",
            Status = QueueStatus.Waiting,
            VisitType = VisitType.VitalsCheckOnly,
            CheckInTime = DateTime.UtcNow
        };
        await context.Set<QueueItem>().AddAsync(queueItem);
        await uow.SaveChangesAsync(CancellationToken.None);

        var handler = new CompleteNonDoctorVisitCommandHandler(queueRepo, uow, _clinicContext, notificationDispatcher);

        // Act 1: First discharge -> succeeds
        var firstResult = await handler.Handle(new CompleteNonDoctorVisitCommand(queueItem.Id, "Initial discharge"), CancellationToken.None);
        firstResult.Should().BeTrue();

        // Act 2: Second discharge on same ticket -> must fail with ConflictException
        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            handler.Handle(new CompleteNonDoctorVisitCommand(queueItem.Id, "Duplicate discharge attempt"), CancellationToken.None));

        ex.Message.Should().Contain("already in a terminal state (DischargedNonDoctor)");
    }

    [Fact]
    public void CompleteNonDoctorVisitCommandValidator_EnforcesIdNotEmpty_AndRemarksBound()
    {
        var validator = new CompleteNonDoctorVisitCommandValidator();

        // Empty ID fails
        var emptyIdResult = validator.Validate(new CompleteNonDoctorVisitCommand(Guid.Empty, "Valid remarks"));
        emptyIdResult.IsValid.Should().BeFalse();
        emptyIdResult.Errors.Should().Contain(e => e.PropertyName == "QueueItemId");

        // Remarks > 1000 chars fails
        var longRemarks = new string('A', 1001);
        var longRemarksResult = validator.Validate(new CompleteNonDoctorVisitCommand(Guid.NewGuid(), longRemarks));
        longRemarksResult.IsValid.Should().BeFalse();
        longRemarksResult.Errors.Should().Contain(e => e.PropertyName == "DischargeRemarks");

        // Remarks == 1000 chars succeeds
        var exactRemarks = new string('A', 1000);
        var validResult = validator.Validate(new CompleteNonDoctorVisitCommand(Guid.NewGuid(), exactRemarks));
        validResult.IsValid.Should().BeTrue();

        // Null remarks succeeds
        var nullRemarksResult = validator.Validate(new CompleteNonDoctorVisitCommand(Guid.NewGuid(), null));
        nullRemarksResult.IsValid.Should().BeTrue();
    }

    #endregion

    #region Adversarial Probes: Repeat Check-In After Non-Doctor Discharge

    [Fact]
    public async Task RepeatCheckIn_AfterNonDoctorDischarge_AllowsSecondConsultationWithout409Conflict()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var notificationDispatcher = Substitute.For<IQueueNotificationDispatcher>();

        var patientId = Guid.NewGuid();
        var patientName = "Maria Clara";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo,
            apptRepo,
            uow,
            _clinicContext,
            Substitute.For<IClinicIdentityProvider>(),
            Substitute.For<IPatientAppointmentPublisher>());

        var dischargeHandler = new CompleteNonDoctorVisitCommandHandler(
            queueRepo,
            uow,
            _clinicContext,
            notificationDispatcher);

        // Step 1: Initial check-in for Consultation
        var firstVisit = await checkInHandler.Handle(
            new CheckInPatientCommand(patientId, patientName, QueueDate: today, VisitType: VisitType.Consultation),
            CancellationToken.None);

        firstVisit.Should().NotBeNull();
        firstVisit.QueueNumber.Should().Be("Q-001");
        firstVisit.SequenceNumber.Should().Be(1);
        firstVisit.Status.Should().Be(QueueStatus.Waiting);

        // Step 2: Adversarially probe duplicate check-in while ticket is active (Waiting) -> MUST BE BLOCKED with 409 Conflict
        var conflictEx = await Assert.ThrowsAsync<ActiveQueueTicketConflictException>(() =>
            checkInHandler.Handle(
                new CheckInPatientCommand(patientId, patientName, QueueDate: today, VisitType: VisitType.Consultation),
                CancellationToken.None));

        conflictEx.QueueNumber.Should().Be("Q-001");
        conflictEx.Status.Should().Be(QueueStatus.Waiting.ToString());

        // Step 3: Non-doctor staff discharges the visit (e.g. vitals checked and patient had to step out)
        var dischargeResult = await dischargeHandler.Handle(
            new CompleteNonDoctorVisitCommand(firstVisit.Id, "Discharged after triage vitals check"),
            CancellationToken.None);

        dischargeResult.Should().BeTrue();

        var dischargedItem = await queueRepo.Query(q => q.Id == firstVisit.Id).FirstAsync();
        dischargedItem.Status.Should().Be(QueueStatus.DischargedNonDoctor);

        // Step 4: Patient returns later today and checks in AGAIN for Consultation -> MUST SUCCEED (200 OK, no 409 conflict)
        var returnVisit = await checkInHandler.Handle(
            new CheckInPatientCommand(patientId, patientName, QueueDate: today, VisitType: VisitType.Consultation),
            CancellationToken.None);

        // Step 5: Verify new ticket is allocated cleanly
        returnVisit.Should().NotBeNull();
        returnVisit.QueueNumber.Should().Be("Q-002");
        returnVisit.SequenceNumber.Should().Be(2);
        returnVisit.Status.Should().Be(QueueStatus.Waiting);
        returnVisit.PatientId.Should().Be(patientId);

        // Total tickets for patient today in DB: 2 (1 DischargedNonDoctor, 1 Waiting)
        var patientTickets = await queueRepo.Query(q => q.PatientId == patientId && q.QueueDate == today)
            .OrderBy(q => q.SequenceNumber)
            .ToListAsync();

        patientTickets.Should().HaveCount(2);
        patientTickets[0].Status.Should().Be(QueueStatus.DischargedNonDoctor);
        patientTickets[1].Status.Should().Be(QueueStatus.Waiting);
    }

    [Fact]
    public async Task RepeatCheckIn_VitalsCheckDischarged_AllowsSameDayConsultationWithoutConflict()
    {
        // Arrange
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var queueRepo = TestDbHelper.CreateRepository<QueueItem>(context, sieve);
        var apptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var notificationDispatcher = Substitute.For<IQueueNotificationDispatcher>();

        var patientId = Guid.NewGuid();
        var patientName = "Crisostomo Ibarra";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var checkInHandler = new CheckInPatientCommandHandler(
            queueRepo,
            apptRepo,
            uow,
            _clinicContext,
            Substitute.For<IClinicIdentityProvider>(),
            Substitute.For<IPatientAppointmentPublisher>());

        var dischargeHandler = new CompleteNonDoctorVisitCommandHandler(
            queueRepo,
            uow,
            _clinicContext,
            notificationDispatcher);

        // Step 1: Walk-in for Vitals Check Only
        var vitalsVisit = await checkInHandler.Handle(
            new CheckInPatientCommand(patientId, patientName, QueueDate: today, VisitType: VisitType.VitalsCheckOnly),
            CancellationToken.None);

        vitalsVisit.VisitType.Should().Be(VisitType.VitalsCheckOnly);
        vitalsVisit.QueueNumber.Should().Be("Q-001");

        // Step 2: Nurse discharges patient
        await dischargeHandler.Handle(
            new CompleteNonDoctorVisitCommand(vitalsVisit.Id, "Blood pressure verified normal"),
            CancellationToken.None);

        // Step 3: Patient returns in afternoon for Consultation -> succeeds without conflict
        var consultVisit = await checkInHandler.Handle(
            new CheckInPatientCommand(patientId, patientName, QueueDate: today, VisitType: VisitType.Consultation),
            CancellationToken.None);

        consultVisit.Should().NotBeNull();
        consultVisit.VisitType.Should().Be(VisitType.Consultation);
        consultVisit.QueueNumber.Should().Be("Q-002");
        consultVisit.SequenceNumber.Should().Be(2);
        consultVisit.Status.Should().Be(QueueStatus.Waiting);
    }

    #endregion
}
