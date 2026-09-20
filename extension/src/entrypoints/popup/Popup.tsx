import { useSettings, useStatus } from "../../ui/useBackground";
import { sendToBackground } from "../../lib/messages";

export function Popup() {
  const { settings, save } = useSettings();
  const { status } = useStatus();

  if (!settings) return <div style={{ padding: 16, width: 320 }}>Loading…</div>;

  const toggleCategory = (id: string, enabled: boolean) =>
    save({
      ...settings,
      categories: settings.categories.map((c) => (c.id === id ? { ...c, enabled, updatedAt: Date.now() } : c)),
    });

  return (
    <div style={{ padding: 16, width: 320 }} className="stack">
      <div className="row between">
        <div className="row">
          <span className="clam" aria-hidden>🐚</span>
          <h1>Content Clam</h1>
        </div>
        <label className="switch">
          <input type="checkbox" checked={!settings.paused} onChange={(e) => save({ ...settings, paused: !e.target.checked })} />
          {settings.paused ? "Paused" : "On"}
        </label>
      </div>

      <FundingLine status={status} />

      <div className="stack" style={{ gap: 4 }}>
        {settings.categories.map((c) => (
          <label key={c.id} className="row between switch" style={{ padding: "4px 0" }}>
            <span>{c.name}</span>
            <input type="checkbox" checked={c.enabled} onChange={(e) => toggleCategory(c.id, e.target.checked)} />
          </label>
        ))}
      </div>

      <button onClick={() => chrome.runtime.openOptionsPage()}>All settings</button>
    </div>
  );
}

function FundingLine({ status }: { status: ReturnType<typeof useStatus>["status"] }) {
  if (!status) return <p className="muted">Checking account…</p>;
  if (status.fundingMode === "personal-key") {
    return <p className="muted">{status.hasPersonalKey ? "Using your TypeSafe API key." : "Add your API key in settings."}</p>;
  }
  if (status.fundingMode === "hosted") {
    if (!status.signedIn) {
      return (
        <p className="muted">
          Not signed in. <button className="link" onClick={() => sendToBackground({ type: "openSignIn" })}>Sign in</button>
        </p>
      );
    }
    return (
      <p className="muted">
        {status.balance ?? 0} credits left{status.email ? ` · ${status.email}` : ""}
      </p>
    );
  }
  return (
    <p className="muted">
      Analyses are off. <button className="link" onClick={() => chrome.runtime.openOptionsPage()}>Choose how to pay</button>
    </p>
  );
}
