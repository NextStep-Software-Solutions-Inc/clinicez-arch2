import { useState, useEffect, useCallback, useRef } from 'react';
import {
  clinicService,
  DoctorAvailabilityData,
  AvailableSlotItem,
} from '../../services/clinicService';

export interface UseDoctorAvailabilityOptions {
  doctorId?: string;
  date?: string; // YYYY-MM-DD
  interval?: number;
  enabled?: boolean;
  pollIntervalMs?: number;
}

export interface UseDoctorAvailabilityReturn {
  availability: DoctorAvailabilityData | null;
  slots: AvailableSlotItem[];
  isOnDuty: boolean;
  nonAvailabilityReason?: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDoctorAvailability({
  doctorId,
  date,
  interval,
  enabled = true,
  pollIntervalMs = 30000,
}: UseDoctorAvailabilityOptions): UseDoctorAvailabilityReturn {
  const [availability, setAvailability] = useState<DoctorAvailabilityData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveRef = useRef(false);

  const fetchSlots = useCallback(async () => {
    if (!doctorId || !date || !enabled) {
      setAvailability(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      fetchActiveRef.current = true;
      const [data, err] = await clinicService.getDoctorAvailableSlots(doctorId, date, interval);
      if (fetchActiveRef.current) {
        if (err) {
          setError(err.message || 'Failed to load doctor availability.');
        } else {
          setAvailability(data);
        }
      }
    } catch (err: any) {
      if (fetchActiveRef.current) {
        const msg = err?.message || 'Failed to load doctor availability.';
        setError(msg);
      }
    } finally {
      if (fetchActiveRef.current) {
        setLoading(false);
      }
    }
  }, [doctorId, date, interval, enabled]);

  useEffect(() => {
    fetchActiveRef.current = true;
    fetchSlots();

    let timer: any = null;
    if (enabled && doctorId && date && pollIntervalMs > 0) {
      timer = setInterval(() => {
        fetchSlots();
      }, pollIntervalMs);
    }

    return () => {
      fetchActiveRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, [fetchSlots, enabled, doctorId, date, pollIntervalMs]);

  return {
    availability,
    slots: availability?.slots || [],
    isOnDuty: availability?.isOnDuty ?? true,
    nonAvailabilityReason: availability?.nonAvailabilityReason,
    loading,
    error,
    refresh: fetchSlots,
  };
}
