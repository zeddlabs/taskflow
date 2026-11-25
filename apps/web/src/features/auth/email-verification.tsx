"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import { ApiError, errorMessage, verifyEmail } from "./session";

export function EmailVerification({
  verified,
  onVerified,
  onSessionLost,
}: {
  verified: boolean;
  onVerified: () => void;
  onSessionLost: () => void;
}) {
  const [entering, setEntering] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<{
    message: string;
    field: boolean;
  } | null>(null);
  const [sent, setSent] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const success = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (entering && !verified) input.current?.focus();
  }, [entering, verified]);
  useEffect(() => {
    if (entering && verified) success.current?.focus();
  }, [entering, verified]);

  async function submit(action: "send" | "verify") {
    setError(null);
    if (action === "verify" && !/^[0-9]{8}$/.test(code)) {
      setError({
        message: "Enter the eight digits from your email.",
        field: true,
      });
      input.current?.focus();
      return;
    }
    setPending(action);
    if (action === "send") setSent(false);
    try {
      await verifyEmail(action === "verify" ? code : undefined);
      if (action === "verify") {
        setCode("");
        onVerified();
      } else {
        setSent(true);
        setCode("");
        setEntering(true);
        input.current?.focus();
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onSessionLost();
        return;
      }
      let message = errorMessage(cause);
      if (cause instanceof ApiError) {
        if (cause.status === 409)
          message =
            "That code is incorrect or has expired. Check the latest email or request a new code.";
        if (cause.status === 429)
          message =
            action === "send"
              ? "Wait one minute between code requests, then try again."
              : "Too many incorrect attempts. Request a new code.";
        if (cause.status === 503)
          message =
            action === "send"
              ? "We couldn’t send the email. Try again in a minute."
              : "We couldn’t verify your code. Try again.";
      }
      const field =
        action === "verify" &&
        cause instanceof ApiError &&
        [400, 409, 429].includes(cause.status);
      setError({ message, field });
      if (field) input.current?.focus();
    } finally {
      setPending(null);
    }
  }
  function confirm(event: FormEvent) {
    event.preventDefault();
    void submit("verify");
  }
  return (
    <section
      className="email-verification"
      aria-labelledby="verification-title"
    >
      <h3 id="verification-title" ref={success} tabIndex={-1}>
        {verified ? "Email verified" : "Verify your email"}
      </h3>
      {!verified && (
        <>
          <p id="verification-hint" className="verification-hint">
            {entering
              ? "Enter the latest eight-digit code from your email. It expires after 15 minutes."
              : "Confirm your email address to accept workspace invitations."}
          </p>
          {entering ? (
            <form onSubmit={confirm} noValidate>
              <div className="field">
                <label htmlFor="verification-code">Verification code</label>
                <div className="input-wrap">
                  <input
                    id="verification-code"
                    ref={input}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError(null);
                    }}
                    aria-invalid={error?.field || undefined}
                    aria-describedby={
                      error?.field
                        ? "verification-hint verification-feedback"
                        : "verification-hint"
                    }
                  />
                </div>
              </div>
              <div className="verification-actions">
                <Button type="submit" disabled={!!pending}>
                  {pending === "verify" ? "Verifying…" : "Verify email"}
                </Button>
                <button
                  type="button"
                  className="verification-secondary"
                  disabled={!!pending}
                  onClick={() => void submit("send")}
                >
                  {pending === "send" ? "Sending…" : "Resend code"}
                </button>
              </div>
            </form>
          ) : (
            <div className="verification-actions">
              <Button disabled={!!pending} onClick={() => void submit("send")}>
                {pending ? "Sending…" : "Send verification code"}
              </Button>
              <button
                type="button"
                className="verification-secondary"
                disabled={!!pending}
                onClick={() => {
                  setError(null);
                  setEntering(true);
                }}
              >
                I have a code
              </button>
            </div>
          )}
          <p role="status" className="verification-feedback">
            {sent && !error && "Code sent. Check your inbox."}
          </p>
          {error && (
            <p id="verification-feedback" className="notice" role="alert">
              {error.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
