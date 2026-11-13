using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;

using static TeleconsultContracts;

/// <summary>
/// Comprehensive reference execution engines, mathematical algorithms, zero-PHI regex validators,
/// CMK AES-256-GCM vault encryption, and state machines for Teleconsultation E2E Testing (F1-F13).
/// </summary>
public static class TeleconsultTestHarness
{
    // =========================================================================
    // 1. Modality Mapper (Feature F1)
    // =========================================================================
    public static class ModalityMapper
    {
        public static (AppointmentType Type, bool IsTeleconsult) ResolveModality(string? appointmentType, string? serviceType)
        {
            if (string.Equals(appointmentType, "Teleconsult", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(appointmentType, "Teleconsultation", StringComparison.OrdinalIgnoreCase))
            {
                return (AppointmentType.Teleconsult, true);
            }

            if (string.Equals(serviceType, "Teleconsult", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(serviceType, "Teleconsultation", StringComparison.OrdinalIgnoreCase))
            {
                return (AppointmentType.Teleconsult, true);
            }

            return (AppointmentType.InPerson, false);
        }
    }

    // =========================================================================
    // 2. Facility Settings Engine (Feature F2)
    // =========================================================================
    public static class FacilitySettingsEngine
    {
        public static (bool IsValid, string? ErrorMessage) ValidateSettings(UpdateFacilityTeleconsultSettingsCommand cmd)
        {
            if (cmd.TeleconsultRecordingPolicy != null &&
                !RecordingPolicies.ValidPolicies.Contains(cmd.TeleconsultRecordingPolicy))
            {
                return (false, $"Invalid recording policy '{cmd.TeleconsultRecordingPolicy}'. Allowed: Disabled, WorkspaceVaultOnly, Both.");
            }

            if (cmd.TeleconsultRecordingRetentionDays.HasValue && cmd.TeleconsultRecordingRetentionDays.Value < 0)
            {
                return (false, "Recording retention days must be greater than or equal to 0 (0 = indefinite).");
            }

            if (cmd.TeleconsultPaymentPolicy != null &&
                !PaymentPolicies.ValidPolicies.Contains(cmd.TeleconsultPaymentPolicy))
            {
                return (false, $"Invalid payment policy '{cmd.TeleconsultPaymentPolicy}'. Allowed: Prepaid, Postpaid, Exempt.");
            }

            if (cmd.TeleconsultDefaultFee.HasValue && cmd.TeleconsultDefaultFee.Value < 0)
            {
                return (false, "Teleconsult default fee cannot be negative.");
            }

            return (true, null);
        }

        public static FacilityTeleconsultSettingsDto ApplyUpdate(
            FacilityTeleconsultSettingsDto current,
            UpdateFacilityTeleconsultSettingsCommand cmd)
        {
            var (isValid, error) = ValidateSettings(cmd);
            if (!isValid) throw new ArgumentException(error);

            return current with
            {
                TeleconsultRecordingPolicy = cmd.TeleconsultRecordingPolicy ?? current.TeleconsultRecordingPolicy,
                TeleconsultRecordingRetentionDays = cmd.TeleconsultRecordingRetentionDays ?? current.TeleconsultRecordingRetentionDays,
                TeleconsultRecordingConsentRequired = cmd.TeleconsultRecordingConsentRequired ?? current.TeleconsultRecordingConsentRequired,
                TeleconsultPaymentPolicy = cmd.TeleconsultPaymentPolicy ?? current.TeleconsultPaymentPolicy,
                TeleconsultDefaultFee = cmd.TeleconsultDefaultFee ?? current.TeleconsultDefaultFee
            };
        }
    }

    // =========================================================================
    // 3. Booking and Billing Engine (Feature F3)
    // =========================================================================
    public static class BookingAndBillingEngine
    {
        public static TeleconsultCreationResultDto CreateAppointment(
            CreateTeleconsultAppointmentDto req,
            FacilityTeleconsultSettingsDto settings,
            List<Appointment> dbAppointments,
            List<Invoice> dbInvoices,
            List<string> enqueuedInteropEvents)
        {
            var (type, isTeleconsult) = ModalityMapper.ResolveModality(req.AppointmentType, req.ServiceType);

            TeleconsultPaymentPolicy resolvedPolicy;
            if (!string.IsNullOrWhiteSpace(req.PaymentPolicy))
            {
                if (!Enum.TryParse(req.PaymentPolicy, true, out resolvedPolicy))
                {
                    throw new ArgumentException($"Invalid payment policy: {req.PaymentPolicy}");
                }
            }
            else
            {
                Enum.TryParse(settings.TeleconsultPaymentPolicy, true, out resolvedPolicy);
            }

            var appointmentId = Guid.NewGuid();
            var callId = Guid.NewGuid();
            var paymentStatus = resolvedPolicy == TeleconsultPaymentPolicy.Exempt
                ? TeleconsultPaymentStatus.Exempt
                : TeleconsultPaymentStatus.Pending;

            Guid? invoiceId = null;
            Guid? invoiceReqId = null;
            decimal? billedFee = null;
            bool eventEnqueued = false;

            if (isTeleconsult && resolvedPolicy == TeleconsultPaymentPolicy.Prepaid)
            {
                invoiceId = Guid.NewGuid();
                invoiceReqId = Guid.NewGuid();
                billedFee = settings.TeleconsultDefaultFee ?? 400.00m;

                var invoice = new Invoice
                {
                    Id = invoiceId.Value,
                    InvoiceNumber = $"INV-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}",
                    TenantId = req.TenantId,
                    ClinicId = req.ClinicId,
                    AppointmentId = appointmentId,
                    PatientId = req.PatientId,
                    PatientName = req.PatientName,
                    GrossAmount = billedFee.Value,
                    NetAmount = billedFee.Value,
                    Status = InvoiceStatus.Draft,
                    CreatedAt = DateTime.UtcNow
                };
                dbInvoices.Add(invoice);

                if (string.Equals(req.CashierMode, "CashierCounter", StringComparison.OrdinalIgnoreCase))
                {
                    enqueuedInteropEvents.Add($"billing.invoice.requested:{invoiceId.Value}");
                    eventEnqueued = true;
                }
            }

            var appointment = new Appointment
            {
                Id = appointmentId,
                TenantId = req.TenantId,
                ClinicId = req.ClinicId,
                PatientId = req.PatientId,
                PatientName = req.PatientName,
                DoctorId = req.DoctorId,
                DoctorName = req.DoctorName,
                ScheduledAt = req.ScheduledAt,
                DurationMinutes = req.DurationMinutes,
                AppointmentType = type,
                ServiceType = req.ServiceType,
                PaymentPolicy = resolvedPolicy,
                PaymentStatus = paymentStatus,
                InvoiceId = invoiceId,
                InvoiceRequestId = invoiceReqId,
                CallId = isTeleconsult ? callId : null
            };
            dbAppointments.Add(appointment);

            return new TeleconsultCreationResultDto(
                AppointmentId: appointmentId,
                CallId: callId,
                AppointmentType: type.ToString(),
                IsTeleconsult: isTeleconsult,
                PaymentPolicy: resolvedPolicy,
                PaymentStatus: paymentStatus,
                InvoiceId: invoiceId,
                InvoiceRequestId: invoiceReqId,
                BilledAmount: billedFee,
                BillingEventEnqueued: eventEnqueued);
        }
    }

    // =========================================================================
    // 4. Metadata Projection Engine (Feature F4)
    // =========================================================================
    public static class MetadataProjectionEngine
    {
        public static AppointmentDtoTeleconsultProjection Project(Appointment apt)
        {
            return new AppointmentDtoTeleconsultProjection(
                Id: apt.Id,
                PatientName: apt.PatientName,
                ScheduledAt: apt.ScheduledAt,
                AppointmentType: apt.AppointmentType.ToString(),
                IsTeleconsult: apt.IsTeleconsult,
                PaymentPolicy: apt.PaymentPolicy.ToString(),
                PaymentStatus: apt.PaymentStatus.ToString(),
                InvoiceId: apt.InvoiceId,
                PaidAmount: apt.PaidAmount,
                CallId: apt.CallId,
                AdmittedAtUtc: apt.AdmittedAtUtc,
                IsEmergencyOverride: apt.IsEmergencyOverride,
                EmergencyOverrideReasonCode: apt.EmergencyOverrideReasonCode);
        }
    }

    // =========================================================================
    // 5. Cashier Payment Clearance Engine (Feature F5)
    // =========================================================================
    public static class CashierPaymentEngine
    {
        public static CashierPaymentClearanceResultDto RecordPayment(
            CashierPaymentCommandDto cmd,
            List<Invoice> invoices,
            List<Appointment> appointments,
            List<string> enqueuedInteropEvents)
        {
            var invoice = invoices.FirstOrDefault(i => i.Id == cmd.InvoiceId)
                ?? throw new KeyNotFoundException($"Invoice {cmd.InvoiceId} not found");

            invoice.Status = InvoiceStatus.Paid;
            invoice.AmountPaid = cmd.Amount;

            var apt = appointments.FirstOrDefault(a => a.Id == cmd.AppointmentId || a.InvoiceId == cmd.InvoiceId)
                ?? throw new KeyNotFoundException($"Appointment for invoice {cmd.InvoiceId} not found");

            apt.PaymentStatus = TeleconsultPaymentStatus.Paid;
            apt.PaidAmount = cmd.Amount;
            apt.PaidAt = cmd.PaidAtUtc;
            apt.PaymentReceiptNumber = cmd.ReceiptNumber;
            apt.PaymentMethod = cmd.PaymentMethod;

            string eventPayload = $"comms.call.payment.cleared:{apt.CallId}:{cmd.ReceiptNumber}";
            enqueuedInteropEvents.Add(eventPayload);

            return new CashierPaymentClearanceResultDto(
                AppointmentId: apt.Id,
                InvoiceId: invoice.Id,
                PaymentStatus: apt.PaymentStatus,
                PaidAmount: apt.PaidAmount,
                PaidAt: apt.PaidAt,
                ReceiptNumber: apt.PaymentReceiptNumber,
                PaymentMethod: apt.PaymentMethod,
                CommsPaymentClearedEnqueued: true,
                CallId: apt.CallId);
        }
    }

    // =========================================================================
    // 6. Non-Mutating YAKAP Status Evaluator (Feature F6)
    // =========================================================================
    public static class YakapStatusEngine
    {
        public static YakapStatusEvaluationDto Evaluate(
            Appointment appointment,
            Patient patient,
            DateOnly visitDate)
        {
            var activeEnlistment = patient.GetActiveYakapEnlistment(new DateTime(visitDate.Year, visitDate.Month, visitDate.Day, 0, 0, 0, DateTimeKind.Utc));
            bool hasActive = activeEnlistment != null;

            // Strict Non-Mutation Rule: Policy and status remain strictly untouched!
            return new YakapStatusEvaluationDto(
                PatientId: patient.Id,
                HasActiveYakapEnlistment: hasActive,
                EffectiveYear: activeEnlistment?.EffectiveYear,
                PolicyWasMutated: false,
                CurrentPolicy: appointment.PaymentPolicy,
                CurrentStatus: appointment.PaymentStatus);
        }
    }

    // =========================================================================
    // 7. Plain-Note Admission Override Engine (Feature F7)
    // =========================================================================
    public static class AdmissionOverrideEngine
    {
        public static AdmissionOverrideResultDto ExecuteOverride(
            PlainNoteAdmissionOverrideRequest req,
            Appointment apt,
            bool hasConsultationsWrite,
            bool hasConsultationsSign,
            Guid staffId,
            string staffName,
            List<AuditEntry> auditLog,
            List<string> enqueuedInteropEvents)
        {
            // 1. Permission check: staff must hold ConsultationsWrite OR ConsultationsSign
            if (!hasConsultationsWrite && !hasConsultationsSign)
            {
                throw new ForbiddenException("Staff requires ConsultationsWrite or ConsultationsSign authority to authorize teleconsult admission override.");
            }

            // 2. Reason note length check: >= 5 characters
            if (string.IsNullOrWhiteSpace(req.ReasonNote) || req.ReasonNote.Trim().Length < 5)
            {
                throw new BadRequestException("Admission override reason note must provide substantive clinical justification (minimum 5 characters).");
            }

            // 3. ReasonCode default: "STAFF-OVERRIDE" if not provided
            string resolvedReasonCode = string.IsNullOrWhiteSpace(req.ReasonCode)
                ? "STAFF-OVERRIDE"
                : req.ReasonCode.Trim();

            var now = DateTime.UtcNow;
            apt.PaymentStatus = TeleconsultPaymentStatus.Overridden;
            apt.IsEmergencyOverride = true;
            apt.EmergencyOverrideReasonCode = resolvedReasonCode;
            apt.EmergencyOverrideReasonNote = req.ReasonNote.Trim();
            apt.EmergencyOverrideDoctorId = staffId;
            apt.EmergencyOverrideDoctorName = staffName;
            apt.EmergencyOverrideAtUtc = now;
            apt.AdmittedAtUtc = now;
            apt.CallId ??= Guid.NewGuid();

            // 4. Immutable WORM Audit Entry
            var audit = new AuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = apt.TenantId,
                ClinicId = apt.ClinicId,
                Timestamp = now,
                Category = ClinicAuditCategories.Clinical,
                Severity = ClinicAuditSeverities.Emergency,
                Action = "teleconsult.admission.emergency_override",
                ActorStaffId = staffId,
                ActorName = staffName,
                ActorRole = hasConsultationsSign ? "Doctor" : "Staff",
                TargetEntityType = "Appointment",
                TargetEntityId = apt.Id.ToString(),
                PatientId = apt.PatientId,
                PatientNameMasked = MaskName(apt.PatientName),
                Outcome = ClinicAuditOutcomes.Success,
                Description = $"Teleconsult admission override by {staffName}. Reason: [{resolvedReasonCode}] {req.ReasonNote.Trim()}"
            };
            auditLog.Add(audit);

            // 5. Emit CommsCallPaymentCleared
            enqueuedInteropEvents.Add($"comms.call.payment.cleared:{apt.CallId}:{resolvedReasonCode}");

            return new AdmissionOverrideResultDto(
                AppointmentId: apt.Id,
                CallId: apt.CallId.Value,
                RoomName: $"call-{apt.CallId.Value:N}",
                AdmittedAtUtc: now,
                PaymentStatus: apt.PaymentStatus,
                IsEmergencyOverride: true,
                ReasonCode: resolvedReasonCode,
                ReasonNote: req.ReasonNote.Trim(),
                AuthorizedByStaffId: staffId,
                AuthorizedByName: staffName,
                WormAuditLogged: true,
                CommsPaymentClearedEnqueued: true);
        }

        private static string MaskName(string fullName)
        {
            if (string.IsNullOrWhiteSpace(fullName)) return "***";
            var parts = fullName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 1) return parts[0][0] + "***";
            return $"{parts[0][0]}*** {parts[^1][0]}***";
        }
    }

    // =========================================================================
    // 8. Payment Policy Switch Engine (Feature F8)
    // =========================================================================
    public static class PaymentPolicySwitchEngine
    {
        public static UpdatePaymentPolicyResultDto SwitchPolicy(
            Appointment apt,
            string newPolicyStr,
            List<Invoice> invoices,
            decimal defaultFee = 400.00m)
        {
            if (!Enum.TryParse<TeleconsultPaymentPolicy>(newPolicyStr, true, out var newPolicy))
            {
                throw new ArgumentException($"Invalid payment policy: {newPolicyStr}");
            }

            var previousPolicy = apt.PaymentPolicy;
            apt.PaymentPolicy = newPolicy;
            var now = DateTime.UtcNow;

            if (newPolicy == TeleconsultPaymentPolicy.Exempt)
            {
                apt.PaymentStatus = TeleconsultPaymentStatus.Exempt;
            }
            else if (newPolicy == TeleconsultPaymentPolicy.Postpaid)
            {
                if (apt.PaymentStatus != TeleconsultPaymentStatus.Paid)
                {
                    apt.PaymentStatus = TeleconsultPaymentStatus.Pending;
                }
            }
            else if (newPolicy == TeleconsultPaymentPolicy.Prepaid)
            {
                if (apt.PaymentStatus != TeleconsultPaymentStatus.Paid && apt.PaymentStatus != TeleconsultPaymentStatus.Overridden)
                {
                    apt.PaymentStatus = TeleconsultPaymentStatus.Pending;
                    if (apt.InvoiceId == null)
                    {
                        var inv = new Invoice
                        {
                            Id = Guid.NewGuid(),
                            InvoiceNumber = $"INV-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}",
                            TenantId = apt.TenantId,
                            ClinicId = apt.ClinicId,
                            AppointmentId = apt.Id,
                            PatientId = apt.PatientId,
                            PatientName = apt.PatientName,
                            GrossAmount = defaultFee,
                            NetAmount = defaultFee,
                            Status = InvoiceStatus.Draft,
                            CreatedAt = now
                        };
                        invoices.Add(inv);
                        apt.InvoiceId = inv.Id;
                    }
                }
            }

            return new UpdatePaymentPolicyResultDto(
                AppointmentId: apt.Id,
                PreviousPolicy: previousPolicy,
                NewPolicy: newPolicy,
                UpdatedStatus: apt.PaymentStatus,
                InvoiceId: apt.InvoiceId,
                UpdatedAtUtc: now);
        }
    }

    // =========================================================================
    // 9. Media Signaling Engine (Feature F9)
    // =========================================================================
    public static class MediaSignalingEngine
    {
        public static readonly Regex ZeroPhiRoomRegex = new(@"^call-[0-9a-fA-F\-]{32,36}$", RegexOptions.Compiled);
        public static readonly Regex ZeroPhiParticipantRegex = new(@"^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$", RegexOptions.Compiled);

        public static bool ValidateRoomName(string roomName) => ZeroPhiRoomRegex.IsMatch(roomName);
        public static bool ValidateParticipantIdentity(string identity) => ZeroPhiParticipantRegex.IsMatch(identity);

        public static TeleconsultCallJoinDto JoinCall(
            JoinTeleconsultCallRequest req,
            Appointment apt,
            bool simulateTimeout10s,
            List<string> enqueuedInteropEvents)
        {
            if (apt.CallId == null) throw new InvalidOperationException("Appointment is not a teleconsultation or has no CallId.");

            string roomName = $"call-{apt.CallId.Value:N}";
            string participantIdentity = $"{req.ParticipantRole.ToLowerInvariant()}:{req.ParticipantId:N}";

            if (!ValidateRoomName(roomName)) throw new ArgumentException($"Room name {roomName} violates zero-PHI regex.");
            if (!ValidateParticipantIdentity(participantIdentity)) throw new ArgumentException($"Participant identity {participantIdentity} violates zero-PHI regex.");

            bool isFallback = simulateTimeout10s;
            string token = isFallback
                ? $"fallback-token-{Guid.NewGuid():N}"
                : $"livekit-jwt-{Guid.NewGuid():N}";

            enqueuedInteropEvents.Add($"comms.call.state.changed:{apt.CallId}:Joined:{participantIdentity}");

            return new TeleconsultCallJoinDto(
                AppointmentId: apt.Id,
                CallId: apt.CallId.Value,
                RoomName: roomName,
                ParticipantIdentity: participantIdentity,
                AccessToken: token,
                LiveKitServerUrl: "wss://media.clinicez.internal",
                ExpiresAtUtc: DateTime.UtcNow.AddMinutes(60),
                IsFallbackToken: isFallback);
        }

        public static TeleconsultCallEndResultDto EndCall(
            EndTeleconsultCallRequest req,
            Appointment apt,
            List<AuditEntry> auditLog,
            List<string> enqueuedInteropEvents)
        {
            if (apt.CallId == null) throw new InvalidOperationException("Appointment has no CallId.");

            var now = DateTime.UtcNow;
            string roomName = $"call-{apt.CallId.Value:N}";

            var audit = new AuditEntry
            {
                Id = Guid.NewGuid(),
                TenantId = apt.TenantId,
                ClinicId = apt.ClinicId,
                Timestamp = now,
                Category = ClinicAuditCategories.Clinical,
                Severity = ClinicAuditSeverities.Routine,
                Action = "teleconsult.call.ended",
                ActorStaffId = req.InitiatorStaffId,
                ActorName = "Attending Staff",
                ActorRole = "Staff",
                TargetEntityType = "Appointment",
                TargetEntityId = apt.Id.ToString(),
                Outcome = ClinicAuditOutcomes.Success,
                Description = $"Teleconsult call ended. Reason: {req.EndReason ?? "Normal termination"}"
            };
            auditLog.Add(audit);

            enqueuedInteropEvents.Add($"comms.call.state.changed:{apt.CallId}:Ended");

            return new TeleconsultCallEndResultDto(
                AppointmentId: apt.Id,
                CallId: apt.CallId.Value,
                RoomName: roomName,
                EndedAtUtc: now,
                Status: "Ended",
                RecordingFinalized: true,
                WormAuditLogged: true,
                CommsCallStateChangedEnqueued: true);
        }
    }

    // =========================================================================
    // 10. CMK AES-256-GCM Vault Encryption Engine (Feature F10)
    // =========================================================================
    public static class VaultEncryptionEngine
    {
        private static readonly byte[] MasterCmk = Encoding.UTF8.GetBytes("ClinicEZ-Vault-CMK-Key-32Bytes!!");
        private static readonly byte[] HmacSecret = Encoding.UTF8.GetBytes("ClinicEZ-Hmac-Secret-32Bytes!!!!");

        public static EncryptedSegmentUploadResult EncryptAndStoreSegment(
            Guid sessionId,
            Guid segmentId,
            int segmentIndex,
            byte[] plaintextData)
        {
            // 1. Generate ephemeral DEK (32 bytes)
            byte[] dek = new byte[32];
            RandomNumberGenerator.Fill(dek);

            // 2. Encrypt plaintext using AES-256-GCM
            byte[] iv = new byte[12];
            RandomNumberGenerator.Fill(iv);
            byte[] ciphertext = new byte[plaintextData.Length];
            byte[] tag = new byte[16];

            using (var aesGcm = new AesGcm(dek, 16))
            {
                aesGcm.Encrypt(iv, plaintextData, ciphertext, tag);
            }

            // 3. Wrap DEK with Master CMK using AES-KeyWrap or AES-GCM
            byte[] wrappedDekIv = new byte[12];
            RandomNumberGenerator.Fill(wrappedDekIv);
            byte[] encryptedDek = new byte[dek.Length];
            byte[] dekTag = new byte[16];

            using (var cmkGcm = new AesGcm(MasterCmk, 16))
            {
                cmkGcm.Encrypt(wrappedDekIv, dek, encryptedDek, dekTag);
            }

            // Combine wrappedDekIv + dekTag + encryptedDek into sidecar
            byte[] sidecarBytes = new byte[wrappedDekIv.Length + dekTag.Length + encryptedDek.Length];
            Buffer.BlockCopy(wrappedDekIv, 0, sidecarBytes, 0, wrappedDekIv.Length);
            Buffer.BlockCopy(dekTag, 0, sidecarBytes, wrappedDekIv.Length, dekTag.Length);
            Buffer.BlockCopy(encryptedDek, 0, sidecarBytes, wrappedDekIv.Length + dekTag.Length, encryptedDek.Length);

            string storageKey = $"recordings/{sessionId:N}/segments/seg_{segmentIndex:D5}.mp4";
            string sidecarKeyPath = $"{storageKey}.key";

            return new EncryptedSegmentUploadResult(
                SessionId: sessionId,
                SegmentId: segmentId,
                SegmentIndex: segmentIndex,
                StorageKey: storageKey,
                SidecarKeyPath: sidecarKeyPath,
                Ciphertext: ciphertext,
                EncryptedDek: sidecarBytes,
                Iv: iv,
                AuthTag: tag,
                FileSizeBytes: ciphertext.Length);
        }

        public static byte[] DecryptSegment(
            byte[] ciphertext,
            byte[] iv,
            byte[] tag,
            byte[] sidecarBytes)
        {
            // 1. Unwrap DEK using Master CMK
            byte[] wrappedDekIv = new byte[12];
            byte[] dekTag = new byte[16];
            byte[] encryptedDek = new byte[sidecarBytes.Length - 28];

            Buffer.BlockCopy(sidecarBytes, 0, wrappedDekIv, 0, 12);
            Buffer.BlockCopy(sidecarBytes, 12, dekTag, 0, 16);
            Buffer.BlockCopy(sidecarBytes, 28, encryptedDek, 0, encryptedDek.Length);

            byte[] dek = new byte[encryptedDek.Length];
            using (var cmkGcm = new AesGcm(MasterCmk, 16))
            {
                cmkGcm.Decrypt(wrappedDekIv, encryptedDek, dekTag, dek);
            }

            // 2. Decrypt ciphertext using DEK
            byte[] plaintext = new byte[ciphertext.Length];
            using (var aesGcm = new AesGcm(dek, 16))
            {
                aesGcm.Decrypt(iv, ciphertext, tag, plaintext);
            }

            return plaintext;
        }

        public static PlaybackTicketDto GeneratePlaybackTicket(Guid sessionId, int durationMinutes = 15)
        {
            var now = DateTime.UtcNow;
            var expires = now.AddMinutes(durationMinutes);
            string raw = $"{sessionId:N}:{expires.Ticks}";

            using var hmac = new HMACSHA256(HmacSecret);
            byte[] sig = hmac.ComputeHash(Encoding.UTF8.GetBytes(raw));
            string ticket = $"{raw}:{Convert.ToBase64String(sig)}";

            return new PlaybackTicketDto(ticket, sessionId, now, expires, durationMinutes);
        }

        public static bool ValidatePlaybackTicket(string ticket, Guid expectedSessionId)
        {
            if (string.IsNullOrWhiteSpace(ticket)) return false;
            var parts = ticket.Split(':');
            if (parts.Length != 3) return false;

            if (!Guid.TryParse(parts[0], out var sid) || sid != expectedSessionId) return false;
            if (!long.TryParse(parts[1], out var ticks)) return false;

            var expires = new DateTime(ticks, DateTimeKind.Utc);
            if (DateTime.UtcNow > expires) return false;

            string raw = $"{parts[0]}:{parts[1]}";
            using var hmac = new HMACSHA256(HmacSecret);
            byte[] expectedSig = hmac.ComputeHash(Encoding.UTF8.GetBytes(raw));
            string expectedSigStr = Convert.ToBase64String(expectedSig);

            return CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expectedSigStr),
                Encoding.UTF8.GetBytes(parts[2]));
        }
    }

    // =========================================================================
    // 11. Recording Sweeper Engine (Feature F11)
    // =========================================================================
    public static class RecordingSweeperEngine
    {
        public static SweeperCleanupResultDto ExecuteRetentionPurge(
            TeleconsultRecordingSession session,
            List<TeleconsultRecordingSegment> segments,
            HashSet<string> storageBucket,
            int retentionDays)
        {
            // Indefinite retention defense (0 days = keep forever)
            if (retentionDays == 0)
            {
                return new SweeperCleanupResultDto(
                    SessionId: session.Id,
                    SegmentsPurged: 0,
                    SidecarKeysPurged: 0,
                    ManifestPurged: false,
                    ManifestSidecarPurged: false,
                    IsLegalHoldProtected: false,
                    PurgedAtUtc: DateTime.UtcNow);
            }

            // Legal hold defense
            if (session.IsLegalHold)
            {
                return new SweeperCleanupResultDto(
                    SessionId: session.Id,
                    SegmentsPurged: 0,
                    SidecarKeysPurged: 0,
                    ManifestPurged: false,
                    ManifestSidecarPurged: false,
                    IsLegalHoldProtected: true,
                    PurgedAtUtc: DateTime.UtcNow);
            }

            int segmentsPurged = 0;
            int sidecarKeysPurged = 0;

            foreach (var segment in segments.Where(s => s.SessionId == session.Id))
            {
                if (storageBucket.Remove(segment.StorageKey)) segmentsPurged++;
                string sidecarKey = $"{segment.StorageKey}.key";
                if (storageBucket.Remove(sidecarKey)) sidecarKeysPurged++;
            }

            bool manifestPurged = false;
            bool manifestSidecarPurged = false;

            if (!string.IsNullOrEmpty(session.ManifestStorageKey))
            {
                manifestPurged = storageBucket.Remove(session.ManifestStorageKey);
                string manifestSidecar = $"{session.ManifestStorageKey}.key";
                manifestSidecarPurged = storageBucket.Remove(manifestSidecar);
            }

            session.RecordingState = "Purged";
            session.IsPurged = true;
            session.PurgedAtUtc = DateTime.UtcNow;

            return new SweeperCleanupResultDto(
                SessionId: session.Id,
                SegmentsPurged: segmentsPurged,
                SidecarKeysPurged: sidecarKeysPurged,
                ManifestPurged: manifestPurged,
                ManifestSidecarPurged: manifestSidecarPurged,
                IsLegalHoldProtected: false,
                PurgedAtUtc: DateTime.UtcNow);
        }
    }

    // =========================================================================
    // 12. Consultation Encounter Linkage Engine (Feature F12)
    // =========================================================================
    public static class EncounterLinkageEngine
    {
        public static ConsultationLinkageDto LinkEncounter(
            Guid consultationId,
            Guid appointmentId,
            List<TeleconsultRecordingSession> sessions)
        {
            var session = sessions.FirstOrDefault(s => s.AppointmentId == appointmentId);
            if (session == null)
            {
                return new ConsultationLinkageDto(consultationId, appointmentId, null, false, DateTime.UtcNow);
            }

            if (session.ConsultationId.HasValue && session.ConsultationId.Value != consultationId)
            {
                throw new InvalidOperationException($"Session {session.Id} is already linked to consultation {session.ConsultationId.Value}.");
            }

            session.ConsultationId = consultationId;

            return new ConsultationLinkageDto(
                ConsultationId: consultationId,
                AppointmentId: appointmentId,
                SessionId: session.Id,
                LinkageSuccessful: true,
                LinkedAtUtc: DateTime.UtcNow);
        }
    }

    // =========================================================================
    // 13. Interop Handlers Engine (Feature F13)
    // =========================================================================
    public static class InteropHandlersEngine
    {
        public static bool HandleMediaRoomResponded(
            MediaRoomRespondedPayloadDto payload,
            ConcurrentDictionary<Guid, string> roomSidStore)
        {
            if (string.IsNullOrWhiteSpace(payload.RoomSid)) return false;
            roomSidStore[payload.CallId] = payload.RoomSid;
            return true;
        }

        public static bool HandleRecordingConsentLogged(
            CommsRecordingConsentLoggedPayloadDto payload,
            ConcurrentDictionary<Guid, HashSet<Guid>> consentedParticipants)
        {
            var set = consentedParticipants.GetOrAdd(payload.CallId, _ => new HashSet<Guid>());
            lock (set)
            {
                if (payload.ConsentGranted)
                {
                    set.Add(payload.ParticipantId);
                }
                else
                {
                    set.Remove(payload.ParticipantId);
                }
            }
            return true;
        }
    }
}
