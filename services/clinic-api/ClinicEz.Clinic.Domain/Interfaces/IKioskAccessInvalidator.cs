using System;

namespace ClinicEz.Clinic.Domain.Interfaces;

public interface IKioskAccessInvalidator
{
    void Invalidate(Guid clinicId);
}
