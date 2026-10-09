using ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;

namespace ClinicEz.Pharmacy.Application.Features.Gamot.DTOs;

/// <summary>
/// Request bodies of the GAMOT endpoints. They live in the Application layer because two entry points share them: the
/// pharmacy's <c>GamotController</c> and the hub responder that serves clinic lookups.
/// </summary>
public sealed record GenerateUpscApiRequest(
    Guid PrescriptionOrderId,
    Guid PrescriptionOrderItemId,
    string HciAccreditationNumber);

public sealed record ValidateUpscApiRequest(
    string UniquePrescriptionSecurityCode,
    string? HciAccreditationNumber = null,
    string? PhilHealthIdentificationNumber = null,
    string? PrescriptionNumber = null,
    string? DoctorPrcLicense = null,
    string? DrugCode = null,
    int? Quantity = null,
    DateTime? IssueDate = null);

public sealed record DispenseGamotApiRequest(
    Guid PrescriptionOrderId,
    string PharmacistName,
    string PharmacistPrcLicense,
    string HciAccreditationNumber,
    string? ReceiptNumber = null,
    string? Notes = null,
    List<ManualBatchSelectionInput>? ManualBatchSelections = null);

public sealed record ReverseGamotTransactionApiRequest(
    string Reason,
    string ReversedBy);
