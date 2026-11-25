"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { openWorkspacePage } from "./workspace-notice";
import { ApiError, workspaceRequest } from "../auth/session";
import {
  workspaceError,
  workspaceUrl,
  type Settings,
  type Workspace,
} from "./workspace-api";

type Fields = {
  name: string;
  slug: string;
  timezone: string;
  allowMemberCreateProjects: boolean;
};

export function WorkspaceForm({
  actorId,
  settings,
}: {
  actorId: string;
  settings?: Settings;
}) {
  const client = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const archiveButton = useRef<HTMLButtonElement>(null);
  const [manualSlug, setManualSlug] = useState(!!settings);
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<Fields>({
    defaultValues: {
      name: settings?.name ?? "",
      slug: settings?.slug ?? "",
      timezone: settings?.timezone ?? "UTC",
      allowMemberCreateProjects: settings?.allowMemberCreateProjects ?? false,
    },
  });
  const busy = isSubmitting || archiving || leaving;
  const path = settings ? "/" + encodeURIComponent(settings.id) : "";
  function clearFeedback() {
    setFailure("");
    setFeedback("");
  }
  async function save(values: Fields) {
    clearFeedback();
    const data = settings
      ? Object.fromEntries(
          Object.entries(values).filter(
            ([field]) => dirtyFields[field as keyof Fields],
          ),
        )
      : { name: values.name, slug: values.slug };
    try {
      const response = await workspaceRequest(
        actorId,
        path,
        settings ? "PATCH" : "POST",
        data,
      );
      const workspace = (await response.json()) as Workspace | Settings;
      if (!settings || workspace.slug !== settings.slug) {
        setLeaving(true);
        openWorkspacePage(
          actorId,
          workspaceUrl(workspace.slug) + (settings ? "/settings" : ""),
          settings ? "Workspace settings saved." : "Workspace created.",
        );
        return;
      }
      if ("timezone" in workspace) {
        reset({
          name: workspace.name,
          slug: workspace.slug,
          timezone: workspace.timezone,
          allowMemberCreateProjects: workspace.allowMemberCreateProjects,
        });
        client.setQueryData(
          ["workspaces", actorId, workspace.id, "settings"],
          workspace,
        );
        await client.invalidateQueries({
          queryKey: ["workspaces", actorId, "directory"],
        });
      }
      setFeedback("Workspace settings saved.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409)
        setError(
          "slug",
          { message: workspaceError(error) },
          { shouldFocus: true },
        );
      else {
        setFailure(workspaceError(error));
        if (error instanceof ApiError && [403, 404].includes(error.status))
          await client.invalidateQueries({ queryKey: ["workspaces", actorId] });
      }
    }
  }
  async function archive() {
    if (!settings) return;
    setArchiving(true);
    clearFeedback();
    try {
      await workspaceRequest(actorId, path + "/archive", "POST");
      setLeaving(true);
      openWorkspacePage(
        actorId,
        "/app#workspaces",
        "Workspace archived.",
        true,
      );
    } catch (error) {
      setFailure(workspaceError(error));
      setArchiving(false);
      if (error instanceof ApiError && [403, 404].includes(error.status))
        await client.invalidateQueries({ queryKey: ["workspaces", actorId] });
    }
  }
  return (
    <div className="ws-editor">
      <form
        className="ws-form"
        onChange={clearFeedback}
        onSubmit={handleSubmit(save)}
        noValidate
      >
        <fieldset disabled={busy || confirming}>
          <legend>{settings ? "General settings" : "Workspace details"}</legend>
          <div className="field">
            <label htmlFor="ws-name">Workspace name</label>
            <input
              id="ws-name"
              required
              maxLength={150}
              autoComplete="off"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "ws-name-error" : undefined}
              {...register("name", {
                validate: (v) => !!v.trim() || "Enter a workspace name.",
                onChange: (e) => {
                  if (!manualSlug && !settings)
                    setValue(
                      "slug",
                      String(e.target.value)
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, "")
                        .slice(0, 80)
                        .replace(/-$/, ""),
                    );
                },
              })}
            />
            {errors.name && (
              <p className="field-error" id="ws-name-error">
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="ws-slug">Workspace address</label>
            <div className="ws-address">
              <span aria-hidden="true">/w/</span>
              <input
                id="ws-slug"
                required
                maxLength={80}
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={!!errors.slug}
                aria-describedby={
                  "ws-slug-hint" + (errors.slug ? " ws-slug-error" : "")
                }
                {...register("slug", {
                  pattern: {
                    value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                    message:
                      "Use lowercase letters, numbers and single hyphens between words.",
                  },
                  required: "Enter a workspace address.",
                  onChange: () => {
                    setManualSlug(true);
                  },
                })}
              />
            </div>
            <p id="ws-slug-hint" className="field-hint">
              Use lowercase letters, numbers and hyphens.
            </p>
            {errors.slug && (
              <p role="alert" className="field-error" id="ws-slug-error">
                {errors.slug.message}
              </p>
            )}
          </div>
          {settings && (
            <>
              <div className="field">
                <label htmlFor="ws-zone">Time zone</label>
                <input
                  id="ws-zone"
                  required
                  aria-invalid={!!errors.timezone}
                  aria-describedby={
                    "ws-zone-hint" + (errors.timezone ? " ws-zone-error" : "")
                  }
                  {...register("timezone", {
                    validate: (v) => {
                      try {
                        new Intl.DateTimeFormat("en", { timeZone: v });
                        return true;
                      } catch {
                        return "Enter a time zone such as Asia/Jakarta.";
                      }
                    },
                  })}
                />
                <p className="field-hint" id="ws-zone-hint">
                  For example, Asia/Jakarta or UTC.
                </p>
                {errors.timezone && (
                  <p id="ws-zone-error" className="field-error">
                    {errors.timezone.message}
                  </p>
                )}
              </div>
              <label className="ws-check">
                <input
                  type="checkbox"
                  {...register("allowMemberCreateProjects")}
                />
                Allow members to create projects
              </label>
            </>
          )}
          <div className="ws-actions">
            <Button
              type="submit"
              disabled={
                busy || (!!settings && !Object.keys(dirtyFields).length)
              }
            >
              {isSubmitting || leaving
                ? settings
                  ? "Saving…"
                  : "Creating…"
                : settings
                  ? "Save changes"
                  : "Create workspace"}
            </Button>
            {!busy && (
              <Link
                href={
                  settings ? workspaceUrl(settings.slug) : "/app#workspaces"
                }
              >
                {settings ? "Back to workspace" : "Cancel"}
              </Link>
            )}
          </div>
        </fieldset>
      </form>
      <p role="status" className="ws-message">
        {feedback}
      </p>
      {failure && (
        <p role="alert" className="notice">
          {failure}
        </p>
      )}
      {settings?.myRole === "OWNER" && (
        <section className="ws-archive" aria-labelledby="archive-title">
          <h2 id="archive-title">Archive workspace</h2>
          <p>
            Archiving removes this workspace from everyone’s workspace list and
            preserves its history.
          </p>
          {confirming ? (
            <div role="group" aria-label="Confirm archive">
              <p>
                Archive <strong>{settings.name}</strong>?
              </p>
              <div className="ws-actions">
                <button
                  type="button"
                  autoFocus
                  disabled={busy}
                  className="ws-action"
                  onClick={() => {
                    setConfirming(false);
                    requestAnimationFrame(() => archiveButton.current?.focus());
                  }}
                >
                  Keep workspace
                </button>
                <Button disabled={busy} onClick={archive}>
                  {archiving ? "Archiving…" : "Confirm archive"}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              ref={archiveButton}
              className="verification-secondary"
              disabled={busy}
              onClick={() => {
                clearFeedback();
                setConfirming(true);
              }}
            >
              Archive workspace
            </button>
          )}
        </section>
      )}
    </div>
  );
}
