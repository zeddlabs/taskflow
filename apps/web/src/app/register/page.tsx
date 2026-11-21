import { AuthForm } from "../../features/auth/auth-form";
export const metadata = { title: "Create account | TaskFlow" };
export default function RegisterPage() {
  return <AuthForm create />;
}
