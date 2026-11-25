"use client";

import "./workspaces.css";

import Link from "next/link";
import { WorkspaceSwitch } from "./workspace-switch";
import { readDirectory } from "./workspace-directory";
import { useWorkspaceNotice } from "./workspace-notice";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Plus,
  Settings2,
} from "lucide-react";
import { ApiError, workspaceRequest } from "../auth/session";
import { WorkspaceForm } from "./workspace-form";

import {
  workspaceError,
  workspaceUrl,
  type Settings,
  type Workspace,
} from "./workspace-api";
function useDirectory(actorId: string) {
  return useQuery({
    queryKey: ["workspaces", actorId, "directory"],
    retry: false,
    queryFn: ({ signal }) =>
      readDirectory((path) =>
        workspaceRequest(actorId, path, "GET", undefined, signal),
      ),
  });
}
function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="ws-feedback">
      <p role="alert">{workspaceError(error)}</p>
      {retry && (
        <button className="verification-secondary" onClick={retry}>
          Try again
        </button>
      )}
      <Link href="/app#workspaces">Back to workspaces</Link>
    </div>
  );
}
export function WorkspaceDirectory({ actorId }: { actorId: string }) {
  const notice = useWorkspaceNotice(actorId);
  const directory = useDirectory(actorId);
  return (
    <section
      className="ws-directory"
      id="workspaces"
      aria-labelledby="workspaces-title"
    >
      <div className="ws-heading">
        <h2 id="workspaces-title">Workspaces</h2>
        <Link className="ws-action" href="/onboarding/workspace">
          <Plus size={16} aria-hidden="true" />
          Create workspace
        </Link>
      </div>
      {notice && <p role="status">{notice}</p>}
      {directory.isError ? (
        <div>
          <p role="alert">{workspaceError(directory.error)}</p>
          <button
            className="verification-secondary"
            onClick={() => void directory.refetch()}
          >
            Try again
          </button>
        </div>
      ) : directory.isPending ? (
        <p role="status">Loading workspaces…</p>
      ) : directory.data.length ? (
        <ul className="ws-list">
          {directory.data.map((w) => (
            <li key={w.id}>
              <Link href={workspaceUrl(w.slug)} prefetch={false}>
                <Building2 aria-hidden="true" size={18} />
                <div>
                  <strong>{w.name}</strong>
                  <small>/w/{w.slug}</small>
                </div>
                <span>{roleName(w.myRole)}</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Create your first workspace to give your team a place to work.</p>
      )}
    </section>
  );
}
const roleName = (role: Workspace["myRole"]) =>
  role.charAt(0) + role.slice(1).toLowerCase();
export function WorkspaceArea({
  actorId,
  slug,
  view,
}: {
  actorId: string;
  slug?: string;
  view: "create" | "workspace" | "settings";
}) {
  if (view === "create")
    return (
      <>
        <BackLink />
        <h1>Create workspace</h1>
        <WorkspaceForm actorId={actorId} />
      </>
    );
  return (
    <WorkspaceRoute
      actorId={actorId}
      slug={slug!}
      settings={view === "settings"}
    />
  );
}
function BackLink() {
  return (
    <Link className="ws-back" href="/app#workspaces">
      <ArrowLeft size={16} aria-hidden="true" />
      All workspaces
    </Link>
  );
}
function WorkspaceRoute({
  actorId,
  slug,
  settings,
}: {
  actorId: string;
  slug: string;
  settings: boolean;
}) {
  const notice = useWorkspaceNotice(actorId);
  const directory = useDirectory(actorId);
  const entry = directory.data?.find((w) => w.slug === slug);
  const query = useQuery({
    queryKey: [
      "workspaces",
      actorId,
      entry?.id,
      settings ? "settings" : "detail",
    ],
    enabled: !!entry,
    retry: false,
    queryFn: async ({ signal }) => {
      const path =
        "/" + encodeURIComponent(entry!.id) + (settings ? "/settings" : "");
      const response = await workspaceRequest(
        actorId,
        path,
        "GET",
        undefined,
        signal,
      );
      return (await response.json()) as Workspace | Settings;
    },
  });
  if (directory.isError)
    return (
      <>
        <h1>Workspaces unavailable</h1>
        <Failure
          error={directory.error}
          retry={() => void directory.refetch()}
        />
      </>
    );
  if (directory.isPending || (entry && query.isPending))
    return <p role="status">Opening workspace…</p>;
  if (!entry || query.isError || !query.data || query.data.slug !== slug)
    return (
      <>
        <h1>
          {query.error instanceof ApiError && query.error.status === 403
            ? "Settings restricted"
            : "Workspace unavailable"}
        </h1>
        <Failure
          error={query.error ?? new ApiError(404)}
          retry={() => {
            void directory.refetch();
            if (entry) void query.refetch();
          }}
        />
      </>
    );
  const w = query.data;
  return (
    <div className="ws-view">
      {settings ? (
        <Link className="ws-back" href={workspaceUrl(w.slug)}>
          <ArrowLeft size={16} aria-hidden="true" />
          {w.name}
        </Link>
      ) : (
        <BackLink />
      )}
      {notice && (
        <p role="status" className="ws-message">
          {notice}
        </p>
      )}
      {settings && "timezone" in w ? (
        <>
          <h1>Workspace settings</h1>
          <WorkspaceForm key={w.id} actorId={actorId} settings={w} />
        </>
      ) : (
        <>
          <h1>{w.name}</h1>
          <div className="ws-summary">
            <div className="ws-heading">
              <h2>Workspace details</h2>
              {(w.myRole === "OWNER" || w.myRole === "ADMIN") && (
                <Link
                  className="ws-action"
                  href={workspaceUrl(w.slug) + "/settings"}
                >
                  <Settings2 size={16} aria-hidden="true" />
                  Settings
                </Link>
              )}
            </div>
            <dl className="details">
              <div>
                <dt>Workspace address</dt>
                <dd>/w/{w.slug}</dd>
              </div>
              <div>
                <dt>Your role</dt>
                <dd>{roleName(w.myRole)}</dd>
              </div>
            </dl>
          </div>
          {directory.data.length > 1 && (
            <WorkspaceSwitch key={w.id} active={w} rows={directory.data} />
          )}

          <Link className="ws-action" href="/onboarding/workspace">
            <Plus size={16} aria-hidden="true" />
            Create workspace
          </Link>
        </>
      )}
    </div>
  );
}
