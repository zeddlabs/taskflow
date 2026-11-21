import { ProtectedPage } from "../../../features/auth/protected-page";
export const metadata = { title: "Account | TaskFlow" };
export default function Account() {
  return <ProtectedPage view="account" />;
}
