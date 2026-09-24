import { useCallback, useEffect, useState } from "react";
import type { Settings } from "@content-clam/shared";
import { sendToBackground, type Status } from "../lib/messages";

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const refresh = useCallback(async () => {
    const response = await sendToBackground({ type: "getSettings" });
    if (response.type === "settings") setSettings(response.settings);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const save = useCallback(async (next: Settings) => {
    setSettings(next);
    await sendToBackground({ type: "updateSettings", settings: next });
  }, []);
  return { settings, save, refresh };
}

export function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const refresh = useCallback(async () => {
    const response = await sendToBackground({ type: "getStatus" });
    if (response.type === "status") setStatus(response.status);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { status, refresh };
}

export function useHiddenCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    void sendToBackground({ type: "getHiddenCounts" }).then((response) => {
      if (response.type === "hiddenCounts") setCounts(response.counts);
    });
  }, []);
  return counts;
}
