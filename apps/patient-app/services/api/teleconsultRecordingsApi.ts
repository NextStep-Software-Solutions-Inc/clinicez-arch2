import { api, ApiError } from './apiClient';

export interface TeleconsultRecordingDto {
  sessionId: string;
  appointmentId: string;
  status: 'Recording' | 'Processing' | 'Ready' | 'Expired';
  durationSeconds: number;
  recordedAt: string;
  streamUrl: string;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface PlaybackTicketResponse {
  ticket: string;
  expiresAt: string;
  streamUrl: string;
  sessionId?: string;
  durationSeconds?: number;
}

export const teleconsultRecordingsApi = {
  /**
   * Retrieves a signed 15-minute HMAC playback ticket for a completed teleconsultation recording.
   * Returns null if no recording is available for this appointment (HTTP 404).
   * Throws ApiError for unauthorized access (401/403) or server errors (500).
   */
  async getPlaybackTicket(
    getToken: () => Promise<string | null>,
    patientId: string,
    appointmentId: string,
  ): Promise<PlaybackTicketResponse | null> {
    try {
      return await api.get<PlaybackTicketResponse>(
        getToken,
        `/patients/${patientId}/appointments/${appointmentId}/recording-ticket`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },

  /**
   * Fetches metadata for an appointment's recorded teleconsultation.
   * Returns null if no recording metadata exists (HTTP 404).
   * Throws on network or unexpected server errors.
   */
  async getRecordingMetadata(
    getToken: () => Promise<string | null>,
    patientId: string,
    appointmentId: string,
  ): Promise<TeleconsultRecordingDto | null> {
    try {
      return await api.get<TeleconsultRecordingDto>(
        getToken,
        `/patients/${patientId}/appointments/${appointmentId}/recording`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },
};
