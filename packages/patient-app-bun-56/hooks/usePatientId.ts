import { useAuth } from "@clerk/expo"

export const usePatientId = (): string => {
    const { userId } = useAuth();
    if (!userId) throw new Error('usePatientId called outside authenticated context');
    return userId;
}
