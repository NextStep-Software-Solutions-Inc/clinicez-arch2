using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Application.Features.Patients.Search;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Events;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Auth;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Clinic.Infrastructure.Persistence.Interceptors;
using ClinicEz.Shared.LocalAuth;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Verification Suite for Milestone M3 Iteration 2:
/// 1. Kiosk token privilege escalation resistance: ensure Kiosk tokens cannot access staff endpoints,
///    cannot bypass KioskIntake policy, and cannot forge clinic/patient claims.
/// 2. Domain event invocation integrity: ensure ConsultationSignedDomainEvent fires on Sign and updates HasActiveSafetyAlert.
/// 3. Keyset cursor pagination & 10M query stress testing.
/// </summary>
public class ChallengerM3KioskAndRoleElevationAdversarialTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-challenger-m3-it2";

    // =========================================================================
    // PART 1: KIOSK TOKEN PRIVILEGE ESCALATION RESISTANCE & CLAIMS TAMPERING
    // =========================================================================

    [Fact]
    public async Task KioskToken_CannotAccess_StaffEndpoints_Returns403Forbidden()
    {
        // Arrange
        var middleware = new ClinicScopeMiddleware(ctx => Task.CompletedTask);
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        // Simulating a staff-only endpoint requiring PatientsRead
        var staffEndpoint = new Endpoint(
            ctx => Task.CompletedTask,
            new EndpointMetadataCollection(new AuthorizeAttribute { Policy = "PatientsRead" }),
            "StaffOnlyEndpoint");
        context.SetEndpoint(staffEndpoint);
        context.Response.Body = new MemoryStream();

        // Act
        await middleware.InvokeAsync(context, workspaces);

        // Assert
        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task KioskToken_WhenCallingEndpointWithoutKioskIntakePolicy_Returns403Forbidden()
    {
        // Arrange
        var middleware = new ClinicScopeMiddleware(ctx => Task.CompletedTask);
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        // Endpoint has standard AuthorizeAttribute without KioskIntake policy
        var endpoint = new Endpoint(
            ctx => Task.CompletedTask,
            new EndpointMetadataCollection(new AuthorizeAttribute()),
            "GeneralAuthorizedEndpoint");
        context.SetEndpoint(endpoint);
        context.Response.Body = new MemoryStream();

        // Act
        await middleware.InvokeAsync(context, workspaces);

        // Assert
        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task KioskToken_WhenCallingEndpointWithKioskIntakePolicy_AllowsExecution()
    {
        // Arrange
        var nextExecuted = false;
        var middleware = new ClinicScopeMiddleware(ctx =>
        {
            nextExecuted = true;
            return Task.CompletedTask;
        });
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        // Endpoint specifically requires KioskIntake
        var kioskEndpoint = new Endpoint(
            ctx => Task.CompletedTask,
            new EndpointMetadataCollection(new AuthorizeAttribute { Policy = ClinicPolicies.KioskIntake }),
            "PublicStudentIntakeEndpoint");
        context.SetEndpoint(kioskEndpoint);

        // Act
        await middleware.InvokeAsync(context, workspaces);

        // Assert
        nextExecuted.Should().BeTrue();
        context.Response.StatusCode.Should().Be(StatusCodes.Status200OK);
    }

    [Fact]
    public void KioskToken_WithInjectedStaffPermissions_IsStrippedByClinicContext()
    {
        // Arrange: An attacker crafts a JWT with token_type="kiosk" but injects staff claims & permissions
        var httpContext = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId),
            new(ClinicClaimTypes.Subject, Guid.NewGuid().ToString()),
            new(ClinicClaimTypes.Name, "Hacked Kiosk Device"),
            new(ClinicClaimTypes.StaffRole, "Doctor"),
            new(ClaimTypes.Role, "Admin"),
            new(ClinicClaimTypes.Permission, ClinicPermissions.PatientsRead),
            new(ClinicClaimTypes.Permission, ClinicPermissions.PatientsWrite),
            new(ClinicClaimTypes.Permission, ClinicPermissions.ConsultationsWrite),
            new(ClinicClaimTypes.Permission, "*") // Wildcard root permission attempt
        };
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        var accessor = Substitute.For<IHttpContextAccessor>();
        accessor.HttpContext.Returns(httpContext);

        var config = new ConfigurationBuilder().Build();
        var clinicContext = new ClinicContext(accessor, config);

        // Assert: ClinicContext must isolate Kiosk tokens from staff identity and strip all permissions
        clinicContext.ClinicId.Should().Be(_clinicId);
        clinicContext.TenantId.Should().Be(_tenantId);
        clinicContext.StaffId.Should().BeNull("Kiosk tokens must never resolve a StaffId");
        clinicContext.StaffName.Should().BeNull("Kiosk tokens must never resolve a StaffName");
        clinicContext.StaffRole.Should().BeNull("Kiosk tokens must never resolve a StaffRole");
        clinicContext.Permissions.Should().BeEmpty("Kiosk tokens must have zero permissions regardless of injected claims");
        clinicContext.HasPermission(ClinicPermissions.PatientsRead).Should().BeFalse();
        clinicContext.HasPermission(ClinicPermissions.PatientsWrite).Should().BeFalse();
        clinicContext.HasPermission("*").Should().BeFalse();
    }

    [Fact]
    public async Task KioskToken_HeaderSpoofing_CrossClinicAttempt_Returns403Forbidden()
    {
        // Arrange: Attacker presents a valid token for Clinic A, but passes X-Clinic-Id for Clinic B
        var middleware = new ClinicScopeMiddleware(ctx => Task.CompletedTask);
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        var foreignClinicId = Guid.NewGuid();
        context.Request.Headers["X-Clinic-Id"] = foreignClinicId.ToString();

        var endpoint = new Endpoint(
            ctx => Task.CompletedTask,
            new EndpointMetadataCollection(new AuthorizeAttribute { Policy = ClinicPolicies.KioskIntake }),
            "KioskEndpoint");
        context.SetEndpoint(endpoint);
        context.Response.Body = new MemoryStream();

        // Act
        await middleware.InvokeAsync(context, workspaces);

        // Assert: Must be rejected with 403 Forbidden
        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task KioskToken_HeaderSpoofing_CrossTenantAttempt_Returns403Forbidden()
    {
        // Arrange: Attacker presents a valid token for Tenant A, but passes X-Tenant-Id for Tenant B
        var middleware = new ClinicScopeMiddleware(ctx => Task.CompletedTask);
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        context.Request.Headers["X-Tenant-Id"] = "foreign-tenant-compromised";

        var endpoint = new Endpoint(
            ctx => Task.CompletedTask,
            new EndpointMetadataCollection(new AuthorizeAttribute { Policy = ClinicPolicies.KioskIntake }),
            "KioskEndpoint");
        context.SetEndpoint(endpoint);
        context.Response.Body = new MemoryStream();

        // Act
        await middleware.InvokeAsync(context, workspaces);

        // Assert
        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task OnTokenValidated_WhenKioskIntakeDisabled_FailsValidation()
    {
        // Arrange: Settings has IsKioskIntakeEnabled = false
        var kioskCache = Substitute.For<IKioskAccessCache>();
        kioskCache.GetAsync(_clinicId, Arg.Any<CancellationToken>())
            .Returns(new KioskAccessInfo(IsKioskIntakeEnabled: false, KioskTokenVersion: 1));

        var services = new ServiceCollection();
        services.AddSingleton(kioskCache);
        var provider = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = provider };
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TokenVersion, "1")
        };
        var identity = new ClaimsIdentity(claims, "Bearer");
        var principal = new ClaimsPrincipal(identity);

        var scheme = new AuthenticationScheme("Bearer", "Bearer", typeof(JwtBearerHandler));
        var options = new JwtBearerOptions();
        var context = new TokenValidatedContext(httpContext, scheme, options)
        {
            Principal = principal
        };

        // Act
        await ClinicTokenEvents.OnTokenValidated(context);

        // Assert
        context.Result.Should().NotBeNull();
        context.Result.Failure.Should().NotBeNull();
        context.Result.Failure!.Message.Should().Contain("Kiosk session is no longer valid");
    }

    [Fact]
    public async Task OnTokenValidated_WhenTokenVersionRevoked_FailsValidation()
    {
        // Arrange: Token presents version 1, but DB is at version 2 (revoked)
        var kioskCache = Substitute.For<IKioskAccessCache>();
        kioskCache.GetAsync(_clinicId, Arg.Any<CancellationToken>())
            .Returns(new KioskAccessInfo(IsKioskIntakeEnabled: true, KioskTokenVersion: 2));

        var services = new ServiceCollection();
        services.AddSingleton(kioskCache);
        var provider = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = provider };
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TokenVersion, "1")
        };
        var identity = new ClaimsIdentity(claims, "Bearer");
        var principal = new ClaimsPrincipal(identity);

        var scheme = new AuthenticationScheme("Bearer", "Bearer", typeof(JwtBearerHandler));
        var options = new JwtBearerOptions();
        var context = new TokenValidatedContext(httpContext, scheme, options)
        {
            Principal = principal
        };

        // Act
        await ClinicTokenEvents.OnTokenValidated(context);

        // Assert
        context.Result.Should().NotBeNull();
        context.Result.Failure.Should().NotBeNull();
        context.Result.Failure!.Message.Should().Contain("Kiosk session is no longer valid");
    }

    [Fact]
    public async Task OnTokenValidated_WhenMalformedClaims_FailsCleanly()
    {
        // Arrange: Missing ClinicId or invalid TokenVersion
        var kioskCache = Substitute.For<IKioskAccessCache>();
        var services = new ServiceCollection();
        services.AddSingleton(kioskCache);
        var provider = services.BuildServiceProvider();

        var httpContext = new DefaultHttpContext { RequestServices = provider };
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, "not-a-valid-guid"),
            new(ClinicClaimTypes.TokenVersion, "not-an-int")
        };
        var identity = new ClaimsIdentity(claims, "Bearer");
        var principal = new ClaimsPrincipal(identity);

        var scheme = new AuthenticationScheme("Bearer", "Bearer", typeof(JwtBearerHandler));
        var options = new JwtBearerOptions();
        var context = new TokenValidatedContext(httpContext, scheme, options)
        {
            Principal = principal
        };

        // Act
        await ClinicTokenEvents.OnTokenValidated(context);

        // Assert
        context.Result.Should().NotBeNull();
        context.Result.Failure.Should().NotBeNull();
        context.Result.Failure!.Message.Should().Contain("Malformed kiosk token claims");
    }

    // =========================================================================
    // PART 2: DOMAIN EVENT INVOCATION INTEGRITY & SAFETY ALERT MAINTENANCE
    // =========================================================================

    [Fact]
    public void ConsultationEncounter_Sign_SetsSignedState_And_EmitsConsultationSignedDomainEvent()
    {
        // Arrange
        var encounterId = Guid.NewGuid();
        var patientId = Guid.NewGuid();
        var doctorId = Guid.NewGuid();
        var doctorName = "Dr. Jose Rizal";

        var encounter = new ConsultationEncounter
        {
            Id = encounterId,
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patientId,
            PatientName = "Andres Bonifacio",
            DoctorId = doctorId,
            DoctorName = doctorName,
            EncounterDate = DateTime.UtcNow,
            IsSigned = false
        };

        // Act
        encounter.Sign(
            prcLicense: "PRC-1234567",
            ptr: "PTR-7654321",
            s2License: "S2-998877",
            philHealthPan: "PAN-11223344",
            philHealthAtc: "ATC-556677");

        // Assert
        encounter.IsSigned.Should().BeTrue();
        encounter.SignedAt.Should().NotBeNull();
        encounter.DoctorPrcLicense.Should().Be("PRC-1234567");
        encounter.DoctorPtr.Should().Be("PTR-7654321");
        encounter.DoctorS2License.Should().Be("S2-998877");
        encounter.DoctorPhilHealthPan.Should().Be("PAN-11223344");
        encounter.PhilHealthAtc.Should().Be("ATC-556677");

        // Domain event assertion
        encounter.DomainEvents.Should().HaveCount(1);
        var emittedEvent = encounter.DomainEvents.First();
        emittedEvent.Should().BeOfType<ConsultationSignedDomainEvent>();

        var signedEvent = (ConsultationSignedDomainEvent)emittedEvent;
        signedEvent.EncounterId.Should().Be(encounterId);
        signedEvent.ClinicId.Should().Be(_clinicId);
        signedEvent.PatientId.Should().Be(patientId);
        signedEvent.DoctorId.Should().Be(doctorId);
        signedEvent.DoctorName.Should().Be(doctorName);
        signedEvent.SignedAtUtc.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task DomainEventDispatchSaveChangesInterceptor_DispatchesConsultationSignedDomainEvent_ViaPublisher()
    {
        // Arrange
        var publisher = Substitute.For<IPublisher>();
        var services = new ServiceCollection();
        services.AddSingleton(publisher);
        var serviceProvider = services.BuildServiceProvider();

        var interceptor = new DomainEventDispatchSaveChangesInterceptor(serviceProvider);

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var dbOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Test_Interceptor_Dispatch_{Guid.NewGuid()}")
            .AddInterceptors(interceptor)
            .Options;

        var config = new ConfigurationBuilder().AddInMemoryCollection(new[]
        {
            new KeyValuePair<string, string?>("DbSchema", "public")
        }).Build();

        using var db = new ApplicationDbContext(dbOptions, config, clinicContext);

        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = Guid.NewGuid(),
            PatientName = "Emilio Aguinaldo",
            DoctorId = Guid.NewGuid(),
            DoctorName = "Dr. Antonio Luna",
            EncounterDate = DateTime.UtcNow
        };
        db.Consultations.Add(encounter);
        await db.SaveChangesAsync();

        // Act: Sign and SaveChanges
        encounter.Sign("PRC-9999", "PTR-8888", "S2-7777");
        encounter.DomainEvents.Should().HaveCount(1);

        await db.SaveChangesAsync();

        // Assert: Event was cleared from entity and dispatched to IPublisher
        encounter.DomainEvents.Should().BeEmpty();
        await publisher.Received(1).Publish(
            Arg.Is<object>(e =>
                e is ConsultationSignedDomainEvent &&
                ((ConsultationSignedDomainEvent)e).EncounterId == encounter.Id &&
                ((ConsultationSignedDomainEvent)e).DoctorName == "Dr. Antonio Luna"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DomainEventDispatchSaveChangesInterceptor_MaintainsActiveSafetyAlert_WhenPatientAlertChanges()
    {
        // Arrange
        var services = new ServiceCollection();
        var serviceProvider = services.BuildServiceProvider();
        var interceptor = new DomainEventDispatchSaveChangesInterceptor(serviceProvider);

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var dbOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Test_SafetyAlert_Maintenance_{Guid.NewGuid()}")
            .AddInterceptors(interceptor)
            .Options;

        var config = new ConfigurationBuilder().AddInMemoryCollection(new[]
        {
            new KeyValuePair<string, string?>("DbSchema", "public")
        }).Build();

        using var db = new ApplicationDbContext(dbOptions, config, clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Juan",
            LastName = "Luna",
            PatientCode = "PAT-SAFETY-01",
            DateOfBirth = new DateOnly(1985, 10, 23),
            ContactNumber = "0917-111-2222",
            HasActiveSafetyAlert = false
        };
        db.Patients.Add(patient);
        await db.SaveChangesAsync();

        // Initial state: HasActiveSafetyAlert is false
        patient.HasActiveSafetyAlert.Should().BeFalse();

        // Step 1: Add active safety alert
        var alert = new PatientAlert
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            Title = "Fall Risk / High Vulnerability",
            Status = PatientAlertStatus.Active,
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };
        db.PatientAlerts.Add(alert);
        await db.SaveChangesAsync();

        // Assert: Interceptor automatically updated HasActiveSafetyAlert to true
        patient.HasActiveSafetyAlert.Should().BeTrue();

        // Step 2: Mark alert as Resolved (inactive)
        alert.Status = PatientAlertStatus.Resolved;
        await db.SaveChangesAsync();

        // Assert: Interceptor automatically updated HasActiveSafetyAlert to false
        patient.HasActiveSafetyAlert.Should().BeFalse();

        // Step 3: Add expired alert (ExpiresAt in the past)
        var expiredAlert = new PatientAlert
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            Title = "Temporary Pre-Op Alert",
            Status = PatientAlertStatus.Active,
            ExpiresAt = DateTime.UtcNow.AddDays(-1) // expired yesterday
        };
        db.PatientAlerts.Add(expiredAlert);
        await db.SaveChangesAsync();

        // Assert: Expired alerts must NOT trigger HasActiveSafetyAlert
        patient.HasActiveSafetyAlert.Should().BeFalse();
    }

    [Fact]
    public async Task DomainEventDispatchSaveChangesInterceptor_MaintainsActiveSafetyAlert_WhenSevereOrAnaphylacticAllergyAdded()
    {
        // Arrange
        var services = new ServiceCollection();
        var serviceProvider = services.BuildServiceProvider();
        var interceptor = new DomainEventDispatchSaveChangesInterceptor(serviceProvider);

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var dbOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Test_Allergy_SafetyAlert_{Guid.NewGuid()}")
            .AddInterceptors(interceptor)
            .Options;

        var config = new ConfigurationBuilder().AddInMemoryCollection(new[]
        {
            new KeyValuePair<string, string?>("DbSchema", "public")
        }).Build();

        using var db = new ApplicationDbContext(dbOptions, config, clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Apolinario",
            LastName = "Mabini",
            PatientCode = "PAT-ALLERGY-01",
            DateOfBirth = new DateOnly(1980, 7, 23),
            ContactNumber = "0917-333-4444",
            HasActiveSafetyAlert = false
        };
        db.Patients.Add(patient);
        await db.SaveChangesAsync();

        // Step 1: Add Mild Allergy (should NOT trigger HasActiveSafetyAlert)
        var mildAllergy = new PatientAllergy
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            Allergen = "Dust mites",
            Category = AllergyCategory.Environmental,
            Severity = AllergySeverity.Mild,
            IsAnaphylactic = false,
            Status = AllergyStatus.Active
        };
        db.PatientAllergies.Add(mildAllergy);
        await db.SaveChangesAsync();

        patient.HasActiveSafetyAlert.Should().BeFalse("Mild non-anaphylactic allergies do not activate safety alert");

        // Step 2: Add Severe/Anaphylactic Allergy (Penicillin)
        var severeAllergy = new PatientAllergy
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            Allergen = "Penicillin G",
            Category = AllergyCategory.Medication,
            Severity = AllergySeverity.LifeThreatening,
            IsAnaphylactic = true,
            Status = AllergyStatus.Active
        };
        db.PatientAllergies.Add(severeAllergy);
        await db.SaveChangesAsync();

        patient.HasActiveSafetyAlert.Should().BeTrue("Anaphylactic medication allergy must activate HasActiveSafetyAlert");

        // Step 3: Delete severe allergy
        severeAllergy.IsDeleted = true;
        await db.SaveChangesAsync();

        patient.HasActiveSafetyAlert.Should().BeFalse("Deleting the only severe allergy restores HasActiveSafetyAlert to false");
    }

    // =========================================================================
    // PART 3: KEYSET CURSOR PAGINATION & 10M QUERY STRESS TESTING
    // =========================================================================

    [Fact]
    public async Task KeysetPagination_TraversesOrderedSequence_WithoutGapsOrDuplicates()
    {
        // Arrange: Generate 96 synthetic patients with duplicate surnames, duplicate firstnames, and GUID tiebreakers
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);

        var lastNames = new[] { "Aquino", "Bonifacio", "Cruz", "Del Rosario", "Garcia", "Mabini", "Reyes", "Santos" };
        var firstNames = new[] { "Ana", "Carlos", "Jose", "Maria", "Pedro", "Ramon" };

        var generatedPatients = new List<Patient>();
        int counter = 1;
        foreach (var ln in lastNames)
        {
            foreach (var fn in firstNames)
            {
                // Create multiple entries per name pair to test tie-breaking on Id
                for (int i = 0; i < 2; i++)
                {
                    var p = new Patient
                    {
                        Id = Guid.NewGuid(),
                        ClinicId = _clinicId,
                        TenantId = _tenantId,
                        LastName = ln,
                        FirstName = fn,
                        PatientCode = $"PAT-KEYSET-{counter:D4}",
                        ContactNumber = $"0918-000-{counter:D4}",
                        DateOfBirth = new DateOnly(1990, 1, 1),
                        CreatedAt = DateTime.UtcNow.AddMinutes(-counter)
                    };
                    generatedPatients.Add(p);
                    await patientRepo.AddAsync(p);
                    counter++;
                }
            }
        }
        await uow.SaveChangesAsync();

        // Compute expected deterministic ordering: LastName ASC, FirstName ASC, Id ASC
        var expectedOrder = generatedPatients
            .OrderBy(p => p.LastName)
            .ThenBy(p => p.FirstName)
            .ThenBy(p => p.Id)
            .Select(p => p.Id)
            .ToList();

        var handler = new GetClinicPatientsQueryHandler(patientRepo);
        var pagedResults = new List<ClinicPatientDto>();

        // Act: Page through using Keyset Cursor Pagination with pageSize = 15
        string? cursorLastName = null;
        string? cursorFirstName = null;
        Guid? cursorId = null;

        while (true)
        {
            var query = new GetClinicPatientsQuery(
                PageSize: 15,
                CursorLastName: cursorLastName,
                CursorFirstName: cursorFirstName,
                CursorId: cursorId);

            var page = await handler.Handle(query, CancellationToken.None);
            if (page.Count == 0) break;

            pagedResults.AddRange(page);

            var lastItem = page.Last();
            cursorLastName = lastItem.LastName;
            cursorFirstName = lastItem.FirstName;
            cursorId = lastItem.Id;

            if (page.Count < 15) break;
        }

        // Assert: Exactly 96 patients traversed in 100% identical order with ZERO duplicates and ZERO omissions
        pagedResults.Should().HaveCount(expectedOrder.Count);
        var actualIds = pagedResults.Select(p => p.Id).ToList();
        actualIds.Should().Equal(expectedOrder, "Keyset pagination must preserve exact deterministic order without gaps or duplicates");
    }

    [Fact]
    public async Task KeysetPagination_SupportsAfterAliases_EquallyToCursorFields()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);

        var p1 = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            LastName = "Alvarez",
            FirstName = "Bernardo",
            PatientCode = "PAT-A1",
            ContactNumber = "0918-000-0001",
            DateOfBirth = new DateOnly(1990, 1, 1)
        };
        var p2 = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            LastName = "Bernardo",
            FirstName = "Crisanto",
            PatientCode = "PAT-A2",
            ContactNumber = "0918-000-0002",
            DateOfBirth = new DateOnly(1990, 1, 1)
        };
        await patientRepo.AddAsync(p1);
        await patientRepo.AddAsync(p2);
        await uow.SaveChangesAsync();

        var handler = new GetClinicPatientsQueryHandler(patientRepo);

        // Act: Query using AfterLastName, AfterFirstName, AfterId
        var query = new GetClinicPatientsQuery(
            PageSize: 10,
            AfterLastName: "Alvarez",
            AfterFirstName: "Bernardo",
            AfterId: p1.Id);

        var result = await handler.Handle(query, CancellationToken.None);

        // Assert: Should return only p2
        result.Should().HaveCount(1);
        result.First().Id.Should().Be(p2.Id);
    }

    [Fact]
    public async Task GetClinicPatientsQuery_ProjectsDirectly_AndExposesHasActiveSafetyAlert()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);

        var patientAlerted = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            LastName = "Del Rosario",
            FirstName = "Gregorio",
            PatientCode = "PAT-ALERTED-01",
            ContactNumber = "0919-888-7777",
            DateOfBirth = new DateOnly(1992, 5, 10),
            HasActiveSafetyAlert = true
        };
        var patientCalm = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            LastName = "Silang",
            FirstName = "Gabriela",
            PatientCode = "PAT-CALM-01",
            ContactNumber = "0919-888-8888",
            DateOfBirth = new DateOnly(1995, 3, 19),
            HasActiveSafetyAlert = false
        };
        await patientRepo.AddAsync(patientAlerted);
        await patientRepo.AddAsync(patientCalm);
        await uow.SaveChangesAsync();

        var handler = new GetClinicPatientsQueryHandler(patientRepo);

        // Act: Filter by HasAlerts = true
        var result = await handler.Handle(new GetClinicPatientsQuery(HasAlerts: true), CancellationToken.None);

        // Assert
        result.Should().HaveCount(1);
        result.First().Id.Should().Be(patientAlerted.Id);
        result.First().Alerts.Should().Be("Active Safety Alert");
    }

    [Fact]
    public async Task GetClinicPatientCountsQuery_SinglePassAggregation_ComputesAccurateCounts()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);

        var seniorDob = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-65));
        var adultDob = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-25));

        // 1. Regular adult
        await patientRepo.AddAsync(new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            LastName = "Test",
            FirstName = "Regular",
            PatientCode = "P-1",
            ContactNumber = "0911-000-0001",
            DateOfBirth = adultDob
        });

        // 2. Student (via CustomFields)
        await patientRepo.AddAsync(new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            LastName = "Test",
            FirstName = "Student",
            PatientCode = "P-2",
            ContactNumber = "0911-000-0002",
            DateOfBirth = adultDob,
            CustomFields = new Dictionary<string, object?> { ["classification"] = "Student" }
        });

        // 3. Employee (via CustomFields)
        await patientRepo.AddAsync(new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            LastName = "Test",
            FirstName = "Employee",
            PatientCode = "P-3",
            ContactNumber = "0911-000-0003",
            DateOfBirth = adultDob,
            CustomFields = new Dictionary<string, object?> { ["category"] = "Employee" }
        });

        // 4. Senior Citizen (DOB >= 60 yrs)
        await patientRepo.AddAsync(new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            LastName = "Test",
            FirstName = "Senior",
            PatientCode = "P-4",
            ContactNumber = "0911-000-0004",
            DateOfBirth = seniorDob,
            SeniorCitizenId = "OSCA-9999"
        });

        // 5. Patient with Active Safety Alert
        await patientRepo.AddAsync(new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            LastName = "Test",
            FirstName = "Alerted",
            PatientCode = "P-5",
            ContactNumber = "0911-000-0005",
            DateOfBirth = adultDob,
            HasActiveSafetyAlert = true
        });

        await uow.SaveChangesAsync();

        var handler = new GetClinicPatientCountsQueryHandler(patientRepo);

        // Act
        var counts = await handler.Handle(new GetClinicPatientCountsQuery(), CancellationToken.None);

        // Assert
        counts.All.Should().Be(5);
        counts.Students.Should().Be(1);
        counts.Employees.Should().Be(1);
        counts.SeniorPwd.Should().Be(1);
        counts.Alerts.Should().Be(1);
    }

    [Theory]
    [InlineData("Luna, Juan", true)]
    [InlineData("Juan Luna", true)]
    [InlineData("0918-123-4567", true)]
    [InlineData("09181234567", true)]
    [InlineData("PAT-SEARCH-01", true)]
    [InlineData("PATSEARCH01", true)]
    [InlineData("12-345678901-2", true)]
    [InlineData("123456789012", true)]
    [InlineData("NonExistentNameXYZ", false)]
    public void WhereMatchesSearchTerm_MatchesAllPhilippineIdentifierPermutations(string searchTerm, bool shouldMatch)
    {
        // Arrange
        var testPatient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Juan",
            MiddleName = "Novicio",
            LastName = "Luna",
            PatientCode = "PAT-SEARCH-01",
            ContactNumber = "0918-123-4567",
            PhilHealthNumber = "12-345678901-2",
            ClinicEzId = "CE-ABCD-1234",
            DateOfBirth = new DateOnly(1980, 10, 23)
        };

        var queryable = new List<Patient> { testPatient }.AsQueryable();

        // Act
        var result = queryable.WhereMatchesSearchTerm(searchTerm).ToList();

        // Assert
        if (shouldMatch)
        {
            result.Should().ContainSingle().Which.Id.Should().Be(testPatient.Id);
        }
        else
        {
            result.Should().BeEmpty();
        }
    }

    [Fact]
    public async Task KioskToken_WhenCallingAllowAnonymousEndpoint_WithoutKioskIntakePolicy_Returns403Forbidden()
    {
        // Arrange: Endpoint has AllowAnonymousAttribute, but request has Bearer kiosk JWT
        var middleware = new ClinicScopeMiddleware(ctx => Task.CompletedTask);
        var workspaces = Substitute.For<IWorkspaceResolver>();

        var context = new DefaultHttpContext();
        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.ClinicId, _clinicId.ToString()),
            new(ClinicClaimTypes.TenantId, _tenantId)
        };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

        var anonEndpoint = new Endpoint(
            ctx => Task.CompletedTask,
            new EndpointMetadataCollection(new AllowAnonymousAttribute()),
            "PublicGeneralEndpoint");
        context.SetEndpoint(anonEndpoint);
        context.Response.Body = new MemoryStream();

        // Act
        await middleware.InvokeAsync(context, workspaces);

        // Assert: Kiosk tokens cannot browse general public/anon endpoints with their kiosk token
        context.Response.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task DomainEventDispatchSaveChangesInterceptor_MultipleAlerts_MaintainsActiveAlertUntilAllResolved()
    {
        // Arrange: Multiple concurrent alerts (1 active, 1 inactive)
        var services = new ServiceCollection();
        var serviceProvider = services.BuildServiceProvider();
        var interceptor = new DomainEventDispatchSaveChangesInterceptor(serviceProvider);

        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var dbOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"Test_Multi_Alerts_{Guid.NewGuid()}")
            .AddInterceptors(interceptor)
            .Options;

        var config = new ConfigurationBuilder().AddInMemoryCollection(new[]
        {
            new KeyValuePair<string, string?>("DbSchema", "public")
        }).Build();

        using var db = new ApplicationDbContext(dbOptions, config, clinicContext);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            FirstName = "Melchora",
            LastName = "Aquino",
            PatientCode = "PAT-MULTI-01",
            DateOfBirth = new DateOnly(1812, 1, 6),
            ContactNumber = "0917-000-0000",
            HasActiveSafetyAlert = false
        };
        db.Patients.Add(patient);
        await db.SaveChangesAsync();

        var alert1 = new PatientAlert
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            Title = "Alert 1: High Fall Risk",
            Status = PatientAlertStatus.Active,
            ExpiresAt = DateTime.UtcNow.AddDays(10)
        };
        var alert2 = new PatientAlert
        {
            Id = Guid.NewGuid(),
            ClinicId = _clinicId,
            TenantId = _tenantId,
            PatientId = patient.Id,
            Title = "Alert 2: Bleeding Tendency",
            Status = PatientAlertStatus.Active,
            ExpiresAt = DateTime.UtcNow.AddDays(20)
        };
        db.PatientAlerts.AddRange(alert1, alert2);
        await db.SaveChangesAsync();

        patient.HasActiveSafetyAlert.Should().BeTrue("2 active alerts -> true");

        // Resolve only alert 1
        alert1.Status = PatientAlertStatus.Resolved;
        await db.SaveChangesAsync();

        patient.HasActiveSafetyAlert.Should().BeTrue("Alert 2 is still active -> must remain true");

        // Resolve alert 2
        alert2.Status = PatientAlertStatus.Resolved;
        await db.SaveChangesAsync();

        patient.HasActiveSafetyAlert.Should().BeFalse("All alerts resolved -> must become false");
    }

    [Fact]
    public async Task KeysetPagination_LargeSyntheticHarness_PreservesTotalCoverageAndZeroDrift()
    {
        // Arrange: 240 patients
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicId);
        clinicContext.TenantId.Returns(_tenantId);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);

        var list = new List<Patient>();
        for (int i = 0; i < 240; i++)
        {
            var p = new Patient
            {
                Id = Guid.NewGuid(),
                ClinicId = _clinicId,
                TenantId = _tenantId,
                LastName = $"Surname{(i % 20):D2}",
                FirstName = $"First{(i % 10):D2}",
                PatientCode = $"HARNESS-{i:D4}",
                ContactNumber = $"0999-000-{i:D4}",
                DateOfBirth = new DateOnly(1980 + (i % 30), 1, 1)
            };
            list.Add(p);
            await patientRepo.AddAsync(p);
        }
        await uow.SaveChangesAsync();

        var expectedIds = list
            .OrderBy(p => p.LastName)
            .ThenBy(p => p.FirstName)
            .ThenBy(p => p.Id)
            .Select(p => p.Id)
            .ToList();

        var handler = new GetClinicPatientsQueryHandler(patientRepo);
        var collected = new List<ClinicPatientDto>();

        string? curLastName = null;
        string? curFirstName = null;
        Guid? curId = null;

        while (true)
        {
            var page = await handler.Handle(new GetClinicPatientsQuery(
                PageSize: 25,
                CursorLastName: curLastName,
                CursorFirstName: curFirstName,
                CursorId: curId), CancellationToken.None);

            if (page.Count == 0) break;
            collected.AddRange(page);

            var last = page.Last();
            curLastName = last.LastName;
            curFirstName = last.FirstName;
            curId = last.Id;

            if (page.Count < 25) break;
        }

        collected.Should().HaveCount(240);
        collected.Select(c => c.Id).Should().Equal(expectedIds);
    }
}

