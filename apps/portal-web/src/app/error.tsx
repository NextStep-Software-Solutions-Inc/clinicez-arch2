"use client";

import ErrorDisplay from "@/components/ErrorDisplay";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: ErrorProps) {
  return (
    <ErrorDisplay 
      error={error} 
      reset={reset} 
      title="Something went wrong" 
    />
  );
}
