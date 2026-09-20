import { Link, Outlet } from "react-router";
import { Show, UserButton } from "@clerk/react";

export function Layout() {
  return (
    <div className="page">
      <header className="row between">
        <Link to="/" className="brand">
          <span aria-hidden>🐚</span> Content Clam
        </Link>
        <nav className="row">
          <Link to="/privacy">Privacy</Link>
          <Link to="/support">Support</Link>
          <Show when="signed-in">
            <Link to="/account">Account</Link>
            <UserButton />
          </Show>
          <Show when="signed-out">
            <Link to="/sign-in">Sign in</Link>
          </Show>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="muted">Open source under the MIT license.</footer>
    </div>
  );
}
