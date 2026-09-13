import { useAuth } from 'contexts/AuthContext';

export const usePatientId = (): string => {
    const { internalPatientId } = useAuth();
    if (!internalPatientId) {
        throw new Error('usePatientId called outside authenticated context or before verification');
    }
    return internalPatientId;
};
