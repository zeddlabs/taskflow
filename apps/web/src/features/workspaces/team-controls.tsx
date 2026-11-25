"use client";
import { useId, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import type { Workspace } from "./workspace-api";

export type Role = Workspace["myRole"];
export type Member = { userId: string; name: string; role: Role };
export type Invite = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
};
export type Change = (
  path: string,
  method: string,
  data: object | undefined,
  message: string,
) => Promise<boolean>;
export const roleLabel = (role: Role) => role[0] + role.slice(1).toLowerCase();
export function RoleOptions() {
  return (
    <>
      {(["MEMBER", "ADMIN", "GUEST"] as const).map((role) => (
        <option key={role} value={role}>
          {roleLabel(role)}
        </option>
      ))}
    </>
  );
}

function Confirm({
  label,
  description,
  disabled,
  onConfirm,
  onCancel,
}: {
  label: string;
  description: string;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const descriptionId = useId();
  return (
    <div
      className="team-confirm"
      role="group"
      aria-label={label}
      aria-describedby={descriptionId}
    >
      <p id={descriptionId}>{description}</p>
      <div className="ws-links">
        <button
          autoFocus
          className="ws-action"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </button>
        <Button
          disabled={disabled}
          onClick={onConfirm}
          aria-describedby={descriptionId}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}

export function MemberRow({
  member,
  displayName,
  workspace,
  actorId,
  change,
  busy,
}: {
  member: Member;
  displayName: string;
  workspace: Workspace;
  actorId: string;
  change: Change;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"remove" | "transfer" | null>(null);
  const [role, setRole] = useState(member.role);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const manageable =
    (workspace.myRole === "OWNER" || workspace.myRole === "ADMIN") &&
    member.role !== "OWNER";
  const path = "/members/" + encodeURIComponent(member.userId);
  function close() {
    setOpen(false);
    setAction(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return (
    <li className="team-row">
      <div className="team-line">
        <div className="team-name">
          <strong>{displayName}</strong>
          {member.userId === actorId && <small>Your account</small>}
        </div>
        <span>{roleLabel(member.role)}</span>
        {manageable && (
          <button
            ref={trigger}
            type="button"
            className="ws-action"
            aria-label={
              (open ? "Close controls for " : "Manage ") + displayName
            }
            aria-controls={id}
            aria-expanded={open}
            disabled={busy}
            onClick={() => {
              setRole(member.role);
              setOpen(!open);
              setAction(null);
            }}
          >
            {open ? "Close" : "Manage"}
          </button>
        )}
      </div>
      {open && manageable && (
        <div className="team-edit" id={id}>
          {action ? (
            <Confirm
              label={
                action === "transfer" ? "Confirm transfer" : "Confirm removal"
              }
              description={
                action === "transfer"
                  ? "Make " +
                    displayName +
                    " the owner of " +
                    workspace.name +
                    "? Your role will change to Admin."
                  : "Remove " +
                    displayName +
                    " from " +
                    workspace.name +
                    "? They will lose access to this workspace and its projects."
              }
              disabled={busy}
              onCancel={close}
              onConfirm={async () => {
                const ok =
                  action === "transfer"
                    ? await change(
                        "/transfer-ownership",
                        "POST",
                        { newOwnerUserId: member.userId },
                        "Ownership transferred to " + member.name + ".",
                      )
                    : await change(
                        path,
                        "DELETE",
                        undefined,
                        member.name + " was removed.",
                      );
                if (ok) close();
              }}
            />
          ) : (
            <>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await change(
                      path,
                      "PATCH",
                      { role },
                      "Role updated for " + member.name + ".",
                    )
                  )
                    close();
                }}
              >
                <label htmlFor={id + "-role"}>Workspace role</label>
                <div className="ws-links">
                  <select
                    id={id + "-role"}
                    value={role}
                    disabled={busy}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    <RoleOptions />
                  </select>
                  <Button type="submit" disabled={busy || role === member.role}>
                    Save role
                  </Button>
                </div>
              </form>
              <div className="ws-links">
                <button
                  className="ws-action"
                  disabled={busy}
                  onClick={() => setAction("remove")}
                >
                  Remove member
                </button>
                {workspace.myRole === "OWNER" && member.role !== "GUEST" && (
                  <button
                    className="ws-action"
                    disabled={busy}
                    onClick={() => setAction("transfer")}
                  >
                    Transfer ownership
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
export function InvitationRow({
  invite,
  change,
  busy,
}: {
  invite: Invite;
  change: Change;
  busy: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const path = "/invitations/" + encodeURIComponent(invite.id);
  return (
    <li className="team-row">
      <div className="team-line">
        <div className="team-name">
          <strong>{invite.email}</strong>
          <small>
            {roleLabel(invite.role)} · Expires{" "}
            {new Date(invite.expiresAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </small>
        </div>
        <div className="ws-links">
          <button
            className="ws-action"
            disabled={busy || confirm}
            aria-label={"Resend invitation to " + invite.email}
            onClick={() =>
              void change(
                path + "/resend",
                "POST",
                undefined,
                "New invitation sent to " + invite.email + ".",
              )
            }
          >
            Resend
          </button>
          <button
            ref={trigger}
            className="ws-action"
            disabled={busy || confirm}
            aria-label={"Revoke invitation to " + invite.email}
            onClick={() => setConfirm(true)}
          >
            Revoke
          </button>
        </div>
      </div>
      {confirm && (
        <Confirm
          label="Confirm revocation"
          description={
            "Revoke the invitation to " +
            invite.email +
            "? The emailed token will stop working."
          }
          disabled={busy}
          onCancel={() => {
            setConfirm(false);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
          onConfirm={() =>
            void change(path, "DELETE", undefined, "Invitation revoked.")
          }
        />
      )}
    </li>
  );
}
