import { ProtectedPage } from "../../../features/auth/protected-page";
export const metadata = { title: "Workspace | TaskFlow" };
export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  return <ProtectedPage view="workspace" slug={(await params).workspaceSlug} />;
}
