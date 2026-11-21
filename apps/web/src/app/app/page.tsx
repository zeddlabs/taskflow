import { ProtectedPage } from "../../features/auth/protected-page";
export const metadata = { title: "Overview | TaskFlow" };
export default function Dashboard() {
  return <ProtectedPage view="overview" />;
}
