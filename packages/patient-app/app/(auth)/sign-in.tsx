import { useSignIn } from '@clerk/clerk-expo'
import { Link, useRouter } from 'expo-router'
import { Text, TextInput, TouchableOpacity, View } from 'react-native'
import React from 'react'
import { ThemedView } from '@/components/ThemedView'

export default function Page() {
    const { signIn, setActive, isLoaded } = useSignIn()
    const router = useRouter()

    const [emailAddress, setEmailAddress] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [errorMsg, setErrorMsg] = React.useState('')
    const [showPassword, setShowPassword] = React.useState(false)

    // Handle the submission of the sign-in form
    const onSignInPress = async () => {
        if (!isLoaded) return
        setErrorMsg('');
        try {
            const signInAttempt = await signIn.create({
                identifier: emailAddress,
                password,
            })
            if (signInAttempt.status === 'complete') {
                await setActive({ session: signInAttempt.createdSessionId })
                router.replace('/join-clinic')
            } else {
                setErrorMsg('Sign in incomplete. Please check your credentials or complete additional steps.');
                console.error(JSON.stringify(signInAttempt, null, 2))
            }
        } catch (err) {
            let msg = 'Sign in failed. Please check your credentials.';
            if (
                err &&
                typeof err === 'object' &&
                'errors' in err &&
                Array.isArray((err as any).errors) &&
                (err as any).errors.length > 0
            ) {
                msg = (err as any).errors[0].message;
            }
            setErrorMsg(msg);
            console.error(JSON.stringify(err, null, 2))
        }
    }

    return (
        <ThemedView className="flex-1 items-center justify-center px-4">
            <ThemedView className="w-full max-w-xl rounded-3xl shadow-2xl p-12">
                <ThemedView className="items-center mb-6">
                    <ThemedView className="rounded-full p-6 mb-4 shadow-xl">
                        {/* Replace with your logo image if available */}
                        <Text className="text-5xl font-extrabold text-slate-800 dark:text-white">🩺</Text>
                    </ThemedView>
                    <Text className="text-4xl font-extrabold text-center text-slate-800 dark:text-white mb-2 tracking-tight">Sign in</Text>
                    <Text className="text-lg text-center text-slate-500 dark:text-slate-300 mb-4">Please sign in to continue</Text>
                </ThemedView>
                {errorMsg ? (
                    <ThemedView className="mb-4">
                        <Text className="text-center text-red-600 dark:text-red-400 font-medium">{errorMsg}</Text>
                    </ThemedView>
                ) : null}
                <Text className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">Email address</Text>
                <TextInput
                    autoCapitalize="none"
                    value={emailAddress}
                    placeholder="john@doe.com"
                    placeholderTextColor="#b3b3b3"
                    onChangeText={setEmailAddress}
                    className="mb-6 px-6 py-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-lg text-slate-800 dark:text-white shadow-md focus:border-indigo-500"
                />
                <Text className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">Password</Text>
                <ThemedView className="relative mb-8">
                    <TextInput
                        value={password}
                        placeholder="••••••••••"
                        placeholderTextColor="#b3b3b3"
                        secureTextEntry={!showPassword}
                        onChangeText={setPassword}
                        className="px-6 py-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-lg text-slate-800 dark:text-white shadow-md focus:border-indigo-500 pr-16"
                    />
                    <TouchableOpacity
                        onPress={() => setShowPassword((prev) => !prev)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-2"
                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                        <Text className="text-indigo-600 dark:text-indigo-400 font-semibold text-base">
                            {showPassword ? 'Hide' : 'Show'}
                        </Text>
                    </TouchableOpacity>
                </ThemedView>
                <TouchableOpacity
                    onPress={onSignInPress}
                    className="bg-slate-900 dark:bg-slate-700 rounded-2xl py-4 mb-6 shadow-xl active:opacity-80"
                >
                    <Text className="text-center text-white text-2xl font-bold">Sign in</Text>
                </TouchableOpacity>
                <TouchableOpacity className="mb-6" onPress={() => {/* TODO: handle forgot password */ }}>
                    <Text className="text-center text-indigo-600 dark:text-indigo-400 font-semibold underline text-lg">Forgot password?</Text>
                </TouchableOpacity>
                <ThemedView className="flex-row justify-center items-center mt-4">
                    <Text className="text-slate-600 dark:text-slate-300 text-lg">Don't have an account?</Text>
                    <Link href="/sign-up" className="ml-3">
                        <Text className="text-indigo-600 dark:text-indigo-400 font-bold text-lg">Sign up</Text>
                    </Link>
                </ThemedView>
            </ThemedView>
        </ThemedView>
    )
}