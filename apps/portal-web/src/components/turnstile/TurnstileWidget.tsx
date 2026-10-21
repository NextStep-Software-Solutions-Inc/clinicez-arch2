"use client";

import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useId,
} from "react";
import { CLOUDFLARE_TEST_SITE_KEY_PASS } from "@/lib/turnstile";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: (error?: any) => void;
          "expired-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
          size?: "normal" | "compact" | "flexible";
          action?: string;
          cData?: string;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
    onTurnstileLoaded?: () => void;
  }
}

export interface TurnstileWidgetHandle {
  reset: () => void;
  getResponse: () => string | undefined;
}

export interface TurnstileWidgetProps {
  siteKey?: string;
  action?: string;
  theme?: "auto" | "light" | "dark";
  size?: "normal" | "compact" | "flexible";
  onSuccess: (token: string) => void;
  onError?: (error?: any) => void;
  onExpire?: () => void;
  className?: string;
}

export const TurnstileWidget = forwardRef<
  TurnstileWidgetHandle,
  TurnstileWidgetProps
>(
  (
    {
      siteKey,
      action,
      theme = "auto",
      size = "normal",
      onSuccess,
      onError,
      onExpire,
      className = "",
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const uniqueId = useId();
    const effectiveSiteKey =
      siteKey ||
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
      CLOUDFLARE_TEST_SITE_KEY_PASS;

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.reset(widgetIdRef.current);
          } catch (e) {
            console.warn("[Turnstile] Error resetting widget:", e);
          }
        }
      },
      getResponse: () => {
        if (widgetIdRef.current && window.turnstile) {
          return window.turnstile.getResponse(widgetIdRef.current);
        }
        return undefined;
      },
    }));

    useEffect(() => {
      let isMounted = true;

      // In testing environments (jsdom / happy-dom), automatically issue dummy test token
      if (typeof window !== "undefined" && !window.turnstile && process.env.NODE_ENV === "test") {
        onSuccess("XXXX.DUMMY.PASS.TEST");
        return;
      }

      const renderWidget = () => {
        if (!containerRef.current || !window.turnstile || widgetIdRef.current) {
          return;
        }

        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: effectiveSiteKey,
            action,
            theme,
            size,
            callback: (token: string) => {
              if (isMounted) onSuccess(token);
            },
            "error-callback": (err: any) => {
              if (isMounted && onError) onError(err);
            },
            "expired-callback": () => {
              if (isMounted && onExpire) onExpire();
            },
          });
        } catch (err) {
          console.error("[Turnstile] Render error:", err);
          if (onError) onError(err);
        }
      };

      if (window.turnstile) {
        renderWidget();
      } else {
        // Load Turnstile script dynamically
        const existingScript = document.getElementById("cloudflare-turnstile-script");
        if (!existingScript) {
          const script = document.createElement("script");
          script.id = "cloudflare-turnstile-script";
          script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
          script.async = true;
          script.defer = true;
          script.onload = () => {
            if (isMounted) renderWidget();
          };
          script.onerror = (err) => {
            console.error("[Turnstile] Failed to load turnstile script:", err);
            if (isMounted && onError) onError(err);
          };
          document.head.appendChild(script);
        } else {
          existingScript.addEventListener("load", renderWidget);
        }
      }

      return () => {
        isMounted = false;
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // Ignore removal errors on component tear-down
          }
          widgetIdRef.current = null;
        }
      };
    }, [effectiveSiteKey, action, theme, size, onSuccess, onError, onExpire]);

    return (
      <div
        id={`turnstile-${uniqueId}`}
        ref={containerRef}
        className={`flex justify-center items-center my-3 min-h-[65px] ${className}`}
        data-testid="turnstile-widget"
      />
    );
  }
);

TurnstileWidget.displayName = "TurnstileWidget";
