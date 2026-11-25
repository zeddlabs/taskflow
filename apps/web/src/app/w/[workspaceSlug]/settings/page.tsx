import { ProtectedPage } from "../../../../features/auth/protected-page";
export const metadata = { title: "Workspace settings | TaskFlow" };
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  return <ProtectedPage view="settings" slug={(await params).workspaceSlug} />;
}
