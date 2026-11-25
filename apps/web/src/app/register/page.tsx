import { AuthForm } from "../../features/auth/auth-form";
export const metadata = { title: "Create account | TaskFlow" };
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ join?: string }>;
}) {
  return <AuthForm create invitation={(await searchParams).join === "1"} />;
}
