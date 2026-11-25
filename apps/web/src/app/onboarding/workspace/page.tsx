import { ProtectedPage } from "../../../features/auth/protected-page";
export const metadata = { title: "Create workspace | TaskFlow" };
export default function Page() {
  return <ProtectedPage view="create" />;
}
