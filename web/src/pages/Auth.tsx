import { SignIn, SignUp } from "@clerk/react";

export function SignInPage() {
  return (
    <section className="center stack">
      <p className="muted">Sign in here, then return to the extension. It shares this session.</p>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/account" />
    </section>
  );
}

export function SignUpPage() {
  return (
    <section className="center stack">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/account" />
    </section>
  );
}
