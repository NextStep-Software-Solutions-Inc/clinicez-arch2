import React from 'react';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import { useState } from 'react';
import RoundedButton from '@/components/RoundedButton';
import { TextInput } from 'react-native';

export function SignInScreen({ onSignIn }: { onSignIn: () => void }) {
    const { signIn, setActive } = useSignIn();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const handleSignIn = async () => {
        if (!signIn) return;
        try {
            const res = await signIn.create({ identifier: email, password });
            if (res.status === 'complete') {
                await setActive({ session: res.createdSessionId });
                onSignIn();
            } else {
                setError('Sign in incomplete.');
            }
        } catch (err) {
            setError('Sign in failed.');
        }
    };



    return (
        <ThemedView className="flex-1 items-center justify-center bg-white dark:bg-zinc-900">
            <ThemedText className="text-lg font-bold mb-4">Sign In</ThemedText>
            <ThemedView className="mb-2 w-10/12">
                <ThemedText>Email</ThemedText>
                <ThemedView style={{ borderWidth: 1, borderRadius: 6, marginBottom: 8 }}>
                    <TextInput
                        style={{ padding: 8, width: '100%' }}
                        value={email}
                        onChangeText={text => setEmail(text)}
                        placeholder="Email"
                    />
                </ThemedView>
                <ThemedText>Password</ThemedText>
                <ThemedView style={{ borderWidth: 1, borderRadius: 6, marginBottom: 8 }}>
                    <TextInput
                        style={{ padding: 8, width: '100%' }}
                        value={password}
                        onChangeText={text => setPassword(text)}
                        placeholder="Password"
                        secureTextEntry
                    />
                </ThemedView>
            </ThemedView>
            {error ? <ThemedText className="text-red-500 mb-2">{error}</ThemedText> : null}
            <RoundedButton onPress={handleSignIn} >
                <ThemedText className="text-white font-semibold text-lg tracking-wide">Sign In</ThemedText>
            </RoundedButton>
        </ThemedView>
    );
}

export function SignUpScreen({ onSignUp }: { onSignUp: () => void }) {
    const { signUp } = useSignUp();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const handleSignUp = async () => {
        if (!signUp) return;
        try {
            await signUp.create({ emailAddress: email, password });
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
            // You may want to handle verification here
            onSignUp();
        } catch (err) {
            setError('Sign up failed.');
        }
    };
    return (
        <ThemedView className="flex-1 items-center justify-center bg-white dark:bg-zinc-900">
            <ThemedText className="text-lg font-bold mb-4">Sign Up</ThemedText>
            <ThemedView className="mb-2 w-10/12">
                <ThemedText>Email</ThemedText>
                <ThemedView style={{ borderWidth: 1, borderRadius: 6, marginBottom: 8 }}>
                    <TextInput
                        style={{ padding: 8, width: '100%' }}
                        value={email}
                        onChangeText={text => setEmail(text)}
                        placeholder="Email"
                    />
                </ThemedView>
                <ThemedText>Password</ThemedText>
                <ThemedView style={{ borderWidth: 1, borderRadius: 6, marginBottom: 8 }}>
                    <TextInput
                        style={{ padding: 8, width: '100%' }}
                        value={password}
                        onChangeText={text => setPassword(text)}
                        placeholder="Password"
                        secureTextEntry
                    />
                </ThemedView>
            </ThemedView>
            {error ? <ThemedText className="text-red-500 mb-2">{error}</ThemedText> : null}
            <RoundedButton onPress={handleSignUp} >
                <ThemedText className="text-white font-semibold text-lg tracking-wide">Sign Up</ThemedText>
            </RoundedButton>
        </ThemedView>
    );
}
