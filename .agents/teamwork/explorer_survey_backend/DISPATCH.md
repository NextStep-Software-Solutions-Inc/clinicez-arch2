# Survey Backend Task Assignment
Working directory: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api
Target: services/clinic-api & packages/shared-dotnet


## 2026-11-12T23:14:17Z
You are a teamwork_explorer tasked with mapping the backend scope for the teleconsultation feature.

Working directory: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api
Your state folder: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api/.agents/teamwork/explorer_survey_backend
Original request: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api/ORIGINAL_REQUEST.md
Reference implementation plan: /Users/macuser/.gemini/antigravity/brain/9542d721-8b8b-46ea-9635-c34ef9a2bc0a/implementation_plan.md

Task:
1. Thoroughly read ORIGINAL_REQUEST.md and the implementation_plan.md reference.
2. Investigate the existing backend codebase:
   - packages/shared-dotnet/Common/AppointmentBookedEvent.cs
   - services/clinic-api/ (ClinicSettingsDto, GetClinicSettingsQuery, UpdateClinicSettingsCommand, CreateAppointmentCommand, GetAppointmentsQuery, AppointmentBookedHandler, RecordPaymentCommand, GetTeleconsultStatusQuery, AdmitTeleconsultPatientCommand, UpdateTeleconsultPaymentPolicyCommand, JoinTeleconsultCallCommand, EndTeleconsultCallCommand, TeleconsultRecordingsController, DependencyInjection.cs, and related models/handlers/audit/interop)
   - Test suite: services/clinic-api/ClinicEz.Clinic.Application.Tests/
3. Run existing backend tests using `run_command` (`dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj`) to establish baseline passing/failing status.
4. Enumerate all required features, interfaces, data structures, constraints (zero schema migrations, zero external brokers, zero-PHI identifiers, AES-256-GCM encryption with .key sidecars, WORM audit, interop events).
5. Document what is already implemented vs what is missing or needs modification.
6. Write your comprehensive analysis and findings to handoff.md in your state folder (/Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api/.agents/teamwork/explorer_survey_backend/handoff.md).
7. Send a completion message to the parent orchestrator with the path to handoff.md.
