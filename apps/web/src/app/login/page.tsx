import { AuthForm } from "../../features/auth/auth-form";
export const metadata = { title: "Sign in | TaskFlow" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ join?: string }>;
}) {
  return <AuthForm invitation={(await searchParams).join === "1"} />;
}
