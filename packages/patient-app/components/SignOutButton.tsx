import { useClerk } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import { Text, TouchableOpacity } from 'react-native'
import { ThemedText } from './ThemedText'
import { Colors } from '@/constants/Colors'

export const SignOutButton = () => {
    // Use `useClerk()` to access the `signOut()` function
    const { signOut } = useClerk()
    const router = useRouter()

    const handleSignOut = async () => {
        try {
            await signOut()
            // Redirect to your desired page
            router.replace('/(auth)/sign-in')
        } catch (err) {
            // See https://clerk.com/docs/custom-flows/error-handling
            // for more info on error handling
            console.error(JSON.stringify(err, null, 2))
        }
    }

    return (
        <TouchableOpacity
            style={{
                backgroundColor: '#fff',
                borderRadius: 8,
                paddingVertical: 12,
                paddingHorizontal: 32,
                marginTop: 12,
                borderWidth: 1,
                borderColor: Colors.light.tint,
                shadowColor: Colors.light.tint,
                shadowOpacity: 0.08,
                shadowRadius: 4,
                elevation: 1,
            }}
            onPress={handleSignOut}
        >
            <ThemedText style={{ color: Colors.light.tint, fontWeight: 'bold', fontSize: 16 }}>
                Log Out
            </ThemedText>
        </TouchableOpacity>
    )
}