import { ProtectedPage } from "../../../../../features/auth/protected-page";
export const metadata = { title: "Members | TaskFlow" };
export default async function Members({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  return <ProtectedPage view="members" slug={(await params).workspaceSlug} />;
}
