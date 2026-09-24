import { useEffect, useState } from "react";
import { Authenticated, Unauthenticated, useAction, useMutation, useQuery } from "convex/react";
import { api } from "@content-clam/backend/api";
import { Link, useSearchParams } from "react-router";

export function Account() {
  return (
    <>
      <Unauthenticated>
        <p>
          <Link to="/sign-in">Sign in</Link> to see your credits.
        </p>
      </Unauthenticated>
      <Authenticated>
        <AccountPanel />
      </Authenticated>
    </>
  );
}

function AccountPanel() {
  const me = useQuery(api.users.me, {});
  const packs = useQuery(api.purchases.listPacks, {});
  const history = useQuery(api.purchases.history, {});
  const ensureUser = useMutation(api.users.ensureUser);
  const startCheckout = useAction(api.purchases.startCheckout);
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (me === null) ensureUser({}).catch((e: Error) => setError(e.message));
  }, [me, ensureUser]);

  const buy = async (packId: string) => {
    setBusy(packId);
    setError(null);
    try {
      const { url } = await startCheckout({ packId, returnUrl: `${location.origin}/account` });
      if (url) location.href = url;
      else setError("Stripe did not return a checkout page.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="stack">
      <h1>Your account</h1>
      {params.get("checkout") === "success" && (
        <p className="notice">Payment received. Credits appear as soon as Stripe confirms it, usually within seconds.</p>
      )}
      {params.get("checkout") === "cancelled" && <p className="notice">Checkout cancelled. Nothing was charged.</p>}
      {me === undefined && <p className="muted">Loading…</p>}
      {me && (
        <p>
          <strong>{me.balance}</strong> credits · {me.chargedAnalyses} analyses used · {me.email}
        </p>
      )}
      <h2>Buy credits</h2>
      <p className="muted">One credit is one video analysis. Credits do not expire. No subscription.</p>
      <div className="packs">
        {packs?.map((p) => (
          <button key={p.id} className="pack" disabled={busy !== null} onClick={() => buy(p.id)}>
            <strong>{p.name}</strong>
            <span>{p.credits.toLocaleString()} credits</span>
            <span>{(p.amountCents / 100).toLocaleString(undefined, { style: "currency", currency: p.currency.toUpperCase() })}</span>
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {history && history.length > 0 && (
        <>
          <h2>Purchases</h2>
          <ul>
            {history.map((h) => (
              <li key={`${h.createdAt}:${h.packId}`}>
                {new Date(h.createdAt).toLocaleDateString()} · {h.credits} credits · {(h.amountCents / 100).toFixed(2)} · {h.status}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted">
        Refunds and account deletion are handled by email. <Link to="/support">Contact support.</Link>
      </p>
    </section>
  );
}
