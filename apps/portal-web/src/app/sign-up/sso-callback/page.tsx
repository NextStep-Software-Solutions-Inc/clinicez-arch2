import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SignUpSSOCallbackPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="p-8 rounded-3xl border border-border bg-card/70 backdrop-blur-2xl text-center space-y-4 shadow-xl">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-medium text-muted-foreground">
          Completing registration with Clinic EZ...
        </p>
      </div>
      <AuthenticateWithRedirectCallback
        signUpForceRedirectUrl="/sync-auth"
        signInForceRedirectUrl="/sync-auth"
        secondFactorUrl="/sign-in"
        continueSignUpUrl="/sign-up"
      />
    </div>
  );
}
