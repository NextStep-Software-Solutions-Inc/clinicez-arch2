import * as React from 'react'
import { Text, TextInput, TouchableOpacity } from 'react-native'
import { useSignUp, useSSO } from '@clerk/clerk-expo'
import { Link, useRouter } from 'expo-router'
import { ThemedView } from '@/components/ThemedView'
import { ThemedText } from '@/components/ThemedText'

export default function SignUpScreen() {
    const { isLoaded, signUp, setActive } = useSignUp()
    const { startSSOFlow } = useSSO()

    const [emailAddress, setEmailAddress] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [pendingVerification, setPendingVerification] = React.useState(false)
    const [code, setCode] = React.useState('')
    const [errorMsg, setErrorMsg] = React.useState('')
    const [showPassword, setShowPassword] = React.useState(false)

    const router = useRouter()
    // Social sign-in handlers
    const onGoogleSignUp = async () => {
        if (!isLoaded) return;
        handlePress('oauth_google');
        setErrorMsg('');
        try {
            await signUp.create({
                strategy: 'oauth_google', redirectUrl: '/(tabs)'
            });
        } catch (err) {
            let msg = 'Google sign up failed.';
            const errorObj = err as any;
            if (errorObj?.errors && Array.isArray(errorObj.errors) && errorObj.errors.length > 0) {
                msg = errorObj.errors[0].message;
            } else if (errorObj?.data?.errors && Array.isArray(errorObj.data.errors) && errorObj.data.errors.length > 0) {
                msg = errorObj.data.errors[0].message;
            }
            setErrorMsg(msg);
        }
    };

    const onGitHubSignUp = async () => {
        if (!isLoaded) return;
        handlePress('oauth_github');
        setErrorMsg('');
        try {
            await signUp.create({ strategy: 'oauth_github' });
        } catch (err) {
            let msg = 'GitHub sign up failed.';
            const errorObj = err as any;
            if (errorObj?.errors && Array.isArray(errorObj.errors) && errorObj.errors.length > 0) {
                msg = errorObj.errors[0].message;
            } else if (errorObj?.data?.errors && Array.isArray(errorObj.data.errors) && errorObj.data.errors.length > 0) {
                msg = errorObj.data.errors[0].message;
            }
            setErrorMsg(msg);
        }
    };

    // Handle submission of sign-up form
    const onSignUpPress = async () => {
        if (!isLoaded) return

        // Start sign-up process using email and password provided
        try {
            setErrorMsg('');
            await signUp.create({
                emailAddress,
                password,
                username: emailAddress
                    .split('@')[0]
                    .replace(/[^a-zA-Z0-9]/g, '_'),
            })
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
            setPendingVerification(true)
        } catch (err) {
            let msg = 'Sign up failed. Please check your details.';
            const errorObj = err as any;
            if (errorObj?.errors && Array.isArray(errorObj.errors) && errorObj.errors.length > 0) {
                msg = errorObj.errors[0].message;
            } else if (errorObj?.data?.errors && Array.isArray(errorObj.data.errors) && errorObj.data.errors.length > 0) {
                msg = errorObj.data.errors[0].message;
            }
            setErrorMsg(msg);
        }
    }

    const handlePress = (strategy: "oauth_google" | "oauth_github") => {
        startSSOFlow({
            strategy,
        }).then(({ createdSessionId, setActive }) => {
            setActive?.({ session: createdSessionId })
            router.replace('/(tabs)')
        })
    }
    // Handle submission of verification form
    const onVerifyPress = async () => {
        if (!isLoaded) return

        try {
            setErrorMsg('');
            const signUpAttempt = await signUp.attemptEmailAddressVerification({ code });

            if (signUpAttempt.status === 'complete') {
                await setActive({ session: signUpAttempt.createdSessionId })
                router.replace('/(tabs)')
            } else {
                setErrorMsg('Verification incomplete. Please check your code or try again.');
            }
        } catch (err) {
            let msg = 'Verification failed. Please check your code.';
            const errorObj = err as any;
            if (errorObj?.errors && Array.isArray(errorObj.errors) && errorObj.errors.length > 0) {
                msg = errorObj.errors[0].longMessage || errorObj.errors[0].message;
            } else if (errorObj?.data?.errors && Array.isArray(errorObj.data.errors) && errorObj.data.errors.length > 0) {
                msg = errorObj.data.errors[0].longMessage || errorObj.data.errors[0].message;
            }
            setErrorMsg(msg);
        }
    }

    if (pendingVerification) {
        return (
            <ThemedView className="flex-1 items-center justify-center px-4">
                <ThemedView className="w-full max-w-xl rounded-3xl shadow-2xl p-12">
                    <ThemedView className="items-center mb-8">
                        <ThemedView className="rounded-full p-6 mb-4 shadow-xl">
                            <ThemedText className="text-5xl font-extrabold text-slate-800 dark:text-white">🩺</ThemedText>
                        </ThemedView>
                        <ThemedText className="text-4xl font-extrabold text-center text-slate-800 dark:text-white mb-2 tracking-tight">Verify your email</ThemedText>
                        <ThemedText className="text-lg text-center text-slate-500 dark:text-slate-300 mb-4">Enter the code sent to your email</ThemedText>
                    </ThemedView>
                    {errorMsg ? (
                        <ThemedView className="mb-6">
                            <ThemedText className="text-center text-red-600 dark:text-red-400 font-medium text-lg">{errorMsg}</ThemedText>
                        </ThemedView>
                    ) : null}
                    <TextInput
                        value={code}
                        placeholder="Verification code"
                        placeholderTextColor="#b3b3b3"
                        onChangeText={setCode}
                        className="mb-8 px-6 py-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-lg text-slate-800 dark:text-white shadow-md focus:border-indigo-500"
                    />
                    <TouchableOpacity onPress={onVerifyPress} className="bg-slate-900 dark:bg-slate-700 rounded-2xl py-4 mb-6 shadow-xl active:opacity-80">
                        <ThemedText className="text-center text-white text-2xl font-bold">Verify</ThemedText>
                    </TouchableOpacity>
                </ThemedView>
            </ThemedView>
        )
    }

    return (
        <ThemedView className="flex-1 h-full min-h-screen items-center justify-center px-4">
            <ThemedView className="w-full max-w-xl rounded-3xl shadow-2xl p-12 ">
                <ThemedView className="items-center mb-8">
                    <ThemedView className="rounded-full p-6 mb-4 shadow-xl">
                        <ThemedText className="text-5xl font-extrabold text-slate-800 dark:text-white">🩺</ThemedText>
                    </ThemedView>
                    <ThemedText className="text-4xl font-extrabold text-center text-slate-800 dark:text-white mb-2 tracking-tight">Create an account</ThemedText>
                    <ThemedText className="text-lg text-center text-slate-500 dark:text-slate-300 mb-4">Please sign in to continue</ThemedText>
                </ThemedView>
                <ThemedView className="flex-row justify-center items-center mb-8 gap-4">
                    <TouchableOpacity onPress={onGoogleSignUp} className="flex-1 flex-row items-center justify-center bg-white rounded-xl py-4 shadow-xl border border-slate-200">
                        <ThemedText className="mr-3 text-2xl">🌐</ThemedText>
                        <ThemedText className="font-bold text-lg">Google</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onGitHubSignUp} className="flex-1 flex-row items-center justify-center bg-white rounded-xl py-4 shadow-xl border border-slate-200">
                        <ThemedText className="mr-3 text-2xl">🐙</ThemedText>
                        <ThemedText className="font-bold text-lg">GitHub</ThemedText>
                    </TouchableOpacity>
                </ThemedView>
                <ThemedView className="flex-row items-center mb-8">
                    <ThemedView className="flex-1 h-px bg-slate-200 dark:bg-zinc-700" />
                    <ThemedText className="mx-4 text-slate-400 dark:text-zinc-500 text-lg">or</ThemedText>
                    <ThemedView className="flex-1 h-px bg-slate-200 dark:bg-zinc-700" />
                </ThemedView>
                {errorMsg ? (
                    <ThemedView className="mb-4">
                        <ThemedText className="text-center text-red-600 dark:text-red-400 font-medium">{errorMsg}</ThemedText>
                    </ThemedView>
                ) : null}
                <ThemedText className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">Email address</ThemedText>
                <TextInput
                    autoCapitalize="none"
                    value={emailAddress}
                    placeholder="john@doe.com"
                    placeholderTextColor="#b3b3b3"
                    onChangeText={setEmailAddress}
                    className="mb-6 px-6 py-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-lg text-slate-800 dark:text-white shadow-md focus:border-indigo-500"
                />
                <ThemedText className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">Password</ThemedText>
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
                        <ThemedText className="text-indigo-600 dark:text-indigo-400 font-bold text-base">
                            {showPassword ? 'Hide' : 'Show'}
                        </ThemedText>
                    </TouchableOpacity>
                </ThemedView>
                <TouchableOpacity onPress={onSignUpPress} className="bg-slate-900 dark:bg-slate-700 rounded-2xl py-4 mb-6 shadow-xl active:opacity-80">
                    <ThemedText className="text-center text-white text-2xl font-bold">Create an account</ThemedText>
                </TouchableOpacity>
                <ThemedView className="flex-row justify-center items-center mt-4">
                    <ThemedText className="text-slate-600 dark:text-slate-300 text-lg">Already have an account?</ThemedText>
                    <Link href="/sign-in" className="ml-3">
                        <ThemedText className="text-indigo-600 dark:text-indigo-400 font-bold text-lg">Sign in</ThemedText>
                    </Link>
                </ThemedView>
            </ThemedView>
        </ThemedView>
    )
}