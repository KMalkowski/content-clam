import { useState } from "react";
import {
  BUILT_IN_CATEGORIES,
  BUILT_IN_CATEGORY_IDS,
  MAX_ALLOWED_TOPICS,
  MAX_CATEGORIES,
  MAX_DESCRIPTION_CHARS,
  normalizeChannelKey,
  type Settings,
} from "@content-clam/shared";
import { useSettings, useStatus } from "../../ui/useBackground";
import { sendToBackground } from "../../lib/messages";
import { env } from "../../lib/env";
import { FundingSection } from "./FundingSection";

export function Options() {
  const { settings, save, refresh } = useSettings();
  const statusHook = useStatus();
  if (!settings) return <main style={{ padding: 24 }}>Loading…</main>;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
      <div className="row">
        <span className="clam" aria-hidden>🐚</span>
        <h1>Content Clam settings</h1>
      </div>
      <p className="muted">
        Videos stay visible unless they match a filter you enabled. Changing a description means matching videos need a fresh analysis, which can use credits.
      </p>

      <FundingSection status={statusHook.status} refreshStatus={statusHook.refresh} refreshSettings={refresh} />

      <section>
        <h2>Shorts</h2>
        <label className="switch">
          <input type="checkbox" checked={settings.hideShorts} onChange={(e) => save({ ...settings, hideShorts: e.target.checked })} />
          Hide Shorts everywhere
        </label>
        <p className="muted">Removes Shorts shelves and cards without analysis or credits. Anything already on screen is blurred instead of removed, so the page does not jump.</p>
      </section>

      <Categories settings={settings} save={save} />
      <Topics settings={settings} save={save} />
      <Channels settings={settings} save={save} />
      <ImportExport settings={settings} save={save} />

      <h2>Privacy</h2>
      <p className="muted">
        Video titles, channel names, and visible descriptions are sent for classification: to the Content Clam service when you use credits, or straight to TypeSafe when you use your own key. Results stay on this device. Nothing about specific videos is stored on our servers.{" "}
        <a href={`${env.webUrl}/privacy`} target="_blank" rel="noreferrer">Privacy details</a>
      </p>
    </main>
  );
}

function Categories({ settings, save }: { settings: Settings; save: (s: Settings) => Promise<void> }) {
  const update = (id: string, patch: Partial<Settings["categories"][number]>) =>
    save({ ...settings, categories: settings.categories.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)) });
  const reset = (id: string) => {
    const builtIn = BUILT_IN_CATEGORIES.find((c) => c.id === id);
    if (builtIn) update(id, { name: builtIn.name, description: builtIn.description });
  };
  const add = () =>
    save({
      ...settings,
      categories: [...settings.categories, { id: crypto.randomUUID(), name: "New category", description: "", enabled: true, updatedAt: Date.now() }],
    });
  const remove = (id: string) => save({ ...settings, categories: settings.categories.filter((c) => c.id !== id) });

  return (
    <section>
      <h2>Filtered categories</h2>
      <div className="stack">
        {settings.categories.map((c) => (
          <div key={c.id} className="card stack">
            <div className="row between">
              <label className="switch">
                <input type="checkbox" checked={c.enabled} onChange={(e) => update(c.id, { enabled: e.target.checked })} />
                <input type="text" value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} style={{ width: 260 }} aria-label="Category name" />
              </label>
              <div className="row">
                {BUILT_IN_CATEGORY_IDS.has(c.id) ? <button onClick={() => reset(c.id)}>Reset</button> : <button onClick={() => remove(c.id)}>Delete</button>}
              </div>
            </div>
            <textarea value={c.description} maxLength={MAX_DESCRIPTION_CHARS} onChange={(e) => update(c.id, { description: e.target.value })} aria-label="Category description" />
            <span className="muted">{c.description.length}/{MAX_DESCRIPTION_CHARS}</span>
          </div>
        ))}
        <button onClick={add} disabled={settings.categories.length >= MAX_CATEGORIES}>Add category</button>
      </div>
    </section>
  );
}

function Topics({ settings, save }: { settings: Settings; save: (s: Settings) => Promise<void> }) {
  const update = (id: string, description: string) =>
    save({ ...settings, allowedTopics: settings.allowedTopics.map((t) => (t.id === id ? { ...t, description, updatedAt: Date.now() } : t)) });
  const add = () => save({ ...settings, allowedTopics: [...settings.allowedTopics, { id: crypto.randomUUID(), description: "", updatedAt: Date.now() }] });
  const remove = (id: string) => save({ ...settings, allowedTopics: settings.allowedTopics.filter((t) => t.id !== id) });
  return (
    <section>
      <h2>Allowed topics</h2>
      <p className="muted">
        A video whose main subject fits one of these topics is never dimmed, even if it matches a category such as clickbait. Mentioning a keyword is not enough.
      </p>
      <div className="stack">
        {settings.allowedTopics.map((t) => (
          <div key={t.id} className="card stack">
            <textarea value={t.description} maxLength={MAX_DESCRIPTION_CHARS} placeholder="Describe the topic, for example: woodworking techniques and tool reviews" onChange={(e) => update(t.id, e.target.value)} />
            <div className="row between">
              <span className="muted">{t.description.length}/{MAX_DESCRIPTION_CHARS}</span>
              <button onClick={() => remove(t.id)}>Delete</button>
            </div>
          </div>
        ))}
        <button onClick={add} disabled={settings.allowedTopics.length >= MAX_ALLOWED_TOPICS}>Add topic</button>
      </div>
    </section>
  );
}

function Channels({ settings, save }: { settings: Settings; save: (s: Settings) => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const channelKey = normalizeChannelKey(draft);
    if (!channelKey || settings.allowedChannels.some((c) => c.channelKey === channelKey)) return;
    save({ ...settings, allowedChannels: [...settings.allowedChannels, { id: crypto.randomUUID(), channelKey, channelName: draft.trim(), updatedAt: Date.now() }] });
    setDraft("");
  };
  const remove = (id: string) => save({ ...settings, allowedChannels: settings.allowedChannels.filter((c) => c.id !== id) });
  return (
    <section>
      <h2>Allowed channels</h2>
      <p className="muted">Videos from these channels skip analysis and are never dimmed.</p>
      <div className="stack">
        {settings.allowedChannels.map((c) => (
          <div key={c.id} className="row between card">
            <span>{c.channelName || c.channelKey}</span>
            <button onClick={() => remove(c.id)}>Remove</button>
          </div>
        ))}
        <div className="row">
          <input type="text" value={draft} placeholder="@handle or channel name" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button onClick={add}>Add</button>
        </div>
      </div>
    </section>
  );
}

function ImportExport({ settings, save }: { settings: Settings; save: (s: Settings) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "content-clam-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Settings>;
      if (!Array.isArray(parsed.categories)) throw new Error("File does not contain categories.");
      await save({
        paused: Boolean(parsed.paused),
        hideShorts: Boolean(parsed.hideShorts),
        categories: parsed.categories,
        allowedTopics: parsed.allowedTopics ?? [],
        allowedChannels: parsed.allowedChannels ?? [],
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file.");
    }
  };
  return (
    <section>
      <h2>Import and export</h2>
      <p className="muted">Exports include categories, topics, and channels. API keys are never exported.</p>
      <div className="row">
        <button onClick={exportJson}>Export JSON</button>
        <label className="row">
          <button onClick={() => document.getElementById("cc-import")?.click()}>Import JSON</button>
          <input id="cc-import" type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => importJson(e.target.files?.[0])} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export { sendToBackground };
