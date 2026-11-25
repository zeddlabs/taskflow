"use client";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { workspaceUrl, type Workspace } from "./workspace-api";

export function WorkspaceSwitch({
  active,
  rows,
}: {
  active: Workspace;
  rows: Workspace[];
}) {
  const [slug, setSlug] = useState(active.slug);
  return (
    <form
      className="ws-switch"
      onSubmit={(event) => {
        event.preventDefault();
        if (rows.some((w) => w.slug === slug))
          window.location.assign(workspaceUrl(slug));
      }}
    >
      <label htmlFor="switch-workspace">Switch workspace</label>
      <div className="ws-switch-controls">
        <select
          id="switch-workspace"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
        >
          {rows.map((row) => (
            <option key={row.id} value={row.slug}>
              {row.name} (/w/{row.slug})
            </option>
          ))}
        </select>
        <Button type="submit" disabled={slug === active.slug}>
          Switch
        </Button>
      </div>
    </form>
  );
}
