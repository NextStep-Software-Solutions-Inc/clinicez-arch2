using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Documents.Configuration;

namespace ClinicEz.Clinic.Application.Features.Staff.DTOs;

public sealed record StaffMemberDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    Guid? ClinicRoleId,
    string? RoleName,
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Title,
    StaffRole Role,
    string? Email,
    string? PhoneNumber,
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? S2LicenseNumber,
    string? Specialty,
    bool IsActive,
    DateTime CreatedAt,
    bool HasCredentials = false,
    bool MustChangePassword = false,
    string? TemporaryPassword = null,
    string? PhilHealthPan = null,
    IReadOnlyList<Guid>? AssignedRoomIds = null,
    IReadOnlyList<string>? AssignedRoomNames = null,
    string? SignatureSpecimen = null,
    SignatureMode DefaultSignatureMode = SignatureMode.ESignatureSpecimen)
{
    public StaffMemberDto(
        Guid Id,
        Guid ClinicId,
        string UserId,
        string Email,
        StaffRole Role,
        string? Specialization,
        string? LicenseNumber,
        string FirstName,
        string LastName,
        IReadOnlyList<Guid>? AssignedRoomIds = null,
        IReadOnlyList<string>? AssignedRoomNames = null,
        string? SignatureSpecimen = null,
        SignatureMode DefaultSignatureMode = SignatureMode.ESignatureSpecimen)
        : this(
            Id,
            TenantId: UserId,
            ClinicId: ClinicId,
            ClinicRoleId: null,
            RoleName: null,
            FirstName: FirstName,
            LastName: LastName,
            MiddleName: null,
            Title: null,
            Role: Role,
            Email: Email,
            PhoneNumber: null,
            PrcLicenseNumber: LicenseNumber,
            PtrNumber: null,
            S2LicenseNumber: null,
            Specialty: Specialization,
            IsActive: true,
            CreatedAt: DateTime.UtcNow,
            HasCredentials: false,
            MustChangePassword: false,
            TemporaryPassword: null,
            PhilHealthPan: null,
            AssignedRoomIds: AssignedRoomIds,
            AssignedRoomNames: AssignedRoomNames,
            SignatureSpecimen: SignatureSpecimen,
            DefaultSignatureMode: DefaultSignatureMode)
    {
    }

    public string? UserId => TenantId;
    public string? Specialization => Specialty;
    public string? LicenseNumber => PrcLicenseNumber;
}
