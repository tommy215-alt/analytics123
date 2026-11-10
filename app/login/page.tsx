import { redirect } from "next/navigation";
import { isLoggedIn, loginRequired } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!loginRequired() || (await isLoggedIn())) redirect("/");
  return (
    <main className="login">
      <LoginForm />
    </main>
  );
}
