import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden p-4">
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-[50%] h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-0 w-[50%] h-[50%] bg-gradient-to-t from-primary/5 to-transparent pointer-events-none -z-10" />
      
      <SignUp 
        path="/sign-up" 
        routing="path" 
        signInUrl="/sign-in"
        fallbackRedirectUrl="/sync-auth"
      />
    </div>
  );
}
