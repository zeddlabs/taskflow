"use client";
import { useEffect, useState } from "react";

const noticeKey = (actorId: string, path: string) =>
  "taskflow:workspace-notice:" + actorId + ":" + path;
export function openWorkspacePage(
  actorId: string,
  path: string,
  message: string,
  replace = false,
) {
  try {
    sessionStorage.setItem(noticeKey(actorId, path.split("#")[0]), message);
  } catch {
    /* Navigation still works when tab storage is unavailable. */
  }
  if (replace) window.location.replace(path);
  else window.location.assign(path);
}
export function useWorkspaceNotice(actorId: string) {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const key = noticeKey(actorId, window.location.pathname);
        const message = sessionStorage.getItem(key);
        sessionStorage.removeItem(key);
        setNotice(message ?? "");
      } catch {
        /* The current page already shows the committed state. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [actorId]);
  return notice;
}
