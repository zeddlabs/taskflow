"use client";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { ApiError, errorMessage, workspaceRequest } from "../auth/session";
import type { Workspace } from "./workspace-api";
import { readDirectory } from "./workspace-directory";
import {
  MemberRow,
  InvitationRow,
  RoleOptions,
  type Change,
  type Member,
  type Invite,
} from "./team-controls";
import "./workspace-members.css";

function teamError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return "Your role does not permit this action. Check your current workspace access.";
    if (error.status === 404)
      return "This workspace, member or invitation is no longer available.";
    if (error.status === 409)
      return "The invitation or membership has changed. Check the current list before trying again.";
    if (error.status === 503)
      return "Email delivery could not be confirmed. Check pending invitations and resend if needed.";
    if (error.status === 400)
      return "Check the email address and selected role, then try again.";
    if (error.status === 401 || error.status === 429)
      return errorMessage(error);
  }
  return "Could not reach the workspace. Check your connection and try again.";
}
function useTeamList<T>(
  actorId: string,
  workspaceId: string,
  resource: "members" | "invitations",
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["workspaces", actorId, workspaceId, resource],
    enabled,
    retry: false,
    queryFn: ({ signal }) =>
      readDirectory<T>((query) =>
        workspaceRequest(
          actorId,
          "/" + encodeURIComponent(workspaceId) + "/" + resource + query,
          "GET",
          undefined,
          signal,
        ),
      ),
  });
}
export function WorkspaceMembers({
  actorId,
  workspace,
}: {
  actorId: string;
  workspace: Workspace;
}) {
  const client = useQueryClient();
  const manages = workspace.myRole === "OWNER" || workspace.myRole === "ADMIN";
  const members = useTeamList<Member>(
    actorId,
    workspace.id,
    "members",
    workspace.myRole !== "GUEST",
  );
  const invites = useTeamList<Invite>(
    actorId,
    workspace.id,
    "invitations",
    manages,
  );
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);
  const inviteButton = useRef<HTMLButtonElement>(null);
  const notice = useRef<HTMLParagraphElement>(null);
  const problem = useRef<HTMLParagraphElement>(null);
  const names = new Map<string, number>();
  for (const m of members.data ?? [])
    names.set(m.name, 1 + (names.get(m.name) ?? 0));
  const change: Change = async (path, method, data, success) => {
    if (writing.current) return false;
    writing.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await workspaceRequest(
        actorId,
        "/" + encodeURIComponent(workspace.id) + path,
        method,
        data,
      );
      await client.invalidateQueries({ queryKey: ["workspaces", actorId] });
      setMessage(success);
      requestAnimationFrame(() => notice.current?.focus());
      return true;
    } catch (cause) {
      setError(teamError(cause));
      requestAnimationFrame(() => problem.current?.focus());
      await client.invalidateQueries({ queryKey: ["workspaces", actorId] });
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    if (
      await change(
        "/invitations",
        "POST",
        { email, role: form.get("role") },
        "Invitation sent to " + email + ".",
      )
    )
      setInviting(false);
  }
  if (workspace.myRole === "GUEST")
    return (
      <p role="alert">
        Your guest role does not include access to the member directory.
      </p>
    );
  return (
    <div className="team">
      <section className="ws-summary" aria-labelledby="directory-title">
        <div className="ws-heading">
          <h2 id="directory-title">Workspace members</h2>
          {manages && !inviting && (
            <Button
              ref={inviteButton}
              disabled={busy}
              onClick={() => {
                setInviting(true);
                setError("");
                setMessage("");
              }}
            >
              Invite member
            </Button>
          )}
        </div>
        {inviting && manages && (
          <form className="team-invite" onSubmit={invite}>
            <fieldset disabled={busy}>
              <legend>Invite by email</legend>
              <div className="team-inputs">
                <div className="field">
                  <label htmlFor="invite-email">Email address</label>
                  <input
                    autoFocus
                    id="invite-email"
                    name="email"
                    type="email"
                    required
                    maxLength={320}
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label htmlFor="invite-role">Workspace role</label>
                  <select id="invite-role" name="role" defaultValue="MEMBER">
                    <RoleOptions />
                  </select>
                </div>
              </div>
              <div className="ws-links">
                <Button type="submit">
                  {busy ? "Sending…" : "Send invitation"}
                </Button>
                <button
                  type="button"
                  className="ws-action"
                  onClick={() => {
                    setInviting(false);
                    requestAnimationFrame(() => inviteButton.current?.focus());
                  }}
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        )}
        {members.isError ? (
          <ListError
            error={members.error}
            retry={() => void members.refetch()}
          />
        ) : members.isPending ? (
          <p role="status">Loading members…</p>
        ) : (
          <ul aria-label="Workspace members">
            {members.data.map((m) => (
              <MemberRow
                key={m.userId + ":" + m.role}
                member={m}
                displayName={
                  names.get(m.name) === 1
                    ? m.name
                    : m.name + " (" + m.userId + ")"
                }
                workspace={workspace}
                actorId={actorId}
                busy={busy}
                change={change}
              />
            ))}
          </ul>
        )}
      </section>
      <p ref={notice} className="ws-message" tabIndex={-1} role="status">
        {busy ? "Updating workspace…" : message}
      </p>
      {error && (
        <p className="notice" role="alert" ref={problem} tabIndex={-1}>
          {error}
        </p>
      )}
      {manages && (
        <section className="team-pending" aria-labelledby="pending-title">
          <h2 id="pending-title">Pending invitations</h2>
          {invites.isError ? (
            <ListError
              error={invites.error}
              retry={() => void invites.refetch()}
            />
          ) : invites.isPending ? (
            <p role="status">Loading invitations…</p>
          ) : invites.data.length ? (
            <ul>
              {invites.data.map((i) => (
                <InvitationRow
                  key={i.id}
                  invite={i}
                  busy={busy}
                  change={change}
                />
              ))}
            </ul>
          ) : (
            <p>There are no pending invitations.</p>
          )}
        </section>
      )}
    </div>
  );
}
function ListError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div>
      <p role="alert">{teamError(error)}</p>
      <button className="ws-action" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
