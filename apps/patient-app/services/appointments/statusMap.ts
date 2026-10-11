import type { AppointmentWireStatus } from '../api/wireEnums';
import type { AppointmentStatus } from './types';

/**
 * patient-api sends the C# member name; the local appointment model (SQLite rows and every
 * screen) uses its own snake_case vocabulary. This is the single, exact translation point.
 */
const LOCAL_STATUS_BY_WIRE: Record<AppointmentWireStatus, AppointmentStatus> = {
    Pending: 'pending',
    Confirmed: 'confirmed',
    Cancelled: 'canceled',
    Completed: 'completed',
    NoShow: 'no_show',
    ActionRequired: 'action_required',
};

export function localAppointmentStatus(status: AppointmentWireStatus): AppointmentStatus {
    return LOCAL_STATUS_BY_WIRE[status];
}
