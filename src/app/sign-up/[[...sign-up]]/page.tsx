import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata = { title: "Create your account" };

export default function SignUpPage() {
  return <AuthScreen kind="sign-up" />;
}
