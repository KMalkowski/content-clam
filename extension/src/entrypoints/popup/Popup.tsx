import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MAX_CATEGORIES, MAX_DESCRIPTION_CHARS, type Category, type Settings } from "@content-clam/shared";
import { type ChangeSettings, useHiddenCounts, useSettings, useStatus } from "../../ui/useBackground";
import type { HiddenCounts } from "../../lib/hiddenCounts";
import { sendToBackground, type Status } from "../../lib/messages";

const MAX_NAME_CHARS = 40;
const UNDO_MS = 6000;

const SUGGESTIONS = [
  { name: "True crime", description: "True crime stories, case breakdowns and unsolved-mystery deep dives." },
  { name: "Unboxing", description: "Unboxing and first-impressions videos of new products." },
  { name: "Crypto", description: "Cryptocurrency news, coin picks and trading tips." },
  { name: "Mukbang", description: "Eating shows and large-meal challenge videos." },
  { name: "Celebrity news", description: "Celebrity news, red-carpet coverage and entertainment gossip." },
];

interface Removed {
  category: Category;
  index: number;
}

const openOptions = () => chrome.runtime.openOptionsPage();

export function Popup() {
  const { settings, change, error } = useSettings();
  const { status } = useStatus();
  const counts = useHiddenCounts();
  const onYouTube = useOnYouTube();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removed, setRemoved] = useUndo();

  if (!settings) return <div className="cc-pop" />;

  const editing = settings.categories.find((c) => c.id === editingId);
  if (editing) {
    return (
      <CategoryEditor
        key={editing.id}
        category={editing}
        categories={settings.categories}
        count={counts?.byCategory[editing.id] ?? 0}
        saveError={error}
        change={change}
        onClose={() => setEditingId(null)}
      />
    );
  }

  const paused = settings.paused;
  const remove = async (category: Category) => {
    const index = settings.categories.indexOf(category);
    if (await change({ type: "removeCategory", id: category.id })) setRemoved({ category, index });
  };
  const undo = async () => {
    if (removed && (await change({ type: "restoreCategory", category: removed.category, index: removed.index }))) setRemoved(null);
  };

  const footer = removed ? (
    <div role="status" className="undo">
      <span>
        Removed <span className="undo-name">{removed.category.name}</span>
      </span>
      <button type="button" className="action accent" onClick={undo}>
        Undo
      </button>
    </div>
  ) : (
    <button type="button" className="settings-link" onClick={openOptions}>
      <span>Open full settings</span>
      <span className="arrow">→</span>
    </button>
  );

  return (
    <Frame footer={footer}>
      <div className="summary">
        <Summary status={status} counts={counts} onYouTube={onYouTube} />
      </div>

      <div className="grid rules-head">
        <span className="eyebrow">Feed rules</span>
        <span className="eyebrow hidden-label">Hidden</span>
      </div>
      <div className="rows rules">
        <RuleRow
          name="Hide Shorts"
          count={counts?.shorts}
          on={settings.hideShorts}
          onToggle={(value) => change({ type: "setFlag", flag: "hideShorts", value })}
        />
        <RuleRow
          name="Keep subscriptions"
          info={<SubscriptionsTip />}
          on={settings.keepSubscribed}
          onToggle={(value) => change({ type: "setFlag", flag: "keepSubscribed", value })}
        />
        <RuleRow
          name="Block categories"
          count={counts?.categoryVideos}
          on={!paused}
          onToggle={(on) => change({ type: "setFlag", flag: "paused", value: !on })}
        />
      </div>

      <div className="rule soft section-rule" />

      <div className="section-head">
        <span className="eyebrow">Blocked categories</span>
        {paused && <span className="paused">Paused</span>}
      </div>

      <CategoryList
        categories={settings.categories}
        counts={counts?.byCategory ?? {}}
        paused={paused}
        onEdit={setEditingId}
        onToggle={(c) => change({ type: "editCategory", id: c.id, patch: { enabled: !c.enabled } })}
        onRemove={remove}
      />
      <AddCategory settings={settings} saveError={error} change={change} onAdded={setEditingId} />
    </Frame>
  );
}

function Frame({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <div className="cc-pop">
      <div className="body">
        <div className="header">
          <span className="title">Content Clam</span>
          <img src="/brand/content-clam-logo.png" alt="Content Clam" />
        </div>
        <div className="rule thick" />
        <div className="rule double" />
        {children}
      </div>
      <div className="foot">
        <div className="rule" />
        <div className="footer">{footer}</div>
      </div>
    </div>
  );
}

function Summary({ status, counts, onYouTube }: { status: Status | null; counts: HiddenCounts | null; onYouTube: boolean | null }) {
  const warning = fundingWarning(status);
  if (warning) {
    return (
      <p role="status" className="note">
        {warning}
      </p>
    );
  }
  if (onYouTube === false) return <p className="note">Open a YouTube tab to start filtering.</p>;
  if (!counts || onYouTube === null) return null;
  const total = counts.shorts + counts.categoryVideos;
  return (
    <p className="kept">
      <span className="total">
        {total.toLocaleString("en-US")} {total === 1 ? "video" : "videos"}
      </span>{" "}
      kept out of your feed this week.
    </p>
  );
}

function fundingWarning(status: Status | null): ReactNode {
  if (!status) return null;
  const link = (label: string, onClick: () => void) => (
    <button type="button" className="note-link" onClick={onClick}>
      {label}
    </button>
  );
  if (status.fundingMode === "personal-key") {
    if (status.lastError) return <span title={status.lastError}>Last analysis failed: {status.lastError}</span>;
    if (!status.hasPersonalKey) return <>Add your API key in {link("settings", openOptions)}.</>;
    return null;
  }
  if (status.fundingMode === "hosted") {
    if (!status.signedIn) return <>Not signed in. {link("Sign in", () => void sendToBackground({ type: "openSignIn" }))}</>;
    if (status.balance === 0) return <>No credits left. {link("Add credits", openOptions)}</>;
    return null;
  }
  return <>Analyses are off. {link("Choose how to pay", openOptions)}</>;
}

function RuleRow({ name, info, count, on, onToggle }: { name: string; info?: ReactNode; count?: number; on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <div className="grid item">
      <div className="lead">
        <span className="name">{name}</span>
        {info}
        <div className="dots" />
      </div>
      <span className="count">{count}</span>
      <Switch on={on} label={name} onToggle={onToggle} />
    </div>
  );
}

function SubscriptionsTip() {
  const [open, setOpen] = useState(false);
  return (
    <span className="tip-wrap">
      <button
        type="button"
        className="info"
        aria-label="About Keep subscriptions"
        aria-describedby="cc-subs-tip"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v6" />
          <circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
        </svg>
      </button>
      <span id="cc-subs-tip" role="tooltip" className={open ? "tip is-open" : "tip"}>
        Videos from channels you’re subscribed to are never hidden by your blocked categories.
      </span>
    </span>
  );
}

function CategoryList({
  categories,
  counts,
  paused,
  onEdit,
  onToggle,
  onRemove,
}: {
  categories: Category[];
  counts: Record<string, number>;
  paused: boolean;
  onEdit: (id: string) => void;
  onToggle: (category: Category) => void;
  onRemove: (category: Category) => void;
}) {
  if (!categories.length) {
    return (
      <div className="empty">
        <span className="empty-title">Nothing blocked yet.</span>
        <span className="empty-hint">Add a topic like F1, or a kind of video like reaction content.</span>
      </div>
    );
  }
  return (
    <div className={`rows list${paused ? " off" : ""}`}>
      {categories.map((c) => (
        <div key={c.id} className="category-grid item category">
          <button type="button" className="remove" aria-label={`Remove ${c.name}`} onClick={() => onRemove(c)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div className="lead">
            <button type="button" className="category-name" aria-label={`Edit ${c.name}`} onClick={() => onEdit(c.id)}>
              <span className="label">{c.name}</span>
              <svg
                className="pen"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 20h4L19 9l-4-4L4 16z" />
                <path d="M13.5 6.5l4 4" />
              </svg>
            </button>
            <div className="dots" />
          </div>
          <span className="count">{counts[c.id] ?? 0}</span>
          <Switch on={c.enabled} label={c.name} disabled={paused} onToggle={() => onToggle(c)} />
        </div>
      ))}
    </div>
  );
}

function AddCategory({
  settings,
  saveError,
  change,
  onAdded,
}: {
  settings: Settings;
  saveError: string | null;
  change: ChangeSettings;
  onAdded: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = settings.categories.length >= MAX_CATEGORIES;
  const taken = new Set(settings.categories.map((c) => c.name.toLowerCase()));
  const suggestions = SUGGESTIONS.filter((s) => !taken.has(s.name.toLowerCase())).slice(0, 3);

  const add = async (name: string, description: string, openEditor: boolean) => {
    if (taken.has(name.toLowerCase())) return setError(`${name} is already on your list.`);
    const next = await change({ type: "addCategory", name, description });
    if (!next) return;
    setDraft("");
    setError(null);
    const added = next.categories.at(-1);
    if (openEditor && added) onAdded(added.id);
  };
  const submit = () => {
    const name = draft.trim();
    if (name && !full) void add(name, name, true);
  };
  const message = error ?? (saveError && `Could not save: ${saveError}`) ?? (full ? `You can block up to ${MAX_CATEGORIES} categories.` : null);

  return (
    <>
      <div className="add">
        <label htmlFor="cc-add" className="sr-only">
          Add a topic or kind of video
        </label>
        <input
          id="cc-add"
          type="text"
          value={draft}
          maxLength={MAX_NAME_CHARS}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            submit();
          }}
          placeholder="Add a topic or kind of video"
          autoComplete="off"
        />
        <button type="button" className="action accent" disabled={!draft.trim() || full} onClick={submit}>
          Add
        </button>
      </div>
      <div className="hint-line">
        {message ? (
          <span role="status" className="error">
            {message}
          </span>
        ) : (
          suggestions.length > 0 && (
            <>
              <span className="try">Try</span>
              {suggestions.map((s) => (
                <button key={s.name} type="button" className="suggestion" onClick={() => void add(s.name, s.description, false)}>
                  {s.name}
                </button>
              ))}
            </>
          )
        )}
      </div>
    </>
  );
}

function CategoryEditor({
  category,
  categories,
  count,
  saveError,
  change,
  onClose,
}: {
  category: Category;
  categories: Category[];
  count: number;
  saveError: string | null;
  change: ChangeSettings;
  onClose: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description === category.name ? "" : category.description);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give this category a name.");
    if (categories.some((c) => c.id !== category.id && c.name.toLowerCase() === trimmed.toLowerCase())) return setError(`${trimmed} is already on your list.`);
    const patch = { name: trimmed, description: description.trim() || trimmed };
    if (await change({ type: "editCategory", id: category.id, patch })) onClose();
  };
  const onKeyDown = (saveKey: (e: KeyboardEvent) => boolean) => (e: KeyboardEvent) => {
    if (e.key === "Enter" && saveKey(e)) {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };
  const problem = error ?? (saveError && `Could not save: ${saveError}`);

  const footer = (
    <div className="editor-actions">
      <button type="button" className="action" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="action accent" onClick={() => void save()}>
        Save
      </button>
    </div>
  );

  return (
    <Frame footer={footer}>
      <div className="editor">
        <label htmlFor="cc-title" className="eyebrow">
          Category
        </label>
        <input
          id="cc-title"
          className="editor-title"
          type="text"
          value={name}
          maxLength={Math.max(MAX_NAME_CHARS, category.name.length)}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown(() => true)}
          placeholder="Category name"
          autoComplete="off"
        />
        <span className="editor-count">
          <span className="number">{count}</span> hidden this week
        </span>
        <label htmlFor="cc-desc" className="eyebrow editor-label">
          What should Clam hide?
        </label>
        <textarea
          id="cc-desc"
          value={description}
          maxLength={MAX_DESCRIPTION_CHARS}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={onKeyDown((e) => e.metaKey || e.ctrlKey)}
          placeholder={`Describe ${name.trim() || "this category"} in a sentence, so Clam knows what to catch.`}
        />
        <div className="editor-foot">
          <span role="status" className={problem ? "helper error" : "helper"}>
            {problem ?? "Clam reads this to decide which videos belong here."}
          </span>
          <span className="char-count">
            {description.length.toLocaleString("en-US")} / {MAX_DESCRIPTION_CHARS.toLocaleString("en-US")}
          </span>
        </div>
      </div>
    </Frame>
  );
}

function Switch({ on, label, disabled, onToggle }: { on: boolean; label: string; disabled?: boolean; onToggle: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" className="toggle" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onToggle(!on)}>
      <span className="track" />
    </button>
  );
}

function useOnYouTube(): boolean | null {
  const [onYouTube, setOnYouTube] = useState<boolean | null>(null);
  useEffect(() => {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => setOnYouTube(/^https?:\/\/([^/]+\.)?youtube\.com\//.test(tab?.url ?? "")))
      .catch(() => setOnYouTube(false));
  }, []);
  return onYouTube;
}

function useUndo() {
  const [removed, setRemovedState] = useState<Removed | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const setRemoved = (next: Removed | null) => {
    clearTimeout(timer.current);
    setRemovedState(next);
    if (next) timer.current = window.setTimeout(() => setRemovedState(null), UNDO_MS);
  };
  return [removed, setRemoved] as const;
}
