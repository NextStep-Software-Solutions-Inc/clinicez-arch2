import { useAuth } from "@clerk/expo"

export const usePatientId = () => {
    // In a real app, this would come from auth context or similar
    return useAuth().userId;
}