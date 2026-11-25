import { ApiError, errorMessage } from "../auth/session";
export type Workspace = {
  id: string;
  name: string;
  slug: string;
  myRole: "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
};
export type Settings = Workspace & {
  timezone: string;
  allowMemberCreateProjects: boolean;
};
export const workspaceUrl = (slug: string) => "/w/" + encodeURIComponent(slug);
export function workspaceError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return "That workspace address is already in use. Choose another address.";
    if (error.status === 400)
      return "Check the workspace address and other fields, then try again.";
    if (error.status === 403)
      return "You do not have permission to make this change.";
    if (error.status === 404)
      return "This workspace is no longer available to you.";
    if (error.status === 429 || error.status === 401)
      return errorMessage(error);
  }
  return "Could not reach your workspace. Check your connection and try again.";
}
