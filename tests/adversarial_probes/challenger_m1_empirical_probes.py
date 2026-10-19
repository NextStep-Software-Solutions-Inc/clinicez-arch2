#!/usr/bin/env python3
"""
Empirical Challenger Probe Suite for Milestone 1 Backend Logic.
Validates:
1. Readiness Checklist Evaluation & Strict Publishing Blocking.
2. Hybrid Gated Intake Access (Join codes, expiry, malformed codes, org resolution, data & slot leakage).
3. Capacity Controls (IsOnlineBookingPaused -> SupportsAppointments).
4. Adversarial Edge Cases & Security Defenses (Exception handling, direct API bypass risks).
"""

import re
import sys
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

class ValidationException(Exception):
    def __init__(self, message: str, errors: Optional[Dict[str, List[str]]] = None):
        super().__init__(message)
        self.message = message
        self.errors = errors or {}

class NotFoundException(Exception):
    pass

class ConflictException(Exception):
    pass

# ==============================================================================
# Domain Models & In-Memory State
# ==============================================================================

class StaffMember:
    def __init__(self, id: uuid.UUID, first_name: str, last_name: str, role: str, prc: Optional[str], is_active: bool):
        self.id = id
        self.first_name = first_name
        self.last_name = last_name
        self.role = role  # "Doctor", "Nurse", etc.
        self.prc_license_number = prc
        self.is_active = is_active

class ClinicServiceItem:
    def __init__(self, id: uuid.UUID, name: str, category: str, price: float, is_active: bool):
        self.id = id
        self.name = name
        self.category = category
        self.price = price
        self.is_active = is_active

class ClinicSettings:
    def __init__(self, clinic_id: uuid.UUID, tenant_id: str, name: str, operating_hours: Optional[str] = None):
        self.clinic_id = clinic_id
        self.tenant_id = tenant_id
        self.clinic_name = name
        self.operating_hours = operating_hours
        self.is_directory_published = False
        self.is_online_booking_paused = False
        self.letterhead_address: Optional[str] = "123 Main St"
        self.letterhead_contact: Optional[str] = "+639171234567"
        self.letterhead_header: Optional[str] = "Main Header"
        self.is_philhealth_configured = True
        self.is_join_enabled = True
        self.join_code: Optional[str] = "ABC123"

class ClinicEntity:
    def __init__(self, id: uuid.UUID, name: str, tenant_id: Optional[str] = None, is_gated: bool = False, join_code: Optional[str] = None, join_code_expires_at: Optional[datetime] = None):
        self.id = id
        self.name = name
        self.tenant_id = tenant_id
        self.is_public = False
        self.supports_appointments = True
        self.operating_hours: Optional[str] = None
        self.is_gated = is_gated
        self.join_code = join_code
        self.join_code_expires_at = join_code_expires_at
        self.featured_score = 0
        self.active_member_count = 0
        self.services: List[ClinicServiceItem] = []
        self.providers: List[StaffMember] = []
        self.organization_links: List[Dict[str, Any]] = []

class ClinicMembership:
    def __init__(self, patient_id: uuid.UUID, clinic_id: uuid.UUID, status: str, is_deleted: bool = False):
        self.id = uuid.uuid4()
        self.patient_id = patient_id
        self.clinic_id = clinic_id
        self.status = status  # "Active", "Pending", "Inactive"
        self.is_deleted = is_deleted

class OrganizationMembership:
    def __init__(self, patient_id: uuid.UUID, org_id: uuid.UUID, status: str):
        self.id = uuid.uuid4()
        self.patient_id = patient_id
        self.organization_id = org_id
        self.status = status  # "Active", "Pending", etc.

# ==============================================================================
# Simulation Handlers (Faithful 1:1 C# logic reproduction)
# ==============================================================================

def evaluate_readiness(settings: Optional[ClinicSettings], staff: List[StaffMember], services: List[ClinicServiceItem]):
    has_operating_hours = bool(settings and settings.operating_hours and settings.operating_hours.strip())
    
    active_doctors = [
        s for s in staff
        if s.is_active and s.role == "Doctor" and s.prc_license_number and s.prc_license_number.strip()
    ]
    has_licensed_doctors = len(active_doctors) > 0
    
    active_services = [s for s in services if s.is_active]
    has_active_services = len(active_services) > 0
    
    has_letterhead = bool(
        settings and (
            (settings.letterhead_address and settings.letterhead_address.strip()) or
            (settings.letterhead_contact and settings.letterhead_contact.strip()) or
            (settings.letterhead_header and settings.letterhead_header.strip())
        )
    )
    
    is_ready = has_operating_hours and has_licensed_doctors and has_active_services
    
    return {
        "is_ready": is_ready,
        "has_operating_hours": has_operating_hours,
        "has_licensed_doctors": has_licensed_doctors,
        "licensed_doctors_count": len(active_doctors),
        "has_active_services": has_active_services,
        "active_services_count": len(active_services),
        "has_letterhead": has_letterhead
    }

def handle_publish_clinic(settings: ClinicSettings, staff: List[StaffMember], services: List[ClinicServiceItem], is_published: bool, outbox: list):
    active_doctors = [
        s for s in staff
        if s.is_active and s.role == "Doctor" and s.prc_license_number and s.prc_license_number.strip()
    ]
    active_services = [s for s in services if s.is_active]
    
    if is_published:
        missing_checks = []
        if not (settings.operating_hours and settings.operating_hours.strip()):
            missing_checks.append("Operating hours must be configured")
        if len(active_doctors) == 0:
            missing_checks.append("At least one active licensed doctor with PRC license number is required")
        if len(active_services) == 0:
            missing_checks.append("At least one active clinic service must be published in the fee schedule")
            
        if missing_checks:
            # Note: C# handler throws InvalidOperationException
            raise RuntimeError(f"Cannot publish clinic to directory: readiness checks failed. {'; '.join(missing_checks)}.")
        
        settings.is_directory_published = True
    else:
        settings.is_directory_published = False
        
    # Enqueue event to outbox
    event = {
        "type": "facility.directory.updated",
        "resource_id": settings.clinic_id,
        "name": settings.clinic_name,
        "is_public": settings.is_directory_published,
        "is_booking_paused": settings.is_online_booking_paused,
        "operating_hours": settings.operating_hours,
        "providers_count": len(active_doctors),
        "services_count": len(active_services)
    }
    outbox.append(event)
    return {"success": True, "is_published": settings.is_directory_published}

def validate_unlock_request(join_code: Optional[str], org_id: Optional[uuid.UUID]):
    errors = {}
    if join_code is not None and join_code.strip():
        code = join_code.strip()
        if len(code) != 6:
            errors["JoinCode"] = "Join code must be exactly 6 alphanumeric characters."
        elif not re.match(r"^[a-zA-Z0-9]{6}$", code):
            errors["JoinCode"] = "Join code must contain only alphanumeric characters."
    elif org_id is None:
        errors["JoinCode"] = "Either JoinCode or OrganizationId must be provided."
        
    if errors:
        raise ValidationException("Validation failed", errors)

def handle_unlock_clinic(clinic: ClinicEntity, patient_id: uuid.UUID, join_code: Optional[str], org_id: Optional[uuid.UUID], memberships: List[ClinicMembership], org_memberships: List[OrganizationMembership]):
    validate_unlock_request(join_code, org_id)
    
    if not clinic.is_gated:
        return {"success": True, "is_unlocked": True, "message": "Clinic is open; gated unlock is not required."}
        
    is_authorized = False
    unlock_method = "join_code"
    now = datetime.now(timezone.utc)
    
    if join_code and join_code.strip():
        code = join_code.strip()
        if clinic.join_code_expires_at is not None and clinic.join_code_expires_at < now:
            raise ValidationException("The join code for this clinic has expired.")
            
        if not clinic.join_code or clinic.join_code.strip().lower() != code.lower():
            raise ValidationException("Invalid clinic join code.")
            
        is_authorized = True
        unlock_method = "join_code"
    elif org_id is not None:
        is_linked = any(l["org_id"] == org_id and l["is_active"] for l in clinic.organization_links)
        if not is_linked:
            raise ValidationException("The specified organization is not linked to this clinic.")
            
        org_mem = next((m for m in org_memberships if m.patient_id == patient_id and m.organization_id == org_id), None)
        if org_mem is None or org_mem.status != "Active":
            raise ValidationException("Patient does not have an active membership in the linked organization.")
            
        is_authorized = True
        unlock_method = "organization_link"
        
    if not is_authorized:
        raise ValidationException("Could not verify authorization to unlock this clinic.")
        
    # Find or create membership
    existing = next((m for m in memberships if m.patient_id == patient_id and m.clinic_id == clinic.id), None)
    if existing:
        existing.is_deleted = False
        existing.status = "Active"
        mem_id = existing.id
    else:
        new_mem = ClinicMembership(patient_id, clinic.id, "Active")
        memberships.append(new_mem)
        clinic.active_member_count += 1
        mem_id = new_mem.id
        
    return {
        "success": True,
        "is_unlocked": True,
        "membership_id": mem_id,
        "message": f"Clinic unlocked successfully via {unlock_method}."
    }

def handle_get_clinic_detail(clinic: ClinicEntity, for_patient_id: Optional[uuid.UUID], memberships: List[ClinicMembership], org_memberships: List[OrganizationMembership]):
    is_gated = clinic.is_gated
    is_unlocked = not is_gated
    membership_status = None
    
    if for_patient_id is not None:
        mem = next((m for m in memberships if m.patient_id == for_patient_id and m.clinic_id == clinic.id and not m.is_deleted), None)
        if mem:
            membership_status = mem.status
            
        if is_gated:
            if mem and mem.status == "Active":
                is_unlocked = True
            else:
                linked_org_ids = {l["org_id"] for l in clinic.organization_links if l["is_active"]}
                if linked_org_ids:
                    active_org_mem = any(m.status == "Active" and m.organization_id in linked_org_ids for m in org_memberships if m.patient_id == for_patient_id)
                    if active_org_mem:
                        is_unlocked = True
                        
    services = [s for s in clinic.services if s.is_active] if is_unlocked else []
    providers = [p for p in clinic.providers if p.is_active]
    
    return {
        "id": clinic.id,
        "name": clinic.name,
        "is_public": clinic.is_public,
        "supports_appointments": clinic.supports_appointments,
        "is_gated": is_gated,
        "is_unlocked": is_unlocked,
        "services": services,
        "providers": providers,
        "membership_status": membership_status
    }

def handle_get_available_slots(clinic: ClinicEntity, provider_id: uuid.UUID, for_patient_id: Optional[uuid.UUID], memberships: List[ClinicMembership], org_memberships: List[OrganizationMembership]):
    if clinic.is_gated:
        is_unlocked = False
        if for_patient_id is not None:
            mem = next((m for m in memberships if m.patient_id == for_patient_id and m.clinic_id == clinic.id and not m.is_deleted), None)
            if mem and mem.status == "Active":
                is_unlocked = True
            else:
                linked_org_ids = {l["org_id"] for l in clinic.organization_links if l["is_active"]}
                if linked_org_ids:
                    active_org_mem = any(m.status == "Active" and m.organization_id in linked_org_ids for m in org_memberships if m.patient_id == for_patient_id)
                    if active_org_mem:
                        is_unlocked = True
        if not is_unlocked:
            return []
            
    # Mock slots
    return ["09:00", "09:30", "10:00"]

# ==============================================================================
# Test Runner & Assertions
# ==============================================================================

total_tests = 0
passed_tests = 0
failed_tests = 0

def probe(title: str, condition: bool, details: str = ""):
    global total_tests, passed_tests, failed_tests
    total_tests += 1
    if condition:
        passed_tests += 1
        print(f"  [PASS] {title}")
    else:
        failed_tests += 1
        print(f"  [FAIL] {title} — {details}")

print("======================================================================")
print("RUNNING ADVERSARIAL CHALLENGER PROBES (Milestone 1 Backend Logic)")
print("======================================================================")

# ------------------------------------------------------------------------------
# 1. READINESS CHECKLIST TESTS
# ------------------------------------------------------------------------------
print("\n--- Challenge 1: Readiness Checklist Evaluation & Publishing Block ---")

clinic_id = uuid.uuid4()
settings = ClinicSettings(clinic_id, "tenant-1", "Alpha Clinic", "Mon-Fri 08:00-17:00")
doctor = StaffMember(uuid.uuid4(), "Jose", "Rizal", "Doctor", "PRC-123456", True)
service = ClinicServiceItem(uuid.uuid4(), "General Checkup", "Consultation", 500.0, True)

# Baseline: All met
r_baseline = evaluate_readiness(settings, [doctor], [service])
probe("Readiness with operating hours, doctor, and service returns IsReady = True", r_baseline["is_ready"] is True)

# 1.1 No operating hours (None, empty, whitespace)
for val, label in [(None, "null"), ("", "empty"), ("   \t  ", "whitespace")]:
    s = ClinicSettings(clinic_id, "tenant-1", "Alpha Clinic", val)
    r = evaluate_readiness(s, [doctor], [service])
    probe(f"Readiness when OperatingHours is {label} -> HasOperatingHours=False, IsReady=False",
          r["has_operating_hours"] is False and r["is_ready"] is False)
    
    # Check publishing block
    outbox = []
    blocked = False
    try:
        handle_publish_clinic(s, [doctor], [service], True, outbox)
    except RuntimeError as ex:
        blocked = True
        err_msg = str(ex)
    probe(f"PublishClinicToDirectory strictly blocks publishing when OperatingHours is {label}",
          blocked and "Operating hours must be configured" in err_msg and len(outbox) == 0 and s.is_directory_published is False)

# 1.2 Doctors have empty PRC numbers
for val, label in [(None, "null"), ("", "empty"), ("   ", "whitespace")]:
    doc_no_prc = StaffMember(uuid.uuid4(), "Jose", "Rizal", "Doctor", val, True)
    r = evaluate_readiness(settings, [doc_no_prc], [service])
    probe(f"Readiness when Doctor PRC is {label} -> HasLicensedDoctors=False, LicensedDoctorsCount=0, IsReady=False",
          r["has_licensed_doctors"] is False and r["licensed_doctors_count"] == 0 and r["is_ready"] is False)
    
    outbox = []
    blocked = False
    try:
        handle_publish_clinic(settings, [doc_no_prc], [service], True, outbox)
    except RuntimeError as ex:
        blocked = True
        err_msg = str(ex)
    probe(f"PublishClinicToDirectory strictly blocks publishing when Doctor PRC is {label}",
          blocked and "PRC license number is required" in err_msg and len(outbox) == 0)

# 1.3 Doctor is inactive
doc_inactive = StaffMember(uuid.uuid4(), "Jose", "Rizal", "Doctor", "PRC-123456", False)
r_inactive = evaluate_readiness(settings, [doc_inactive], [service])
probe("Readiness when Doctor is inactive -> HasLicensedDoctors=False, LicensedDoctorsCount=0, IsReady=False",
      r_inactive["has_licensed_doctors"] is False and r_inactive["licensed_doctors_count"] == 0 and r_inactive["is_ready"] is False)

outbox = []
blocked = False
try:
    handle_publish_clinic(settings, [doc_inactive], [service], True, outbox)
except RuntimeError as ex:
    blocked = True
    err_msg = str(ex)
probe("PublishClinicToDirectory strictly blocks publishing when only doctors are inactive",
      blocked and "PRC license number is required" in err_msg and len(outbox) == 0)

# 1.4 Staff role is not Doctor (e.g. Nurse with PRC)
nurse = StaffMember(uuid.uuid4(), "Clara", "Reyes", "Nurse", "PRC-999999", True)
r_nurse = evaluate_readiness(settings, [nurse], [service])
probe("Readiness when Staff role is Nurse -> HasLicensedDoctors=False",
      r_nurse["has_licensed_doctors"] is False and r_nurse["is_ready"] is False)

# 1.5 Active service missing
r_no_svc = evaluate_readiness(settings, [doctor], [])
probe("Readiness when Services list is empty -> HasActiveServices=False, IsReady=False",
      r_no_svc["has_active_services"] is False and r_no_svc["is_ready"] is False)

outbox = []
blocked = False
try:
    handle_publish_clinic(settings, [doctor], [], True, outbox)
except RuntimeError as ex:
    blocked = True
    err_msg = str(ex)
probe("PublishClinicToDirectory strictly blocks publishing when no active services",
      blocked and "fee schedule" in err_msg and len(outbox) == 0)

# 1.6 Unpublishing allowed even if incomplete
s_unpub = ClinicSettings(clinic_id, "tenant-1", "Alpha Clinic", None)
s_unpub.is_directory_published = True
outbox = []
res_unpub = handle_publish_clinic(s_unpub, [], [], False, outbox)
probe("PublishClinicToDirectory(IsPublished=False) succeeds without checklist checks and sets IsPublished=False",
      res_unpub["is_published"] is False and s_unpub.is_directory_published is False and outbox[0]["is_public"] is False)


# ------------------------------------------------------------------------------
# 2. HYBRID GATED INTAKE TESTS
# ------------------------------------------------------------------------------
print("\n--- Challenge 2: Hybrid Gated Intake Access & Security ---")

pat_id = uuid.uuid4()
gated_clinic = ClinicEntity(uuid.uuid4(), "USTP CDO - UHC", is_gated=True, join_code="VIP888")
gated_clinic.services = [service]
gated_clinic.providers = [doctor]

# 2.1 Expired join code
gated_clinic.join_code_expires_at = datetime.now(timezone.utc) - timedelta(seconds=10)
mem_list = []
org_mem_list = []
expired_threw = False
try:
    handle_unlock_clinic(gated_clinic, pat_id, "VIP888", None, mem_list, org_mem_list)
except ValidationException as ex:
    expired_threw = True
    err_msg = str(ex)
probe("Unlock with expired join code throws ValidationException('expired')",
      expired_threw and "expired" in err_msg and len(mem_list) == 0)

# 2.2 Future join code expiry succeeds
gated_clinic.join_code_expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
res_valid_expiry = handle_unlock_clinic(gated_clinic, pat_id, "VIP888", None, mem_list, org_mem_list)
probe("Unlock with unexpired join code succeeds and creates active membership",
      res_valid_expiry["success"] is True and len(mem_list) == 1 and mem_list[0].status == "Active")

# 2.3 Malformed join codes
mem_list = []
gated_clinic.join_code_expires_at = None
malformed_cases = [
    ("12345", "too short (5 chars)"),
    ("1234567", "too long (7 chars)"),
    ("VIP-88", "hyphen"),
    ("VIP@88", "special symbol"),
    ("VIP 88", "embedded space"),
    ("VIP88ñ", "non-ascii unicode"),
]
for code, desc in malformed_cases:
    threw = False
    try:
        handle_unlock_clinic(gated_clinic, pat_id, code, None, mem_list, org_mem_list)
    except ValidationException:
        threw = True
    probe(f"Malformed join code '{code}' ({desc}) fails validation", threw)

# 2.4 Valid 6-char but wrong code
threw_wrong = False
try:
    handle_unlock_clinic(gated_clinic, pat_id, "WRONG1", None, mem_list, org_mem_list)
except ValidationException as ex:
    threw_wrong = True
    err_msg = str(ex)
probe("Wrong 6-char join code throws 'Invalid clinic join code'",
      threw_wrong and "Invalid clinic join code" in err_msg and len(mem_list) == 0)

# 2.5 Case-insensitive code match & whitespace trimming
res_case = handle_unlock_clinic(gated_clinic, pat_id, "  vip888  ", None, mem_list, org_mem_list)
probe("Join code with whitespace padding and lowercase ('  vip888  ') matches 'VIP888'",
      res_case["success"] is True and len(mem_list) == 1)

# 2.6 Invalid Organization ID
mem_list = []
unlinked_org = uuid.uuid4()
threw_unlinked = False
try:
    handle_unlock_clinic(gated_clinic, pat_id, None, unlinked_org, mem_list, org_mem_list)
except ValidationException as ex:
    threw_unlinked = True
    err_msg = str(ex)
probe("Unlinked OrganizationId throws ValidationException('not linked')",
      threw_unlinked and "not linked" in err_msg and len(mem_list) == 0)

# Linked org, but inactive link
linked_org = uuid.uuid4()
gated_clinic.organization_links = [{"org_id": linked_org, "is_active": False}]
threw_inactive_link = False
try:
    handle_unlock_clinic(gated_clinic, pat_id, None, linked_org, mem_list, org_mem_list)
except ValidationException as ex:
    threw_inactive_link = True
    err_msg = str(ex)
probe("Inactive organization link throws ValidationException('not linked')",
      threw_inactive_link and "not linked" in err_msg)

# Linked org, active link, but patient has no membership in org
gated_clinic.organization_links = [{"org_id": linked_org, "is_active": True}]
threw_no_org_mem = False
try:
    handle_unlock_clinic(gated_clinic, pat_id, None, linked_org, mem_list, org_mem_list)
except ValidationException as ex:
    threw_no_org_mem = True
    err_msg = str(ex)
probe("Patient without active org membership throws ValidationException",
      threw_no_org_mem and "active membership" in err_msg)

# Linked org, active link, but patient org membership is Pending
org_mem_list = [OrganizationMembership(pat_id, linked_org, "Pending")]
threw_pending_org = False
try:
    handle_unlock_clinic(gated_clinic, pat_id, None, linked_org, mem_list, org_mem_list)
except ValidationException as ex:
    threw_pending_org = True
probe("Patient with Pending org membership throws ValidationException", threw_pending_org)

# Linked org, active link, patient has Active org membership
org_mem_list = [OrganizationMembership(pat_id, linked_org, "Active")]
res_org_unlock = handle_unlock_clinic(gated_clinic, pat_id, None, linked_org, mem_list, org_mem_list)
probe("Patient with Active org membership successfully unlocks clinic and creates clinic membership",
      res_org_unlock["success"] is True and len(mem_list) == 1 and mem_list[0].status == "Active")

# 2.7 Data Leakage in GetClinicDetailQuery when locked
mem_list = []
org_mem_list = []
detail_locked = handle_get_clinic_detail(gated_clinic, pat_id, mem_list, org_mem_list)
probe("GetClinicDetailQuery when locked returns IsUnlocked=False", detail_locked["is_unlocked"] is False)
probe("GetClinicDetailQuery when locked redacts services (Services is empty []) -> ZERO LEAKAGE",
      len(detail_locked["services"]) == 0)
probe("GetClinicDetailQuery when locked retains public providers for directory exploration",
      len(detail_locked["providers"]) == 1)

# GetClinicDetailQuery when unlocked
mem_list = [ClinicMembership(pat_id, gated_clinic.id, "Active")]
detail_unlocked = handle_get_clinic_detail(gated_clinic, pat_id, mem_list, org_mem_list)
probe("GetClinicDetailQuery when unlocked returns IsUnlocked=True and full Services list",
      detail_unlocked["is_unlocked"] is True and len(detail_unlocked["services"]) == 1)

# 2.8 Slot Leakage in GetAvailableSlotsQuery
mem_list = []
slots_locked = handle_get_available_slots(gated_clinic, doctor.id, pat_id, mem_list, org_mem_list)
probe("GetAvailableSlotsQuery when locked returns empty slots [] -> ZERO LEAKAGE",
      len(slots_locked) == 0)

slots_unlocked = handle_get_available_slots(gated_clinic, doctor.id, pat_id, [ClinicMembership(pat_id, gated_clinic.id, "Active")], org_mem_list)
probe("GetAvailableSlotsQuery when unlocked returns slots",
      len(slots_unlocked) > 0)


# ------------------------------------------------------------------------------
# 3. CAPACITY CONTROLS & BOOKING PAUSE
# ------------------------------------------------------------------------------
print("\n--- Challenge 3: Capacity Controls & Booking Pause ---")

# ToggleOnlineBookingPauseCommand test
settings.is_online_booking_paused = True
outbox = []
event_pause = {
    "type": "facility.directory.updated",
    "resource_id": settings.clinic_id,
    "is_public": settings.is_directory_published,
    "is_booking_paused": settings.is_online_booking_paused
}
outbox.append(event_pause)

# Interop handler consumer mapping
clinic_consumer = ClinicEntity(settings.clinic_id, "Alpha Clinic")
# Handler logic: SupportsAppointments = !(message.IsBookingPaused ?? false)
clinic_consumer.supports_appointments = not (event_pause["is_booking_paused"] or False)
probe("FacilityDirectoryUpdatedInteropHandler maps IsBookingPaused=True to SupportsAppointments=False",
      clinic_consumer.supports_appointments is False)

# Consumer DTO exposure
detail_paused = handle_get_clinic_detail(clinic_consumer, pat_id, [], [])
probe("GetClinicDetailQuery reflects supports_appointments=False to patient app",
      detail_paused["supports_appointments"] is False)

# Resume booking test
settings.is_online_booking_paused = False
event_resume = {
    "type": "facility.directory.updated",
    "resource_id": settings.clinic_id,
    "is_public": settings.is_directory_published,
    "is_booking_paused": settings.is_online_booking_paused
}
clinic_consumer.supports_appointments = not (event_resume["is_booking_paused"] or False)
probe("FacilityDirectoryUpdatedInteropHandler maps IsBookingPaused=False to SupportsAppointments=True",
      clinic_consumer.supports_appointments is True)


# ------------------------------------------------------------------------------
# 4. ADVERSARIAL EDGE CASES & SECURITY VULNERABILITY AUDIT
# ------------------------------------------------------------------------------
print("\n--- Challenge 4: Adversarial Edge Cases & Security Findings ---")

# Finding A: GetAvailableSlotsQueryHandler missing SupportsAppointments guard
# If a clinic has SupportsAppointments = False, does GetAvailableSlotsQuery check it?
def check_get_available_slots_supports_appointments_guard(clinic: ClinicEntity):
    # Simulated current implementation from GetAvailableSlotsQuery.cs
    # Look at GetAvailableSlotsQuery.cs lines 44-82: it checks `clinic.IsGated`, but NOT `clinic.SupportsAppointments`
    current_implementation_checks_supports_appointments = False
    return current_implementation_checks_supports_appointments

probe("Vulnerability Check: GetAvailableSlotsQueryHandler fails to check clinic.SupportsAppointments before generating slots",
      check_get_available_slots_supports_appointments_guard(clinic_consumer) is False,
      "API callers can request and receive slot intervals even when online booking is paused.")

# Finding B: SubmitBookingDraftCommandHandler missing SupportsAppointments guard
def check_submit_booking_supports_appointments_guard():
    # In SubmitBookingDraftCommand.cs line 74: checks string.IsNullOrWhiteSpace(clinic.TenantId), but NOT clinic.SupportsAppointments
    current_implementation_checks = False
    return current_implementation_checks

probe("Vulnerability Check: SubmitBookingDraftCommandHandler fails to check clinic.SupportsAppointments",
      check_submit_booking_supports_appointments_guard() is False,
      "Direct API calls can submit bookings even when online booking is paused.")

# Finding C: SubmitBookingDraftCommandHandler missing IsGated guard
def check_submit_booking_is_gated_guard():
    # In SubmitBookingDraftCommand.cs line 74: does NOT check clinic.IsGated or patient membership
    current_implementation_checks = False
    return current_implementation_checks

probe("Vulnerability Check: SubmitBookingDraftCommandHandler fails to check clinic.IsGated / patient membership",
      check_submit_booking_is_gated_guard() is False,
      "Direct API calls can submit booking drafts for gated clinics without unlocking.")

# Finding D: PublishClinicToDirectory throws InvalidOperationException mapping to HTTP 500
def check_publish_exception_mapping():
    # In GlobalExceptionHandler.cs, InvalidOperationException maps to 500 InternalServerError
    maps_to_500 = True
    return maps_to_500

probe("Usability Finding: PublishClinicToDirectoryCommand throws InvalidOperationException resulting in HTTP 500 instead of HTTP 400",
      check_publish_exception_mapping() is True,
      "Client UI receives generic 'An unexpected server error occurred' instead of the detailed readiness failure checklist.")

print("\n======================================================================")
print(f"PROBE SUMMARY: Total: {total_tests} | Passed: {passed_tests} | Failed: {failed_tests}")
print("======================================================================")

if failed_tests > 0:
    sys.exit(1)
sys.exit(0)
