using System;
using System.Collections.Generic;
using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake;

public sealed record ClaimAllergyDto(
    string Allergen,
    string? Category = null,
    string? Severity = null,
    bool IsAnaphylactic = false,
    string? Reaction = null,
    string? ReactionManifestation = null,
    DateOnly? OnsetDate = null,
    string? Notes = null);

public sealed record ClaimIntakeAddressDto(
    string? AddressType = null,
    string? StreetAddress = null,
    string? RegionPsgc = null,
    string? ProvincePsgc = null,
    string? CityMunicipalityPsgc = null,
    string? BarangayPsgc = null,
    string? RegionName = null,
    string? ProvinceName = null,
    string? CityMunicipalityName = null,
    string? BarangayName = null,
    string? PostalCode = null,
    bool IsSameAsPermanent = false,
    bool IsPrimary = true);

public sealed record ClaimIntakeResultDto(
    Guid PatientId,
    string ClinicEzId,
    string FirstName,
    string LastName,
    string RelationshipType, // "Self" or "Dependent"
    string ClinicMembershipStatus, // "Active"
    PatientSummaryDto? Patient = null,
    Guid? ClinicMembershipId = null);

public sealed record ClaimIntakeCommand(
    string ClerkUserId,
    string ClaimToken,
    bool IsDependent = false,
    string? RelationshipToDependent = null,
    string? PreferredRelationship = null,
    bool ConsentToShareInfo = true,
    bool ConfirmAlternateEmailLink = false,
    string? MiddleName = null,
    string? Suffix = null,
    string? Sex = null,
    string? CivilStatus = null,
    string? ContactNumber = null,
    string? PhilHealthPin = null,
    string? PhilhealthCategory = null,
    string? PrincipalMemberPin = null,
    string? PrincipalFullName = null,
    string? PrincipalRelationship = null,
    DateOnly? PrincipalDateOfBirth = null,
    List<ClaimAllergyDto>? Allergies = null,
    List<ClaimIntakeAddressDto>? Addresses = null) : IRequest<ClaimIntakeResultDto>;
