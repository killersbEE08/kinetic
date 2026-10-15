"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck } from "@/lib/deck/schema";
import { applyDeckPatch, PatchError, type PatchOp } from "@/lib/deck/patch";
import { ApiError, useBackend } from "@/lib/client/backend";

interface HistoryEntry {
  ops: PatchOp[];
  inverse: PatchOp[];
  label: string;
}

export type SaveState = "saved" | "saving" | "error" | "conflict" | "offline";

/**
 * Deck editing state. Every change is a JSON Patch: applied locally at once (no waiting),
 * recorded with its inverse for undo/redo, and sent to the server in order. The server
 * rejects a save if someone else changed the deck in between (409 → "conflict").
 */
export function useDeckEditor(id: string) {
  const backend = useBackend();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [undoStack, setUndoState] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoState] = useState<HistoryEntry[]>([]);
  // Refs mirror the stacks so undo/redo never run side effects inside state updaters.
  const undoRef = useRef<HistoryEntry[]>([]);
  const redoRef = useRef<HistoryEntry[]>([]);
  const setUndo = useCallback((v: HistoryEntry[]) => {
    undoRef.current = v;
    setUndoState(v);
  }, []);
  const setRedo = useCallback((v: HistoryEntry[]) => {
    redoRef.current = v;
    setRedoState(v);
  }, []);

  const deckRef = useRef<Deck | null>(null);
  const serverVersion = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const blocked = useRef(false);

  const apply = useCallback(
    (d: Deck) => {
      deckRef.current = d;
      serverVersion.current = d.version;
      blocked.current = false;
      pending.current = 0;
      setLoadError(null);
      setSaveError(null);
      setDeck(d);
      setSaveState("saved");
      setUndo([]);
      setRedo([]);
    },
    [setUndo, setRedo],
  );

  const load = useCallback(async () => {
    try {
      apply(await backend.getDeck(id));
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Could not open this deck.");
    }
  }, [backend, id, apply]);

  useEffect(() => {
    if (!backend.ready || !backend.signedIn) return;
    let cancelled = false;
    backend
      .getDeck(id)
      .then((d) => !cancelled && apply(d))
      .catch((e) => !cancelled && setLoadError(e instanceof ApiError ? e.message : "Could not open this deck."));
    return () => {
      cancelled = true;
    };
  }, [backend, id, apply]);

  const save = useCallback(
    (ops: PatchOp[], author: "user" | "ai") => {
      pending.current += 1;
      setSaveState("saving");
      queue.current = queue.current.then(async () => {
        if (blocked.current) return;
        try {
          serverVersion.current = await backend.patchDeck(id, serverVersion.current, ops, author);
          if (deckRef.current) deckRef.current = { ...deckRef.current, version: serverVersion.current };
        } catch (e) {
          blocked.current = true;
          if (e instanceof ApiError && e.status === 409) {
            setSaveState("conflict");
            setSaveError(e.message);
          } else {
            setSaveState("error");
            setSaveError(e instanceof ApiError ? e.message : "Couldn't save your last change. Check your connection.");
          }
          return;
        } finally {
          pending.current -= 1;
        }
        if (pending.current === 0 && !blocked.current) setSaveState("saved");
      });
    },
    [backend, id],
  );

  /** Applies ops locally and queues them for saving. Returns false if the ops were invalid. */
  const commit = useCallback(
    (ops: PatchOp[], opts: { label: string; author?: "user" | "ai"; history?: "push" | "undo" | "redo" } = { label: "Edit" }): boolean => {
      const current = deckRef.current;
      if (!current || !ops.length) return false;
      let result;
      try {
        result = applyDeckPatch(current, ops);
      } catch (e) {
        setSaveError(e instanceof PatchError ? e.message : "That change could not be applied.");
        return false;
      }
      const next = { ...result.doc, version: current.version };
      deckRef.current = next;
      setDeck(next);
      const entry = { ops, inverse: result.inverse, label: opts.label };
      if (opts.history === "undo") setRedo([...redoRef.current, { ...entry, ops: result.inverse, inverse: ops }]);
      else if (opts.history === "redo") setUndo([...undoRef.current, { ...entry, ops: result.inverse, inverse: ops }]);
      else {
        setUndo([...undoRef.current.slice(-199), entry]);
        setRedo([]);
      }
      save(ops, opts.author ?? "user");
      return true;
    },
    [save, setUndo, setRedo],
  );

  const undo = useCallback(() => {
    const last = undoRef.current[undoRef.current.length - 1];
    if (!last) return;
    setUndo(undoRef.current.slice(0, -1));
    commit(last.inverse, { label: last.label, history: "undo" });
  }, [commit, setUndo]);

  const redo = useCallback(() => {
    const last = redoRef.current[redoRef.current.length - 1];
    if (!last) return;
    setRedo(redoRef.current.slice(0, -1));
    commit(last.inverse, { label: last.label, history: "redo" });
  }, [commit, setRedo]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current > 0 || blocked.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return {
    deck,
    loadError,
    reload: load,
    saveState,
    saveError,
    commit,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoLabel: undoStack[undoStack.length - 1]?.label,
  };
}
