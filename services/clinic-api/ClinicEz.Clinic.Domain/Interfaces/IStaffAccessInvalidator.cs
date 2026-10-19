using System;

namespace ClinicEz.Clinic.Domain.Interfaces;

public interface IStaffAccessInvalidator
{
    void Invalidate(Guid staffId);
}
