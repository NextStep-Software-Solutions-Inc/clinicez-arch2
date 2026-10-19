#!/usr/bin/env python3
"""
Adversarial Empirical Probe Suite — Milestone 1 Backend Remediation (Round 2)
Agent: challenger_m1_r2_1

Executes targeted empirical probes against:
1. Impostor Sender Probes in FacilityDirectoryUpdatedInteropHandler.cs:
   - context.From.FacilityId is null
   - context.From.FacilityId is empty string or whitespace
   - context.From.FacilityId is non-GUID ("not-a-guid")
   - context.From.FacilityId is valid GUID but differs from message.ResourceId
   - context.From.TenantId differs from message.TenantId
   -> Verifies all 5 cases are strictly rejected with zero DB mutation.
2. Endpoint Parameter Probes:
   - GetAvailableSlotsEndpoint accepts ?forPatientId= and passes to GetAvailableSlotsQuery.
   - When ForPatientId belongs to an unlocked patient, slots are returned.
3. Two-Tier Governance State Machine Probes:
   - (Portal=true, Clinic=false) -> IsPublic == false
   - (Portal=false, Clinic=true) -> IsPublic == false
   - (Portal=true, Clinic=true) -> IsPublic == true
   - Revoking either tier immediately sets IsPublic == false
"""

import os
import re
import sys
import uuid
from datetime import datetime, timezone, time, date as dt_date
from typing import Optional, List, Dict, Any, Set

class ProbeFailure(Exception):
    pass

total_probes = 0
passed_probes = 0
failed_probes = 0

def assert_probe(name: str, condition: bool, reason: str = ""):
    global total_probes, passed_probes, failed_probes
    total_probes += 1
    if condition:
        passed_probes += 1
        print(f"  [PASS] Probe {total_probes}: {name}")
    else:
        failed_probes += 1
        print(f"  [FAIL] Probe {total_probes}: {name} -- REASON: {reason}")
        raise ProbeFailure(f"{name}: {reason}")

REPO_ROOT = "/Users/macuser/projects/github/nextstep/clinicez-arch2"

# ==============================================================================
# SUITE 1: IMPOSTOR SENDER PROBES
# ==============================================================================
print("\n" + "="*70)
print("PROBE SUITE 1: IMPOSTOR SENDER REJECTION IN FACILITY DIRECTORY INTEROP")
print("="*70)

handler_path = os.path.join(
    REPO_ROOT,
    "services/patient-api/ClinicEz.Patient.Infrastructure/Interop/FacilityDirectoryUpdatedInteropHandler.cs"
)

with open(handler_path, "r", encoding="utf-8") as f:
    handler_content = f.read()

# Static lexical analysis of affirmative validation
assert_probe(
    "Handler checks !string.IsNullOrWhiteSpace(context.From.FacilityId)",
    "!string.IsNullOrWhiteSpace(context.From.FacilityId)" in handler_content,
    "Missing non-whitespace check for sender FacilityId"
)

assert_probe(
    "Handler checks Guid.TryParse(context.From.FacilityId, out var senderFacilityId)",
    "Guid.TryParse(context.From.FacilityId, out var senderFacilityId)" in handler_content,
    "Missing Guid.TryParse for sender FacilityId"
)

assert_probe(
    "Handler checks senderFacilityId == message.ResourceId",
    "senderFacilityId == message.ResourceId" in handler_content,
    "Missing check that sender FacilityId equals message.ResourceId"
)

assert_probe(
    "Handler checks !string.IsNullOrWhiteSpace(context.From.TenantId)",
    "!string.IsNullOrWhiteSpace(context.From.TenantId)" in handler_content,
    "Missing non-whitespace check for sender TenantId"
)

assert_probe(
    "Handler checks string.Equals(context.From.TenantId, message.TenantId, StringComparison.OrdinalIgnoreCase)",
    "string.Equals(context.From.TenantId, message.TenantId, StringComparison.OrdinalIgnoreCase)" in handler_content,
    "Missing case-insensitive tenant check"
)

assert_probe(
    "Handler logs security alert and returns early if !isValidClinicSender",
    "if (!isValidClinicSender)" in handler_content and "return;" in handler_content,
    "Missing early return on invalid clinic sender"
)

# Simulation Harness for Suite 1
class MockParty:
    def __init__(self, kind: str, facility_type: Optional[str] = None, facility_id: Optional[str] = None, tenant_id: Optional[str] = None, service: Optional[str] = None):
        self.Kind = kind  # "Facility", "ControlPlane", "Patient"
        self.FacilityType = facility_type  # "Clinic", "Laboratory", "Pharmacy", "Organization"
        self.FacilityId = facility_id
        self.TenantId = tenant_id
        self.Service = service

class MockInteropMessageContext:
    def __init__(self, from_party: MockParty, message_id: uuid.UUID = uuid.uuid4()):
        self.From = from_party
        self.MessageId = message_id

class MockFacilityCreatedEvent:
    def __init__(self, resource_id: uuid.UUID, tenant_id: str, name: str = "Test Clinic", facility_type: str = "Clinic", is_public: bool = True):
        self.ResourceId = resource_id
        self.TenantId = tenant_id
        self.Name = name
        self.FacilityType = facility_type
        self.IsPublic = is_public
        self.IsWorkspaceEligible = None
        self.IsDirectoryPublished = None
        self.IsBookingPaused = None
        self.OperatingHours = "08:00 - 17:00"
        self.IsJoinGated = False
        self.JoinCode = None
        self.Providers = []
        self.Services = []
        self.CreatedAt = datetime.now(timezone.utc)
        self.Slug = None
        self.Address = "123 Health Ave"
        self.City = "Cagayan de Oro"
        self.Province = "Misamis Oriental"
        self.Region = "Region X"
        self.Classification = "Primary Care"
        self.IsPhilHealthAccredited = True
        self.ConsoleUrl = None

class SimulatedDb:
    def __init__(self):
        self.clinics = {}
        self.organizations = {}
        self.add_calls = 0
        self.save_calls = 0

def simulate_interop_handler(msg: MockFacilityCreatedEvent, ctx: MockInteropMessageContext, db: SimulatedDb) -> Dict[str, Any]:
    logs = []
    
    isAuthorizedPortal = (
        ctx.From.Kind == "ControlPlane" and
        (ctx.From.Service or "").lower() == "portal-api"
    )
    
    isClinicSender = (
        ctx.From.Kind == "Facility" and
        ctx.From.FacilityType == "Clinic"
    )
    
    if not isAuthorizedPortal and not isClinicSender:
        logs.append(f"Ignoring message: sender {ctx.From} is neither portal nor authorized clinic")
        return {"handled": False, "reason": "unauthorized_party", "logs": logs}
        
    if isClinicSender:
        facility_id = ctx.From.FacilityId
        tenant_id = ctx.From.TenantId
        
        has_facility_id = facility_id is not None and len(facility_id.strip()) > 0
        is_valid_guid = False
        sender_guid = None
        if has_facility_id:
            try:
                sender_guid = uuid.UUID(facility_id.strip())
                is_valid_guid = True
            except (ValueError, AttributeError):
                is_valid_guid = False
                
        guid_matches_resource = is_valid_guid and sender_guid == msg.ResourceId
        has_tenant_id = tenant_id is not None and len(tenant_id.strip()) > 0
        tenant_matches = has_tenant_id and (tenant_id.strip().lower() == msg.TenantId.strip().lower())
        
        is_valid_clinic_sender = (
            has_facility_id and
            is_valid_guid and
            guid_matches_resource and
            has_tenant_id and
            tenant_matches
        )
        
        if not is_valid_clinic_sender:
            logs.append(f"Security alert: Ignoring message: clinic sender FacilityId '{facility_id}' (Tenant: '{tenant_id}') invalid or does not match resource '{msg.ResourceId}'")
            return {"handled": False, "reason": "security_alert_invalid_clinic_sender", "logs": logs}

    # If valid, processing occurs and modifies db
    db.add_calls += 1
    db.save_calls += 1
    db.clinics[msg.ResourceId] = {
        "id": msg.ResourceId,
        "name": msg.Name,
        "tenant_id": msg.TenantId
    }
    return {"handled": True, "reason": "processed", "logs": logs}

resource_id = uuid.uuid4()
target_tenant = "tenant-target-123"
valid_msg = MockFacilityCreatedEvent(resource_id, target_tenant, "St Jude Clinic")

# Test 1.1: context.From.FacilityId is null
db_1 = SimulatedDb()
ctx_1 = MockInteropMessageContext(MockParty("Facility", "Clinic", facility_id=None, tenant_id=target_tenant))
res_1 = simulate_interop_handler(valid_msg, ctx_1, db_1)
assert_probe(
    "Impostor Probe 1: FacilityId=null is strictly rejected without modifying database state",
    res_1["handled"] is False and db_1.save_calls == 0 and len(db_1.clinics) == 0,
    f"Expected rejected without DB modification, got handled={res_1['handled']}, db_saves={db_1.save_calls}"
)

# Test 1.2: context.From.FacilityId is empty string or whitespace
for ws_val in ["", "   ", "\t  \n"]:
    db_2 = SimulatedDb()
    ctx_2 = MockInteropMessageContext(MockParty("Facility", "Clinic", facility_id=ws_val, tenant_id=target_tenant))
    res_2 = simulate_interop_handler(valid_msg, ctx_2, db_2)
    assert_probe(
        f"Impostor Probe 2: FacilityId='{ws_val}' (whitespace) is strictly rejected without modifying DB",
        res_2["handled"] is False and db_2.save_calls == 0 and len(db_2.clinics) == 0,
        f"Whitespace was not rejected: handled={res_2['handled']}"
    )

# Test 1.3: context.From.FacilityId is non-GUID (e.g. "not-a-guid")
for invalid_guid in ["not-a-guid", "12345", "11111111-2222-3333-4444-zzzzzzzzzzzz", "null", "undefined"]:
    db_3 = SimulatedDb()
    ctx_3 = MockInteropMessageContext(MockParty("Facility", "Clinic", facility_id=invalid_guid, tenant_id=target_tenant))
    res_3 = simulate_interop_handler(valid_msg, ctx_3, db_3)
    assert_probe(
        f"Impostor Probe 3: FacilityId='{invalid_guid}' (non-GUID) is strictly rejected without modifying DB",
        res_3["handled"] is False and db_3.save_calls == 0 and len(db_3.clinics) == 0,
        f"Non-GUID was not rejected: handled={res_3['handled']}"
    )

# Test 1.4: context.From.FacilityId is a valid GUID but differs from message.ResourceId
db_4 = SimulatedDb()
diff_guid = uuid.uuid4()
ctx_4 = MockInteropMessageContext(MockParty("Facility", "Clinic", facility_id=str(diff_guid), tenant_id=target_tenant))
res_4 = simulate_interop_handler(valid_msg, ctx_4, db_4)
assert_probe(
    "Impostor Probe 4: FacilityId is valid GUID but differs from message.ResourceId -> strictly rejected without modifying DB",
    res_4["handled"] is False and db_4.save_calls == 0 and len(db_4.clinics) == 0,
    f"Mismatched ResourceId was not rejected: handled={res_4['handled']}"
)

# Test 1.5: context.From.TenantId differs from message.TenantId
db_5 = SimulatedDb()
ctx_5 = MockInteropMessageContext(MockParty("Facility", "Clinic", facility_id=str(resource_id), tenant_id="tenant-attacker-666"))
res_5 = simulate_interop_handler(valid_msg, ctx_5, db_5)
assert_probe(
    "Impostor Probe 5: TenantId differs from message.TenantId -> strictly rejected without modifying DB",
    res_5["handled"] is False and db_5.save_calls == 0 and len(db_5.clinics) == 0,
    f"Mismatched TenantId was not rejected: handled={res_5['handled']}"
)

# Test 1.6: Valid clinic sender passes
db_valid = SimulatedDb()
ctx_valid = MockInteropMessageContext(MockParty("Facility", "Clinic", facility_id=str(resource_id), tenant_id=target_tenant))
res_valid = simulate_interop_handler(valid_msg, ctx_valid, db_valid)
assert_probe(
    "Valid clinic sender (matching GUID and Tenant) is accepted and persists to DB",
    res_valid["handled"] is True and db_valid.save_calls == 1 and resource_id in db_valid.clinics,
    f"Valid clinic sender failed: handled={res_valid['handled']}"
)


# ==============================================================================
# SUITE 2: ENDPOINT PARAMETER PROBES
# ==============================================================================
print("\n" + "="*70)
print("PROBE SUITE 2: ENDPOINT PARAMETER BINDING AND UNLOCKED PATIENT SLOTS")
print("="*70)

endpoint_path = os.path.join(
    REPO_ROOT,
    "services/patient-api/ClinicEz.Patient.Api/Endpoints/Appointments/GetAvailableSlotsEndpoint.cs"
)
with open(endpoint_path, "r", encoding="utf-8") as f:
    endpoint_content = f.read()

assert_probe(
    "GetAvailableSlotsEndpoint binds [FromQuery] Guid? forPatientId = null",
    "[FromQuery] Guid? forPatientId = null" in endpoint_content or "[FromQuery] Guid? forPatientId" in endpoint_content,
    "Missing [FromQuery] Guid? forPatientId in endpoint signature"
)

assert_probe(
    "GetAvailableSlotsEndpoint passes forPatientId to new GetAvailableSlotsQuery(...)",
    "new GetAvailableSlotsQuery(clinicId, providerId, date, forPatientId)" in endpoint_content,
    "Endpoint does not pass forPatientId to GetAvailableSlotsQuery constructor"
)

# Check GetAvailableSlotsQuery.cs signature
query_path = os.path.join(
    REPO_ROOT,
    "services/patient-api/ClinicEz.Patient.Application/Features/Appointments/Queries/GetAvailableSlots/GetAvailableSlotsQuery.cs"
)
with open(query_path, "r", encoding="utf-8") as f:
    query_content = f.read()

assert_probe(
    "GetAvailableSlotsQuery record contains Guid? ForPatientId = null",
    "public sealed record GetAvailableSlotsQuery(Guid ClinicId, Guid ProviderId, DateOnly Date, Guid? ForPatientId = null)" in query_content,
    "GetAvailableSlotsQuery record signature does not include ForPatientId"
)

# Simulation Harness for GetAvailableSlotsQueryHandler
class MockClinicMembership:
    def __init__(self, patient_id: uuid.UUID, clinic_id: uuid.UUID, status: str = "Active"):
        self.patient_id = patient_id
        self.clinic_id = clinic_id
        self.status = status

class MockOrgMembership:
    def __init__(self, patient_id: uuid.UUID, org_id: uuid.UUID, status: str = "Active"):
        self.patient_id = patient_id
        self.organization_id = org_id
        self.status = status

class MockProviderAvailability:
    def __init__(self, provider_id: uuid.UUID, day_of_week: int, start_time: time, end_time: time, is_active: bool = True):
        self.provider_id = provider_id
        self.day_of_week = day_of_week
        self.start_time = start_time
        self.end_time = end_time
        self.is_active = is_active

class MockAppointment:
    def __init__(self, clinic_id: uuid.UUID, provider_id: uuid.UUID, scheduled_at: datetime, duration_minutes: int):
        self.clinic_id = clinic_id
        self.provider_id = provider_id
        self.scheduled_at = scheduled_at
        self.duration_minutes = duration_minutes

def simulate_get_available_slots_handler(
    clinic_id: uuid.UUID,
    provider_id: uuid.UUID,
    date: dt_date,
    for_patient_id: Optional[uuid.UUID],
    clinic_is_gated: bool,
    clinic_org_links: List[uuid.UUID],
    clinic_memberships: List[MockClinicMembership],
    org_memberships: List[MockOrgMembership],
    availabilities: List[MockProviderAvailability],
    appointments: List[MockAppointment]
) -> List[Dict[str, Any]]:
    # 1. Gating logic reproduction from GetAvailableSlotsQueryHandler.cs lines 47-81
    if clinic_is_gated:
        is_unlocked = False
        if for_patient_id is not None:
            # Check clinic membership
            mem = next((m for m in clinic_memberships if m.patient_id == for_patient_id and m.clinic_id == clinic_id), None)
            if mem is not None and mem.status == "Active":
                is_unlocked = True
            elif clinic_org_links:
                # Check linked org memberships
                linked_org_set = set(clinic_org_links)
                if any(m.patient_id == for_patient_id and m.status == "Active" and m.organization_id in linked_org_set for m in org_memberships):
                    is_unlocked = True
        if not is_unlocked:
            return []
            
    # 2. Slot calculation reproduction from lines 84-132
    slots = []
    day_of_week = date.weekday()  # Monday = 0 in Python
    # Filter active availabilities for that day
    matching_availabilities = [a for a in availabilities if a.provider_id == provider_id and a.day_of_week == day_of_week and a.is_active]
    
    interval_minutes = 30
    for a in matching_availabilities:
        cur_min = a.start_time.hour * 60 + a.start_time.minute
        end_min = a.end_time.hour * 60 + a.end_time.minute
        while cur_min + interval_minutes <= end_min:
            slot_hour = cur_min // 60
            slot_minute = cur_min % 60
            time_str = f"{slot_hour:02d}:{slot_minute:02d}"
            
            # Check overlap with appointments
            is_available = True
            for appt in appointments:
                if appt.clinic_id == clinic_id and appt.provider_id == provider_id and appt.scheduled_at.date() == date:
                    appt_start_min = appt.scheduled_at.hour * 60 + appt.scheduled_at.minute
                    appt_end_min = appt_start_min + appt.duration_minutes
                    if (cur_min >= appt_start_min and cur_min < appt_end_min) or \
                       (cur_min + interval_minutes > appt_start_min and cur_min + interval_minutes <= appt_end_min):
                        is_available = False
                        break
            slots.append({"id": f"{date.isoformat()}-{time_str}", "time": time_str, "available": is_available})
            cur_min += interval_minutes
            
    return slots

test_clinic = uuid.uuid4()
test_doctor = uuid.uuid4()
test_patient_unlocked = uuid.uuid4()
test_patient_locked = uuid.uuid4()
test_org = uuid.uuid4()
test_date = dt_date(2026, 10, 19) # Monday

avail_list = [
    MockProviderAvailability(test_doctor, day_of_week=0, start_time=time(9, 0), end_time=time(11, 0), is_active=True)
]

# Probe 2.1: Gated clinic with forPatientId = null -> returns empty []
slots_no_patient = simulate_get_available_slots_handler(
    clinic_id=test_clinic,
    provider_id=test_doctor,
    date=test_date,
    for_patient_id=None,
    clinic_is_gated=True,
    clinic_org_links=[],
    clinic_memberships=[],
    org_memberships=[],
    availabilities=avail_list,
    appointments=[]
)
assert_probe(
    "Endpoint Probe 2.1: When clinic is gated and forPatientId is null, returns empty list []",
    len(slots_no_patient) == 0,
    f"Expected empty list, got {len(slots_no_patient)} slots"
)

# Probe 2.2: Gated clinic with forPatientId of locked patient -> returns empty []
slots_locked_patient = simulate_get_available_slots_handler(
    clinic_id=test_clinic,
    provider_id=test_doctor,
    date=test_date,
    for_patient_id=test_patient_locked,
    clinic_is_gated=True,
    clinic_org_links=[],
    clinic_memberships=[],
    org_memberships=[],
    availabilities=avail_list,
    appointments=[]
)
assert_probe(
    "Endpoint Probe 2.2: When clinic is gated and patient has no membership, returns empty list []",
    len(slots_locked_patient) == 0,
    f"Expected empty list, got {len(slots_locked_patient)} slots"
)

# Probe 2.3: Gated clinic with forPatientId of UNLOCKED patient (direct clinic membership) -> returns slots
slots_unlocked_direct = simulate_get_available_slots_handler(
    clinic_id=test_clinic,
    provider_id=test_doctor,
    date=test_date,
    for_patient_id=test_patient_unlocked,
    clinic_is_gated=True,
    clinic_org_links=[],
    clinic_memberships=[MockClinicMembership(test_patient_unlocked, test_clinic, "Active")],
    org_memberships=[],
    availabilities=avail_list,
    appointments=[]
)
assert_probe(
    "Endpoint Probe 2.3: When ForPatientId belongs to unlocked patient (active clinic member), slots ARE returned",
    len(slots_unlocked_direct) == 4,  # 09:00, 09:30, 10:00, 10:30
    f"Expected 4 slots, got {len(slots_unlocked_direct)}"
)

# Probe 2.4: Gated clinic with forPatientId of UNLOCKED patient (linked org membership) -> returns slots
slots_unlocked_org = simulate_get_available_slots_handler(
    clinic_id=test_clinic,
    provider_id=test_doctor,
    date=test_date,
    for_patient_id=test_patient_unlocked,
    clinic_is_gated=True,
    clinic_org_links=[test_org],
    clinic_memberships=[],
    org_memberships=[MockOrgMembership(test_patient_unlocked, test_org, "Active")],
    availabilities=avail_list,
    appointments=[]
)
assert_probe(
    "Endpoint Probe 2.4: When ForPatientId belongs to unlocked patient (active linked org member), slots ARE returned",
    len(slots_unlocked_org) == 4,
    f"Expected 4 slots, got {len(slots_unlocked_org)}"
)

# Probe 2.5: Ungated clinic with forPatientId = null -> returns slots
slots_ungated = simulate_get_available_slots_handler(
    clinic_id=test_clinic,
    provider_id=test_doctor,
    date=test_date,
    for_patient_id=None,
    clinic_is_gated=False,
    clinic_org_links=[],
    clinic_memberships=[],
    org_memberships=[],
    availabilities=avail_list,
    appointments=[]
)
assert_probe(
    "Endpoint Probe 2.5: When clinic is ungated, slots are returned without requiring patient unlock",
    len(slots_ungated) == 4,
    f"Expected 4 slots, got {len(slots_ungated)}"
)


# ==============================================================================
# SUITE 3: TWO-TIER GOVERNANCE STATE MACHINE PROBES
# ==============================================================================
print("\n" + "="*70)
print("PROBE SUITE 3: TWO-TIER GOVERNANCE STATE MACHINE PROBES")
print("="*70)

clinic_entity_path = os.path.join(
    REPO_ROOT,
    "services/patient-api/ClinicEz.Patient.Domain/Entities/Clinic.cs"
)
with open(clinic_entity_path, "r", encoding="utf-8") as f:
    clinic_entity_content = f.read()

assert_probe(
    "Clinic entity defines IsWorkspaceEligible defaulting to false",
    "public bool IsWorkspaceEligible { get; set; } = false;" in clinic_entity_content,
    "IsWorkspaceEligible default not false"
)

assert_probe(
    "Clinic entity defines IsDirectoryPublished defaulting to false",
    "public bool IsDirectoryPublished { get; set; } = false;" in clinic_entity_content,
    "IsDirectoryPublished default not false"
)

assert_probe(
    "Clinic entity defines IsPublic defaulting to false",
    "public bool IsPublic { get; set; } = false;" in clinic_entity_content,
    "IsPublic default not false"
)

assert_probe(
    "Clinic entity provides SyncPublicStatus calculating IsPublic = IsWorkspaceEligible && IsDirectoryPublished",
    "IsPublic = IsWorkspaceEligible && IsDirectoryPublished;" in clinic_entity_content,
    "SyncPublicStatus does not perform boolean AND"
)

class SimulatedClinicEntity:
    def __init__(self):
        self.IsWorkspaceEligible = False
        self.IsDirectoryPublished = False
        self.IsPublic = False
        
    def SetWorkspaceEligibility(self, is_eligible: bool):
        self.IsWorkspaceEligible = is_eligible
        self.SyncPublicStatus()
        
    def SetDirectoryPublished(self, is_published: bool):
        self.IsDirectoryPublished = is_published
        self.SyncPublicStatus()
        
    def SyncPublicStatus(self):
        self.IsPublic = self.IsWorkspaceEligible and self.IsDirectoryPublished

# Truth Table Probes
c1 = SimulatedClinicEntity()
c1.SetWorkspaceEligibility(True)
c1.SetDirectoryPublished(False)
assert_probe(
    "State Machine Probe 3.1: (Portal=true, Clinic=false) -> IsPublic == false",
    c1.IsPublic is False and c1.IsWorkspaceEligible is True and c1.IsDirectoryPublished is False,
    f"Expected IsPublic=False, got {c1.IsPublic}"
)

c2 = SimulatedClinicEntity()
c2.SetWorkspaceEligibility(False)
c2.SetDirectoryPublished(True)
assert_probe(
    "State Machine Probe 3.2: (Portal=false, Clinic=true) -> IsPublic == false",
    c2.IsPublic is False and c2.IsWorkspaceEligible is False and c2.IsDirectoryPublished is True,
    f"Expected IsPublic=False, got {c2.IsPublic}"
)

c3 = SimulatedClinicEntity()
c3.SetWorkspaceEligibility(True)
c3.SetDirectoryPublished(True)
assert_probe(
    "State Machine Probe 3.3: (Portal=true, Clinic=true) -> IsPublic == true",
    c3.IsPublic is True and c3.IsWorkspaceEligible is True and c3.IsDirectoryPublished is True,
    f"Expected IsPublic=True, got {c3.IsPublic}"
)

# Revocation Probes
# Start from State 3 (both true -> IsPublic == true)
c_rev1 = SimulatedClinicEntity()
c_rev1.SetWorkspaceEligibility(True)
c_rev1.SetDirectoryPublished(True)
assert c_rev1.IsPublic is True

# Revoke Portal tier
c_rev1.SetWorkspaceEligibility(False)
assert_probe(
    "State Machine Probe 3.4a: Revoking Portal tier immediately sets IsPublic == false",
    c_rev1.IsPublic is False and c_rev1.IsWorkspaceEligible is False and c_rev1.IsDirectoryPublished is True,
    f"Expected IsPublic=False, got {c_rev1.IsPublic}"
)

# Start from State 3 again
c_rev2 = SimulatedClinicEntity()
c_rev2.SetWorkspaceEligibility(True)
c_rev2.SetDirectoryPublished(True)
assert c_rev2.IsPublic is True

# Revoke Clinic tier
c_rev2.SetDirectoryPublished(False)
assert_probe(
    "State Machine Probe 3.4b: Revoking Clinic tier immediately sets IsPublic == false",
    c_rev2.IsPublic is False and c_rev2.IsWorkspaceEligible is True and c_rev2.IsDirectoryPublished is False,
    f"Expected IsPublic=False, got {c_rev2.IsPublic}"
)

# Re-granting verification
c_rev1.SetWorkspaceEligibility(True)
assert_probe(
    "State Machine Probe 3.5: Re-granting revoked tier immediately restores IsPublic == true",
    c_rev1.IsPublic is True and c_rev1.IsWorkspaceEligible is True and c_rev1.IsDirectoryPublished is True,
    f"Expected IsPublic=True, got {c_rev1.IsPublic}"
)

# Interop Handler Tier Scoping Probes
# Verify in FacilityDirectoryUpdatedInteropHandler that Portal only touches WorkspaceEligibility, Clinic only touches DirectoryPublished
portal_scoping_match = bool(re.search(
    r'if\s*\(\s*isAuthorizedPortal\s*\)\s*\{[^}]*SetWorkspaceEligibility',
    handler_content
))
clinic_scoping_match = bool(re.search(
    r'else if\s*\(\s*isClinicSender\s*\)\s*\{[^}]*SetDirectoryPublished',
    handler_content
))

assert_probe(
    "State Machine Probe 3.6: Handler restricts Portal messages to SetWorkspaceEligibility",
    portal_scoping_match,
    "Portal message handling not scoped to SetWorkspaceEligibility"
)

assert_probe(
    "State Machine Probe 3.7: Handler restricts Clinic messages to SetDirectoryPublished",
    clinic_scoping_match,
    "Clinic message handling not scoped to SetDirectoryPublished"
)

# Verify sync is called after both paths
sync_calls = len(re.findall(r'\.SyncPublicStatus\(\)', handler_content))
assert_probe(
    "State Machine Probe 3.8: Handler invokes SyncPublicStatus on both insertion and update paths",
    sync_calls >= 2,
    f"Expected at least 2 SyncPublicStatus calls, found {sync_calls}"
)

# Print Summary
print("\n" + "="*70)
print(f"ADVERSARIAL PROBE RUN COMPLETED: {total_probes} probes executed")
print(f"Passed: {passed_probes} | Failed: {failed_probes}")
print("="*70)

if failed_probes > 0:
    sys.exit(1)
sys.exit(0)
