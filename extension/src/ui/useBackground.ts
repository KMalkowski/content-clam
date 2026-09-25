import { useCallback, useEffect, useState } from "react";
import type { Settings } from "@content-clam/shared";
import type { HiddenCounts } from "../lib/hiddenCounts";
import { sendToBackground, type Status } from "../lib/messages";
import type { SettingsChange } from "../lib/settings";
import { settingsItem, syncAccountsItem } from "../lib/storage";

export type ChangeSettings = (change: SettingsChange) => Promise<Settings | null>;

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await sendToBackground({ type: "getSettings" });
      if (response.type === "settings") setSettings(response.settings);
    } catch (e) {
      setError(messageOf(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
    return settingsItem.watch(() => void refresh());
  }, [refresh]);
  const change = useCallback<ChangeSettings>(async (next) => {
    try {
      const response = await sendToBackground({ type: "changeSettings", change: next });
      const settings = response.type === "settings" ? response.settings : null;
      if (settings) setSettings(settings);
      setError(null);
      return settings;
    } catch (e) {
      setError(messageOf(e));
      return null;
    }
  }, []);
  return { settings, change, error, refresh };
}

export function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const refresh = useCallback(async () => {
    const response = await sendToBackground({ type: "getStatus" }).catch(() => null);
    if (response?.type === "status") setStatus(response.status);
  }, []);
  useEffect(() => {
    void refresh();
    return syncAccountsItem.watch(() => void refresh());
  }, [refresh]);
  return { status, refresh };
}

export function useHiddenCounts() {
  const [counts, setCounts] = useState<HiddenCounts | null>(null);
  useEffect(() => {
    void sendToBackground({ type: "getHiddenCounts" })
      .then((response) => {
        if (response.type === "hiddenCounts") setCounts(response.counts);
      })
      .catch(() => undefined);
  }, []);
  return counts;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
