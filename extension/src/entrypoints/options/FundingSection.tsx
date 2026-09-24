import { useState } from "react";
import { sendToBackground, type Status } from "../../lib/messages";
import { env } from "../../lib/env";
import type { FundingMode } from "../../lib/storage";

interface Props {
  status: Status | null;
  refreshStatus: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

function SyncChoice({ status, busy, run }: { status: Status; busy: boolean; run: (label: string, work: () => Promise<unknown>) => Promise<void> }) {
  const unasked = status.syncChoice === "unasked";
  return (
    <div className="card stack">
      {unasked ? (
        <p>
          <strong>Choose which settings to keep.</strong> Your account may already hold settings from another device. Settings on this device are not synced until you pick one.
        </p>
      ) : (
        <p className="muted">Settings changes on this device sync to your account. Use these to replace one side completely.</p>
      )}
      <div className="row">
        <button className={unasked ? "primary" : undefined} disabled={busy} onClick={() => run("Loaded settings from your account.", () => sendToBackground({ type: "syncFromServer" }))}>Use account settings</button>
        <button className={unasked ? "primary" : undefined} disabled={busy} onClick={() => run("Saved this device's settings to your account.", () => sendToBackground({ type: "pushSettingsToServer" }))}>Upload these settings</button>
      </div>
    </div>
  );
}

export function FundingSection({ status, refreshStatus, refreshSettings }: Props) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const setMode = async (mode: FundingMode) => {
    await sendToBackground({ type: "setFundingMode", mode });
    await refreshStatus();
  };

  const saveKey = async () => {
    await sendToBackground({ type: "setPersonalKey", key: key.trim() || null });
    setKey("");
    await refreshStatus();
  };

  const run = async (label: string, work: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      setMessage(label);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      await refreshStatus();
      await refreshSettings();
    }
  };

  if (!status) return null;

  return (
    <section>
      <h2>How analyses are paid for</h2>
      <p className="muted">
        Each video analysis costs one credit or one request on your own key. You pick the source. Content Clam never switches on its own.
      </p>
      <div className="stack">
        <label className="card row" style={{ alignItems: "flex-start" }}>
          <input type="radio" name="mode" checked={status.fundingMode === "none"} onChange={() => setMode("none")} />
          <div>
            <strong>Off</strong>
            <p className="muted">No metadata leaves the browser. Saved results still apply.</p>
          </div>
        </label>

        <label className="card row" style={{ alignItems: "flex-start" }}>
          <input type="radio" name="mode" checked={status.fundingMode === "personal-key"} onChange={() => setMode("personal-key")} />
          <div style={{ flex: 1 }}>
            <strong>My own TypeSafe API key</strong>
            <p className="muted">
              Requests go straight from this browser to api.typesafe.ai and are billed to your TypeSafe account. The key is stored only on this device, in extension storage, which is not an encrypted vault.
            </p>
            {status.fundingMode === "personal-key" && (
              <div className="row">
                <input type="password" placeholder={status.hasPersonalKey ? "Key saved. Paste a new one to replace it." : "ts_..."} value={key} onChange={(e) => setKey(e.target.value)} />
                <button onClick={saveKey} disabled={!key.trim() && !status.hasPersonalKey}>{key.trim() ? "Save" : "Remove"}</button>
              </div>
            )}
          </div>
        </label>

        <label className="card row" style={{ alignItems: "flex-start", opacity: status.hostedAvailable ? 1 : 0.5 }}>
          <input type="radio" name="mode" disabled={!status.hostedAvailable} checked={status.fundingMode === "hosted"} onChange={() => setMode("hosted")} />
          <div style={{ flex: 1 }}>
            <strong>Content Clam credits</strong>
            <p className="muted">
              Requests go to the Content Clam service, which forwards video metadata to TypeSafe and keeps no copy. Your first 100 analyses are free after email verification. Settings sync across devices.
            </p>
            {!status.hostedAvailable && <p className="muted">This build was made without a hosted service. Use your own key.</p>}
            {status.fundingMode === "hosted" && status.hostedAvailable && (
              <div className="stack">
                {status.signedIn ? (
                  <>
                    <p>
                      {status.email} · <strong>{status.balance ?? 0}</strong> credits
                    </p>
                    {status.lastError && <p className="error">{status.lastError}</p>}
                    <div className="row">
                      <a href={`${env.webUrl}/account`} target="_blank" rel="noreferrer"><button className="primary">Buy credits</button></a>
                    </div>
                    <SyncChoice status={status} busy={busy} run={run} />
                  </>
                ) : (
                  <button className="primary" onClick={() => sendToBackground({ type: "openSignIn" })}>Sign in or create account</button>
                )}
                {message && <p className="muted">{message}</p>}
              </div>
            )}
          </div>
        </label>
      </div>
    </section>
  );
}
