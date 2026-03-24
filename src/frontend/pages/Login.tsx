import React, { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (
            element: HTMLElement,
            config: Record<string, unknown>,
          ) => void;
          prompt: (
            callback?: (notification: {
              isSkippedMoment: () => boolean;
            }) => void,
          ) => void;
        };
        oauth2: {
          initCodeClient: (config: Record<string, unknown>) => {
            requestCode: () => void;
          };
        };
      };
    };
  }
}

interface LoginProps {
  onLogin: (token: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const scriptLoaded = useRef(false);
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;

  useEffect(() => {
    if (scriptLoaded.current) return;
    scriptLoaded.current = true;

    const clientId = (window as any).__ERA_GOOGLE_CLIENT_ID__;
    if (!clientId) {
      console.error("Google Client ID not configured");
      return;
    }

    // Handle redirect callback — Google posts credential to the page hash
    const params = new URLSearchParams(window.location.hash.slice(1));
    const credentialFromHash = params.get("credential");
    if (credentialFromHash) {
      window.location.hash = "";
      onLoginRef.current(credentialFromHash);
      return;
    }

    function initGoogle() {
      window.google!.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential: string }) => {
          onLoginRef.current(response.credential);
        },
        ux_mode: "popup",
        use_fedcm_for_prompt: false,
      });
      if (buttonRef.current) {
        window.google!.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "signin_with",
          width: 280,
        });
      }
    }

    if (window.google?.accounts) {
      initGoogle();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    }
  }, []);

  // Fallback: manual OAuth redirect if GIS popup fails
  const handleManualLogin = useCallback(() => {
    const clientId = (window as any).__ERA_GOOGLE_CLIENT_ID__;
    if (!clientId) return;
    const redirectUri = window.location.origin + "/";
    const scope = "openid email profile";
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=id_token&scope=${encodeURIComponent(scope)}&nonce=${Date.now()}&prompt=select_account`;
    window.location.href = url;
  }, []);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">ERA</div>
        <p className="login-subtitle">Enterprise resource application</p>
        <div className="login-divider" />
        <div ref={buttonRef} className="login-google-btn" />
        <p className="login-hint">
          Sign in with your Google account to continue
        </p>
        <button className="login-fallback" onClick={handleManualLogin}>
          Having trouble? Click here to sign in
        </button>
      </div>
    </div>
  );
}
