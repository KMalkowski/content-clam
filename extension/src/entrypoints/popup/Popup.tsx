import { useState } from "react";
import { MAX_CATEGORIES, type Settings } from "@content-clam/shared";
import { useHiddenCounts, useSettings, useStatus } from "../../ui/useBackground";
import { sendToBackground, type Status } from "../../lib/messages";

export function Popup() {
  const { settings, save } = useSettings();
  const { status } = useStatus();
  const counts = useHiddenCounts();
  const [newCategory, setNewCategory] = useState("");

  if (!settings) return <div className="cc-pop" />;

  const updateCategories = (categories: Settings["categories"]) => save({ ...settings, categories });
  const toggleCategory = (id: string, enabled: boolean) =>
    updateCategories(settings.categories.map((c) => (c.id === id ? { ...c, enabled, updatedAt: Date.now() } : c)));
  const removeCategory = (id: string) => updateCategories(settings.categories.filter((c) => c.id !== id));
  const canAdd = newCategory.trim().length > 0 && settings.categories.length < MAX_CATEGORIES;
  const addCategory = () => {
    if (!canAdd) return;
    const name = newCategory.trim();
    updateCategories([...settings.categories, { id: crypto.randomUUID(), name, description: name, enabled: true, updatedAt: Date.now() }]);
    setNewCategory("");
  };
  const openOptions = () => chrome.runtime.openOptionsPage();

  return (
    <div className="cc-pop">
      <div className="header">
        <h1 className="title">
          Content
          <br />
          Clam
        </h1>
        <img src="/brand/content-clam-logo.png" alt="" />
      </div>
      <div className="rule thick" style={{ marginTop: 16 }} />
      <div className="rule" style={{ marginTop: 3 }} />

      <FundingNote status={status} />

      <span className="eyebrow" style={{ marginTop: 24 }}>
        Feed rules
      </span>
      <div className="rows" style={{ marginTop: 12 }}>
        <div className="item">
          <span className="name">Hide Shorts</span>
          <div className="dots" />
          <Toggle on={settings.hideShorts} label="Toggle hide Shorts" onToggle={(on) => save({ ...settings, hideShorts: on })} />
          <span className="end-gap" />
        </div>
        <div className="item">
          <span className="name">Keep subscriptions</span>
          <div className="dots" />
          <Toggle on={settings.keepSubscribed} label="Toggle keep subscribed channels" onToggle={(on) => save({ ...settings, keepSubscribed: on })} />
          <span className="end-gap" />
        </div>
        <div className="item">
          <span className="name">Block categories</span>
          <div className="dots" />
          <Toggle on={!settings.paused} label="Toggle all category filters" onToggle={(on) => save({ ...settings, paused: !on })} />
          <span className="end-gap" />
        </div>
      </div>

      <div className="rule soft" style={{ marginTop: 20 }} />

      <div className="header" style={{ alignItems: "baseline", marginTop: 22 }}>
        <span className="eyebrow">Blocked categories</span>
        <span className="eyebrow soft" style={{ paddingRight: 67 }}>
          Hidden this week
        </span>
      </div>

      <div className={`rows list${settings.paused ? " off" : ""}`} style={{ marginTop: 11 }}>
        {settings.categories.map((c) => (
          <div key={c.id} className="item">
            <span className="name">{c.name}</span>
            <div className="dots" style={{ marginInline: 10 }} />
            <span className="count">{counts[c.id] ?? 0}</span>
            <Toggle on={c.enabled} label={`Toggle ${c.name}`} onToggle={(on) => toggleCategory(c.id, on)} />
            <button type="button" className="remove" aria-label={`Remove ${c.name}`} onClick={() => removeCategory(c.id)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <form
        className="add"
        onSubmit={(e) => {
          e.preventDefault();
          addCategory();
        }}
      >
        <label htmlFor="cc-add" className="sr-only">
          Add a category
        </label>
        <input
          id="cc-add"
          type="text"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="Add a topic or category"
          autoComplete="off"
        />
        <button type="submit" disabled={!canAdd}>
          Add
        </button>
      </form>

      <div className="spacer" />

      <div className="rule" />
      <button type="button" className="footer" onClick={openOptions}>
        <span>Open full settings</span>
        <span className="arrow">→</span>
      </button>
    </div>
  );
}

function Toggle({ on, label, onToggle }: { on: boolean; label: string; onToggle: (on: boolean) => void }) {
  return <button type="button" className="toggle" aria-pressed={on} aria-label={label} onClick={() => onToggle(!on)} />;
}

function FundingNote({ status }: { status: Status | null }) {
  if (!status) return null;
  if (status.fundingMode === "personal-key") {
    if (status.lastError) return <p className="note error">Last analysis failed: {status.lastError}</p>;
    if (!status.hasPersonalKey) {
      return (
        <p className="note">
          Add your API key in <button onClick={() => chrome.runtime.openOptionsPage()}>settings</button>.
        </p>
      );
    }
    return null;
  }
  if (status.fundingMode === "hosted") {
    if (!status.signedIn) {
      return (
        <p className="note">
          Not signed in. <button onClick={() => sendToBackground({ type: "openSignIn" })}>Sign in</button>
        </p>
      );
    }
    return <p className="note">{status.balance ?? 0} credits left</p>;
  }
  return (
    <p className="note">
      Analyses are off. <button onClick={() => chrome.runtime.openOptionsPage()}>Choose how to pay</button>
    </p>
  );
}
