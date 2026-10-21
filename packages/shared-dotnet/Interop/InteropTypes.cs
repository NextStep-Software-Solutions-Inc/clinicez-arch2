namespace ClinicEz.Shared.Interop;

/// <summary>
/// Catalog of envelope <c>Type</c> strings. One constant per message; the payload record that
/// belongs to each type is documented next to it. New types are added here and nowhere else.
/// </summary>
public static class InteropTypes
{
    // Provisioning / control plane (portal-api <-> facilities)
    /// <summary>Portal -> facility. Payload: <c>FacilityCreatedEvent</c> (license token, limits, console url).</summary>
    public const string FacilityLicenseIssued = "facility.license.issued";
    /// <summary>Facility -> portal. Payload: <c>FacilityProvisionedEvent</c>.</summary>
    public const string FacilityProvisioned = "facility.provisioned";
    /// <summary>Portal -> patient-api. Payload: <c>FacilityCreatedEvent</c> (clinic catalogue for patients).</summary>
    public const string FacilityDirectoryUpdated = "facility.directory.updated";
    /// <summary>Portal -> facility. Payload: <c>WorkspaceProfileUpdatedEvent</c>.</summary>
    public const string WorkspaceProfileUpdated = "workspace.profile.updated";
    /// <summary>Portal -> facility. Payload: <c>EntitlementsChangedEvent</c> (re-minted license).</summary>
    public const string EntitlementsChanged = "entitlements.changed";
    /// <summary>Facility -> portal. Payload: <c>FacilityHeartbeatPayload</c> (liveness, app version, license expiry). Only accepted from the facility it describes.</summary>
    public const string FacilityHeartbeat = "facility.heartbeat";

    // Hub directory feed (portal -> hub). Handled by the hub itself.
    public const string DirectoryCellUpserted = "directory.cell.upserted";
    public const string DirectoryFacilityUpserted = "directory.facility.upserted";
    public const string DirectoryLinkUpserted = "directory.link.upserted";

    // Patient <-> clinic
    /// <summary>Patient-api -> clinic. Payload: <c>AppointmentBookedEvent</c> (scope-filtered).</summary>
    public const string PatientAppointmentBooked = "patient.appointment.booked";
    /// <summary>Clinic -> patient-api. Payload: <c>ClinicAppointmentUpdatedEvent</c>.</summary>
    public const string ClinicAppointmentUpdated = "clinic.appointment.updated";
    /// <summary>Clinic -> patient-api. Payload: <c>ClinicRecordVerifiedEvent</c>.</summary>
    public const string ClinicRecordVerified = "clinic.record.verified";
    /// <summary>Patient-api -> clinic. A patient-shared attachment (blob reference).</summary>
    public const string PatientRecordShared = "patient.record.shared";
    /// <summary>Clinic -> patient-api. Redeem a patient share token. Reply type: <see cref="PatientShareSnapshot"/> (payload <c>PatientShareSnapshotPayload</c>).</summary>
    public const string PatientShareRedeem = "patient.share.redeem";
    public const string PatientShareSnapshot = "patient.share.snapshot";
    /// <summary>Any issuing facility -> patient-api. Rx, lab request, lab result, medical certificate.</summary>
    public const string PatientDocumentIssued = "patient.document.issued";
    /// <summary>Clinic -> patient-api. Payload: <c>ClinicalImmunizationAdministeredEvent</c>.</summary>
    public const string ClinicalImmunizationAdministered = "clinical.immunization.administered";
    /// <summary>Portal -> clinic. Payload: <c>PatientJoinRequestedPayload</c> (public join link registration request with document quarantine).</summary>
    public const string PatientJoinRequested = "patient.join.requested";
    /// <summary>Clinic -> patient-api. Payload: <c>PatientQueueAlertPayload</c> (called to room or approaching turn queue alert).</summary>
    public const string PatientQueueAlert = "patient.queue.alert";
    /// <summary>Clinic -> patient-api. Payload: <c>PatientAppointmentAlertPayload</c> (appointment lifecycle and reminder push alert).</summary>
    public const string PatientAppointmentAlert = "patient.appointment.alert";

    // Laboratory
    public const string LabOrderIssued = "lab.order.issued";
    public const string LabOrderStatusChanged = "lab.order.status.changed";
    public const string LabResultFinalized = "lab.result.finalized";
    public const string LabResultPanic = "lab.result.panic";
    public const string LabResultExternalSubmitted = "lab.result.external.submitted";
    public const string LabResultReviewed = "lab.result.reviewed";

    // Pharmacy
    public const string RxIssued = "rx.issued";
    public const string RxStatusChanged = "rx.status.changed";
    public const string RxDispensed = "rx.dispensed";
    public const string RxExternalDispensed = "rx.external.dispensed";

    // Platform services (request/reply through the hub; replace direct service-to-service HTTP)
    /// <summary>Clinic -> pharmacy. Payload: <c>GamotLookupRequestedPayload</c>. Reply type: <see cref="GamotLookupResponded"/>.</summary>
    public const string GamotLookupRequested = "gamot.lookup.requested";
    /// <summary>Pharmacy -> clinic. Payload: <c>GamotLookupRespondedPayload</c>.</summary>
    public const string GamotLookupResponded = "gamot.lookup.responded";
    /// <summary>Facility -> PhilHealth proxy (<c>Party.PhilHealth</c>). Payload: <c>PhilHealthRequestPayload</c>. Reply type: <see cref="PhilHealthResponse"/>.</summary>
    public const string PhilHealthRequest = "philhealth.request";
    /// <summary>PhilHealth proxy -> requesting facility. Payload: <c>PhilHealthResponsePayload</c>.</summary>
    public const string PhilHealthResponse = "philhealth.response";
    /// <summary>PhilHealth proxy -> portal. Payload: <c>PhilHealthConfigRequestedPayload</c>. Reply type: <see cref="PhilHealthConfigResponded"/>.</summary>
    public const string PhilHealthConfigRequested = "philhealth.config.requested";
    /// <summary>Portal -> PhilHealth proxy. Payload: <c>PhilHealthConfigRespondedPayload</c> (carries credentials; addressed to the proxy only).</summary>
    public const string PhilHealthConfigResponded = "philhealth.config.responded";
    /// <summary>PhilHealth proxy -> portal. Payload: <c>PhilHealthConfigPayload</c>. Reply type: <see cref="PhilHealthConfigUpsertResponded"/>.</summary>
    public const string PhilHealthConfigUpsertRequested = "philhealth.config.upsert.requested";
    /// <summary>Portal -> PhilHealth proxy. Payload: <c>PhilHealthConfigUpsertRespondedPayload</c>.</summary>
    public const string PhilHealthConfigUpsertResponded = "philhealth.config.upsert.responded";

    // Billing (per-cell cashiering)
    public const string BillingInvoiceRequested = "billing.invoice.requested";
    public const string BillingPaymentConfirmed = "billing.payment.confirmed";
    public const string BillingInvoicePaid = "billing.invoice.paid";
    /// <summary>Billing -> requesting facility and portal. Payload: <c>BillingInvoiceVoidedPayload</c> (void of an unpaid invoice, or refund of a paid one).</summary>
    public const string BillingInvoiceVoided = "billing.invoice.voided";

    // Notifications (any facility -> portal mail)
    public const string NotificationEmailRequested = "notification.email.requested";

    // PhilHealth YAKAP Transmittals (Portal <-> Clinic request/reply through the hub)
    /// <summary>Portal -> clinic. Payload: <c>YakapTransmittalRequestedPayload</c>. Reply type: <see cref="YakapTransmittalResponded"/>.</summary>
    public const string YakapTransmittalRequested = "yakap.transmittal.requested";
    /// <summary>Clinic -> portal. Payload: <c>YakapTransmittalRespondedPayload</c>.</summary>
    public const string YakapTransmittalResponded = "yakap.transmittal.responded";

    /// <summary>Marker type so catalog consumers can detect hub-internal messages.</summary>
    public static bool IsHubInternal(string type) => type.StartsWith("directory.", StringComparison.Ordinal);
}
