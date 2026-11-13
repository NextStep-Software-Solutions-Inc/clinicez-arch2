import { api, ApiError } from './apiClient';

export interface PatientTeleconsultCallDto {
  callId: string;
  status: string;
  roomName: string | null;
  relayUrl: string | null;
  joinToken: string | null;
}

export const teleconsultApi = {
  /**
   * Fetches teleconsultation call status, room name, relay URL, and LiveKit join token.
   * Returns null if call session is not found (HTTP 404).
   * Throws on unexpected network or server errors.
   */
  async getCall(
    getToken: () => Promise<string | null>,
    callId: string,
  ): Promise<PatientTeleconsultCallDto | null> {
    try {
      return await api.get<PatientTeleconsultCallDto>(
        getToken,
        `/patient/teleconsult/calls/${callId}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },
};
