import { MAX_USER_ADDED_PARTNERS, STEP_TITLES } from "@shared/constants";
import { PARTNER_KINDS, STEP_ORDER, type AgentEvent, type Brief, type BriefLength, type BriefTone, type BusinessInput, type ComparePayload, type Heatmap, type PartnerKind, type ProofResult, type QlooCallRecord, type RunResult, type StepId, type StoredEvent } from "@shared/types";
import { toast } from "sonner";
import { create } from "zustand";
import { ApiError, cancelRun, createBrief, createRun, createShare, expandRun, getCallLog, getHealth, getHeatmap, getMeta, getRun, postCheck, postCompare, postProof, type Health, type Meta } from "@/lib/api";
import { openRunStream } from "@/lib/sse";
import { clearRunId, readInput, readRunId, saveInput, saveRunId } from "@/lib/storage";

export type Stage = "setup" | "researching" | "results";
export type ResultsView = "overview" | "shortlist";
export type StepState = "waiting" | "running" | "done" | "retry";

export interface StepView {
  id: StepId;
  title: string;
  state: StepState;
  summary?: string;
  note?: string;
  retry?: string;
}

const defaultInput: BusinessInput = {
  businessType: "cafe",
  city: "London",
  anchors: [],
};

let stopStream: (() => void) | null = null;
let streamToken = 0;

function closeStream(): void {
  stopStream?.();
  stopStream = null;
  streamToken += 1;
}

export function deriveSteps(events: StoredEvent[]): StepView[] {
  const views = new Map<StepId, StepView>();
  for (const id of STEP_ORDER) views.set(id, { id, title: STEP_TITLES[id], state: "waiting" });
  for (const event of events) {
    if (!("step" in event) || event.step === undefined) continue;
    const current = views.get(event.step);
    if (!current) continue;
    if (event.type === "step_started") current.state = "running";
    if (event.type === "step_completed") {
      current.state = "done";
      current.summary = event.summary;
    }
    if (event.type === "step_note") current.note = event.text;
    if (event.type === "retry") {
      current.state = "retry";
      current.retry = event.reason;
    }
  }
  return STEP_ORDER.map((id) => views.get(id) ?? { id, title: STEP_TITLES[id], state: "waiting" });
}

interface VennState {
  stage: Stage;
  settling: boolean;
  meta: Meta | null;
  health: Health | null;
  input: BusinessInput;
  runId: string | null;
  events: StoredEvent[];
  result: RunResult | null;
  selectedId: string | null;
  hoverId: string | null;
  /** Overview taste focus (a shared taste theme id), next to the selected partner. Highlight
   * precedence: hovered partner, then pinned taste, then nothing. */
  tasteId: string | null;
  pinnedIds: Set<string>;
  surprise: number;
  kindFilter: Set<PartnerKind>;
  view: ResultsView;
  briefOpen: boolean;
  briefPartnerId: string | null;
  briefVariant: number;
  briefTone: BriefTone;
  briefLength: BriefLength;
  briefLoading: boolean;
  briefs: Record<string, Brief>;
  heatmaps: Record<string, Heatmap | null>;
  proof: ProofResult | null;
  proofLoading: boolean;
  checking: boolean;
  compare: Record<string, ComparePayload>;
  compareOpenId: string | null;
  compareLoading: boolean;
  callLogOpen: boolean;
  calls: QlooCallRecord[];
  callsLoading: boolean;
  sharing: boolean;
  error: string | null;
  boot: () => Promise<void>;
  startRun: (input: BusinessInput) => Promise<void>;
  cancelRun: () => Promise<void>;
  reset: () => void;
  select: (id: string | null) => void;
  setHover: (id: string | null) => void;
  setTaste: (id: string | null) => void;
  toggleTaste: (id: string) => void;
  togglePin: (id: string) => void;
  setSurprise: (value: number) => void;
  toggleKind: (kind: PartnerKind) => void;
  setView: (view: ResultsView) => void;
  openBrief: (partnerId: string) => Promise<void>;
  closeBrief: () => void;
  nextBriefVariant: () => Promise<void>;
  setBriefTone: (tone: BriefTone) => Promise<void>;
  setBriefLength: (length: BriefLength) => Promise<void>;
  regenerateBrief: () => Promise<void>;
  expandPartner: (partnerId: string) => Promise<void>;
  loadHeatmap: (partnerId: string) => Promise<Heatmap | null>;
  loadProof: () => Promise<void>;
  checkPartner: (name: string, entityHint?: string) => Promise<void>;
  loadCompare: (partnerId: string) => Promise<void>;
  closeCompare: () => void;
  openCallLog: () => Promise<void>;
  closeCallLog: () => void;
  shareRun: () => Promise<void>;
  setInput: (input: BusinessInput) => void;
}

function listen(runId: string, lastId: number, get: () => VennState, set: (partial: Partial<VennState>) => void): void {
  closeStream();
  const token = streamToken;
  stopStream = openRunStream(
    runId,
    lastId,
    (event, id) => {
      if (token !== streamToken) return;
      applyEvent(event, id, get, set);
    },
    (message) => {
      if (token !== streamToken) return;
      set({ error: message });
    },
  );
}

function applyEvent(event: AgentEvent, id: number, get: () => VennState, set: (partial: Partial<VennState>) => void): void {
  const state = get();
  const stored: StoredEvent = { ...event, id: id || state.events.length + 1, at: Date.now() };
  if (state.events.some((item) => item.id === stored.id && stored.id > 0)) return;
  const events = [...state.events, stored];
  if (event.type === "result") {
    set({ events, result: event.result, settling: true, error: null });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      if (get().result?.runId === event.result.runId) set({ stage: "results", settling: false });
    }, reduced ? 0 : 2800);
    return;
  }
  if (event.type === "error") {
    set({ events, error: event.message, settling: false });
    return;
  }
  if (event.type === "cancelled") {
    closeStream();
    clearRunId();
    set({ events, stage: "setup", error: null, settling: false });
    return;
  }
  set({ events });
}

export const useVenn = create<VennState>((set, get) => ({
  stage: "setup",
  settling: false,
  meta: null,
  health: null,
  input: defaultInput,
  runId: null,
  events: [],
  result: null,
  selectedId: null,
  hoverId: null,
  tasteId: null,
  pinnedIds: new Set(),
  surprise: 0.35,
  kindFilter: new Set(PARTNER_KINDS),
  view: "overview",
  briefOpen: false,
  briefPartnerId: null,
  briefVariant: 0,
  briefTone: "warm",
  briefLength: "standard",
  briefLoading: false,
  briefs: {},
  heatmaps: {},
  proof: null,
  proofLoading: false,
  checking: false,
  compare: {},
  compareOpenId: null,
  compareLoading: false,
  callLogOpen: false,
  calls: [],
  callsLoading: false,
  sharing: false,
  error: null,

  setInput: (input) => {
    saveInput(input);
    set({ input });
  },

  boot: async () => {
    const saved = readInput();
    if (saved) set({ input: saved });
    try {
      const [health, meta] = await Promise.all([getHealth(), getMeta()]);
      set({ health, meta });
    } catch {
      set({ health: null });
    }
    const runId = readRunId();
    if (!runId) return;
    try {
      const data = await getRun(runId);
      if (data.status === "done" && data.result) {
        set({ runId, result: data.result, input: data.result.input, stage: "results", events: [] });
        return;
      }
      if (data.status === "running") {
        set({ runId, stage: "researching", error: null, events: [] });
        listen(runId, 0, get, set);
        return;
      }
      if (data.status === "error") {
        set({ runId, stage: "researching", error: data.error ?? "The search stopped before it finished." });
        return;
      }
      clearRunId();
    } catch (error) {
      clearRunId();
      if (!(error instanceof ApiError) || error.status !== 404) {
        set({ error: "The last search could not be restored." });
      }
    }
  },

  startRun: async (input) => {
    closeStream();
    saveInput(input);
    set({
      input,
      stage: "researching",
      events: [],
      result: null,
      error: null,
      settling: false,
      selectedId: null,
      tasteId: null,
      briefOpen: false,
      briefTone: "warm",
      briefLength: "standard",
      briefs: {},
      heatmaps: {},
      proof: null,
      pinnedIds: new Set(),
      compare: {},
      compareOpenId: null,
      callLogOpen: false,
      calls: [],
    });
    try {
      const { runId } = await createRun(input);
      saveRunId(runId);
      set({ runId });
      listen(runId, 0, get, set);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "The search could not be started. Please try again.";
      set({ stage: "researching", error: message });
    }
  },

  cancelRun: async () => {
    const { runId } = get();
    closeStream();
    if (runId) {
      try {
        await cancelRun(runId);
      } catch {
        // The local screen still returns to the form.
      }
    }
    clearRunId();
    set({ stage: "setup", events: [], error: null, settling: false, runId: null });
  },

  reset: () => {
    closeStream();
    clearRunId();
    set({
      stage: "setup",
      runId: null,
      events: [],
      result: null,
      error: null,
      settling: false,
      selectedId: null,
      tasteId: null,
      briefOpen: false,
      hoverId: null,
      proof: null,
      compare: {},
      compareOpenId: null,
      callLogOpen: false,
      calls: [],
    });
  },

  select: (id) => set({ selectedId: id }),
  setHover: (id) => set({ hoverId: id }),
  setTaste: (id) => set({ tasteId: id }),
  toggleTaste: (id) => set((state) => ({ tasteId: state.tasteId === id ? null : id })),
  togglePin: (id) => {
    const next = new Set(get().pinnedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ pinnedIds: next });
  },
  setSurprise: (value) => set({ surprise: value }),
  toggleKind: (kind) => {
    const next = new Set(get().kindFilter);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    set({ kindFilter: next });
  },
  setView: (view) => {
    set({ view });
  },

  openBrief: async (partnerId) => {
    set({ briefOpen: true, briefPartnerId: partnerId, briefVariant: 0 });
    const { briefTone, briefLength } = get();
    await loadBrief(partnerId, 0, briefTone, briefLength, get, set);
  },

  closeBrief: () => set({ briefOpen: false }),

  nextBriefVariant: async () => {
    const { briefPartnerId, briefVariant, briefTone, briefLength } = get();
    if (!briefPartnerId) return;
    const next = (briefVariant + 1) % 3;
    set({ briefVariant: next });
    await loadBrief(briefPartnerId, next, briefTone, briefLength, get, set);
  },

  setBriefTone: async (tone) => {
    const { briefPartnerId, briefVariant, briefLength } = get();
    set({ briefTone: tone });
    if (!briefPartnerId) return;
    await loadBrief(briefPartnerId, briefVariant, tone, briefLength, get, set);
  },

  setBriefLength: async (length) => {
    const { briefPartnerId, briefVariant, briefTone } = get();
    set({ briefLength: length });
    if (!briefPartnerId) return;
    await loadBrief(briefPartnerId, briefVariant, briefTone, length, get, set);
  },

  regenerateBrief: async () => {
    const { briefPartnerId, briefVariant, briefTone, briefLength } = get();
    if (!briefPartnerId) return;
    await loadBrief(briefPartnerId, briefVariant, briefTone, briefLength, get, set, { force: true });
  },

  expandPartner: async (partnerId) => {
    const { runId, result } = get();
    if (!runId || !result) return;
    try {
      const response = await expandRun(runId, partnerId);
      const fresh = await getRun(runId);
      if (fresh.result) set({ result: fresh.result });
      if (response.added.length === 0) toast(response.message ?? "No further connections in the demo set.");
      else toast(response.added.length === 1 ? "Added 1 connection." : `Added ${response.added.length} connections.`);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Those connections could not be added.");
    }
  },

  loadHeatmap: async (partnerId) => {
    const { runId, heatmaps } = get();
    if (!runId) return null;
    if (partnerId in heatmaps) return heatmaps[partnerId] ?? null;
    try {
      const heatmap = await getHeatmap(runId, partnerId);
      set({ heatmaps: { ...get().heatmaps, [partnerId]: heatmap } });
      return heatmap;
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "The map could not be loaded.");
      return null;
    }
  },

  loadProof: async () => {
    const { runId, proof, proofLoading } = get();
    if (!runId || proof || proofLoading) return;
    set({ proofLoading: true });
    try {
      const payload = await postProof(runId);
      set({ proof: payload });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "The proof view could not be loaded.");
    } finally {
      set({ proofLoading: false });
    }
  },

  checkPartner: async (name, entityHint) => {
    const { runId, result, checking } = get();
    if (!runId || !result || checking) return;
    const userAddedCount = result.partners.filter((partner) => partner.userAdded).length;
    if (userAddedCount >= MAX_USER_ADDED_PARTNERS) {
      toast(`You can check up to ${MAX_USER_ADDED_PARTNERS} of your own partners per search.`);
      return;
    }
    set({ checking: true });
    try {
      const response = await postCheck(runId, { name, entityHint });
      const current = get().result;
      if (!current) return;
      const exists = current.partners.some((partner) => partner.id === response.partner.id);
      const partners = exists
        ? current.partners.map((partner) => (partner.id === response.partner.id ? response.partner : partner))
        : [...current.partners, response.partner];
      set({ result: { ...current, partners } });
      toast(response.message ?? `Added "${response.partner.name}" as your pick.`);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "That partner could not be checked.");
    } finally {
      set({ checking: false });
    }
  },

  loadCompare: async (partnerId) => {
    const { runId, compare } = get();
    if (!runId) return;
    set({ compareOpenId: partnerId });
    if (compare[partnerId]) return;
    set({ compareLoading: true });
    try {
      const payload = await postCompare(runId, partnerId);
      set({ compare: { ...get().compare, [partnerId]: payload } });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "The audience compare could not be loaded.");
      set({ compareOpenId: null });
    } finally {
      set({ compareLoading: false });
    }
  },

  closeCompare: () => set({ compareOpenId: null }),

  openCallLog: async () => {
    const { runId, callsLoading } = get();
    if (!runId || callsLoading) return;
    set({ callLogOpen: true, callsLoading: true });
    try {
      const calls = await getCallLog(runId);
      set({ calls });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "The call log could not be loaded.");
    } finally {
      set({ callsLoading: false });
    }
  },

  closeCallLog: () => set({ callLogOpen: false }),

  shareRun: async () => {
    const { runId, sharing } = get();
    if (!runId || sharing) return;
    set({ sharing: true });
    try {
      const { token } = await createShare(runId);
      const url = `${window.location.origin}${window.location.pathname}#share/${token}`;
      await navigator.clipboard.writeText(url);
      toast("Share link copied. It stays live for 7 days.");
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Could not create a share link.");
    } finally {
      set({ sharing: false });
    }
  },
}));

async function loadBrief(
  partnerId: string,
  variant: number,
  tone: BriefTone,
  length: BriefLength,
  get: () => VennState,
  set: (partial: Partial<VennState>) => void,
  opts?: { force?: boolean },
): Promise<void> {
  const { runId, briefs } = get();
  if (!runId) return;
  const key = `${partnerId}:${variant}:${tone}:${length}`;
  if (!opts?.force && briefs[key]) return;
  set({ briefLoading: true });
  try {
    const brief = await createBrief(runId, partnerId, { variant, tone, length, regenerate: opts?.force });
    set({ briefs: { ...get().briefs, [key]: brief } });
  } catch (error) {
    toast(error instanceof ApiError ? error.message : "The brief could not be written.");
  } finally {
    set({ briefLoading: false });
  }
}
