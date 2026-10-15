import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return <AuthScreen kind="sign-in" />;
}
