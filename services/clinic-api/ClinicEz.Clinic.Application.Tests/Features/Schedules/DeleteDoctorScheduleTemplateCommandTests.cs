using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Schedules.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Schedules;

public class DeleteDoctorScheduleTemplateCommandTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly Guid _doctorId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public DeleteDoctorScheduleTemplateCommandTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns("test-tenant");
    }

    [Fact]
    public async Task Handle_ExistingTemplate_SoftDeletesTemplateAndAssociatedBreaks()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<DoctorScheduleTemplate>(context, sieve);
        var handler = new DeleteDoctorScheduleTemplateCommandHandler(repo, uow, _clinicContext);

        var templateId = Guid.NewGuid();
        var template = new DoctorScheduleTemplate
        {
            Id = templateId,
            ClinicId = _clinicId,
            TenantId = "test-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Maria Santos",
            DayOfWeek = DayOfWeek.Wednesday,
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(17, 0),
            SlotDurationMinutes = 30,
            IsActive = true,
            BreakTimes = new List<DoctorBreakTime>
            {
                new DoctorBreakTime
                {
                    Id = Guid.NewGuid(),
                    TemplateId = templateId,
                    Description = "Lunch Break",
                    StartTime = new TimeOnly(12, 0),
                    EndTime = new TimeOnly(13, 0),
                }
            }
        };

        context.DoctorScheduleTemplates.Add(template);
        await context.SaveChangesAsync();

        var command = new DeleteDoctorScheduleTemplateCommand(_doctorId, templateId);
        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().BeTrue();

        var deletedTemplate = await context.DoctorScheduleTemplates
            .Include(t => t.BreakTimes)
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.Id == templateId);

        deletedTemplate.Should().NotBeNull();
        deletedTemplate!.IsDeleted.Should().BeTrue();
        deletedTemplate.DeletedAt.Should().NotBeNull();
        deletedTemplate.BreakTimes.Should().HaveCount(1);
        deletedTemplate.BreakTimes.First().IsDeleted.Should().BeTrue();
        deletedTemplate.BreakTimes.First().DeletedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Handle_TemplateNotFound_ThrowsKeyNotFoundException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<DoctorScheduleTemplate>(context, sieve);
        var handler = new DeleteDoctorScheduleTemplateCommandHandler(repo, uow, _clinicContext);

        var command = new DeleteDoctorScheduleTemplateCommand(_doctorId, Guid.NewGuid());

        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task Handle_TemplateBelongsToDifferentClinic_ThrowsKeyNotFoundException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var repo = TestDbHelper.CreateRepository<DoctorScheduleTemplate>(context, sieve);
        var handler = new DeleteDoctorScheduleTemplateCommandHandler(repo, uow, _clinicContext);

        var templateId = Guid.NewGuid();
        var template = new DoctorScheduleTemplate
        {
            Id = templateId,
            ClinicId = Guid.NewGuid(), // Different clinic
            TenantId = "other-tenant",
            DoctorId = _doctorId,
            DoctorName = "Dr. Other",
            DayOfWeek = DayOfWeek.Monday,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(12, 0),
        };

        context.DoctorScheduleTemplates.Add(template);
        await context.SaveChangesAsync();

        var command = new DeleteDoctorScheduleTemplateCommand(_doctorId, templateId);
        var act = async () => await handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<KeyNotFoundException>();
    }
}
