"use client";
import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/button";
import {
  acceptInvitation,
  ApiError,
  errorMessage,
  type Profile,
} from "../auth/session";
import { workspaceUrl } from "./workspace-api";
import { openWorkspacePage } from "./workspace-notice";

export function JoinWorkspace({
  profile,
  onSessionLost,
}: {
  profile: Profile;
  onSessionLost: () => void;
}) {
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function join(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await acceptInvitation(profile.id, token.trim());
      const { workspace } = (await response.json()) as {
        workspace: { slug: string };
      };
      setToken("");
      openWorkspacePage(
        profile.id,
        workspaceUrl(workspace.slug),
        "You joined the workspace.",
        true,
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setToken("");
        onSessionLost();
      } else if (cause instanceof ApiError && cause.status === 409) {
        setToken("");
        setError(
          "This invitation is no longer valid. Use the latest email or ask a workspace admin for another invitation.",
        );
      } else if (cause instanceof ApiError && cause.status === 403)
        setError(
          "Use the verified account matching the email address that received the invitation.",
        );
      else setError(errorMessage(cause));
      setPending(false);
    }
  }
  return (
    <section
      className="ws-directory"
      id="join-workspace"
      aria-labelledby="join-title"
    >
      <div className="ws-heading">
        <h2 id="join-title">Join a workspace</h2>
      </div>
      {profile.emailVerified ? (
        <form className="team-join" onSubmit={join}>
          <div className="field">
            <label htmlFor="invite-token">Invitation token</label>
            <div className="input-wrap">
              <input
                id="invite-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
                pattern="[A-Za-z0-9_\-]{43}"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value.trim());
                  setError("");
                }}
                aria-describedby="token-hint"
                disabled={pending}
              />
            </div>
            <p id="token-hint" className="field-hint">
              Paste the token from your invitation email.
            </p>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Joining…" : "Join workspace"}
          </Button>
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
        </form>
      ) : (
        <p>
          <a className="ws-action" href="#verification-title">
            Verify your email
          </a>{" "}
          to accept your workspace invitation.
        </p>
      )}
    </section>
  );
}
