import type { NotificationCategory, NotificationType } from '../../db/schema/notifications';
import type { NotificationWireCategory, NotificationWireType } from '../api/wireEnums';

/**
 * Strict boundary tables between patient-api's PascalCase notification enums and the
 * app's local SQLite vocabulary (snake_case type, lowercase category). Typed as Records so
 * adding a wire value without a local mapping fails the build.
 */

const LOCAL_TYPE_BY_WIRE: Record<NotificationWireType, NotificationType> = {
    AppointmentReminder: 'appointment_reminder',
    ClinicAnnouncement: 'clinic_announcement',
    MedicationReminder: 'medication_reminder',
    LabResult: 'lab_result',
    NewMessage: 'new_message',
    System: 'system',
    SyncConflict: 'system',
};

const LOCAL_CATEGORY_BY_WIRE: Record<NotificationWireCategory, NotificationCategory> = {
    Appointments: 'appointments',
    Reminders: 'reminders',
    Clinic: 'clinic',
    Messages: 'messages',
    System: 'system',
};

const WIRE_CATEGORY_BY_LOCAL: Record<NotificationCategory, NotificationWireCategory> = {
    appointments: 'Appointments',
    reminders: 'Reminders',
    clinic: 'Clinic',
    messages: 'Messages',
    system: 'System',
};

export function localNotificationType(wire: NotificationWireType): NotificationType {
    return LOCAL_TYPE_BY_WIRE[wire];
}

export function localNotificationCategory(wire: NotificationWireCategory): NotificationCategory {
    return LOCAL_CATEGORY_BY_WIRE[wire];
}

export function wireNotificationCategory(local: NotificationCategory): NotificationWireCategory {
    return WIRE_CATEGORY_BY_LOCAL[local];
}
