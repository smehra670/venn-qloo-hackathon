/**
 * Outreach Plan board: a small kanban (`To contact` → `Contacted` → `In talks` → `Done`/`Passed`)
 * that lives entirely in `localStorage`, keyed per run. Framework-agnostic on purpose so it can be
 * unit tested without React or a DOM — `PlanView` (see `src/components/results/PlanView.tsx`) is
 * the only place that touches React state.
 */

export const BOARD_VERSION = 1;

export const BOARD_COLUMNS = ["to_contact", "contacted", "in_talks", "done", "passed"] as const;
export type BoardColumnId = (typeof BOARD_COLUMNS)[number];

export const BOARD_COLUMN_LABELS: Record<BoardColumnId, string> = {
  to_contact: "To contact",
  contacted: "Contacted",
  in_talks: "In talks",
  done: "Done",
  passed: "Passed",
};

export const BOARD_NOTES_MAX = 500;

export interface BoardState {
  version: number;
  columns: Record<BoardColumnId, string[]>;
  notes: Record<string, string>;
}

export function emptyBoard(): BoardState {
  return {
    version: BOARD_VERSION,
    columns: {
      to_contact: [],
      contacted: [],
      in_talks: [],
      done: [],
      passed: [],
    },
    notes: {},
  };
}

export function boardStorageKey(runId: string): string {
  return `venn:board:${runId}`;
}

function isColumnId(value: string): value is BoardColumnId {
  return (BOARD_COLUMNS as readonly string[]).includes(value);
}

/** Safe parser: never throws, drops anything that doesn't look right, and refuses to load a
 * board written by a future/incompatible version rather than guessing at its shape. */
export function parseBoard(raw: unknown): BoardState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== BOARD_VERSION) return null;
  if (!value.columns || typeof value.columns !== "object") return null;
  const columnsRaw = value.columns as Record<string, unknown>;
  const board = emptyBoard();
  const seen = new Set<string>();
  for (const column of BOARD_COLUMNS) {
    const list = columnsRaw[column];
    if (!Array.isArray(list)) continue;
    board.columns[column] = list.filter((id): id is string => {
      if (typeof id !== "string" || id.length === 0 || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  const notesRaw = value.notes;
  if (notesRaw && typeof notesRaw === "object") {
    for (const [id, note] of Object.entries(notesRaw as Record<string, unknown>)) {
      if (typeof note === "string") board.notes[id] = note.slice(0, BOARD_NOTES_MAX);
    }
  }
  return board;
}

export function readBoard(runId: string): BoardState {
  try {
    const raw = localStorage.getItem(boardStorageKey(runId));
    if (!raw) return emptyBoard();
    const parsed = parseBoard(JSON.parse(raw) as unknown);
    return parsed ?? emptyBoard();
  } catch {
    return emptyBoard();
  }
}

export function writeBoard(runId: string, board: BoardState): void {
  try {
    localStorage.setItem(boardStorageKey(runId), JSON.stringify(board));
  } catch {
    // Private mode and full disks should not block the board from working this session.
  }
}

export function isBoardEmpty(board: BoardState): boolean {
  return BOARD_COLUMNS.every((column) => board.columns[column].length === 0);
}

export function findCardColumn(board: BoardState, partnerId: string): BoardColumnId | null {
  for (const column of BOARD_COLUMNS) {
    if (board.columns[column].includes(partnerId)) return column;
  }
  return null;
}

/** Moves (or adds) a card so it ends up at the end of `to`, removing it from any other column
 * it was previously in. A no-op (same reference) when the card is already the sole entry there. */
export function moveCard(board: BoardState, partnerId: string, to: BoardColumnId): BoardState {
  const columns: Record<BoardColumnId, string[]> = { ...board.columns };
  for (const column of BOARD_COLUMNS) {
    columns[column] = columns[column].filter((id) => id !== partnerId);
  }
  columns[to] = [...columns[to], partnerId];
  return { ...board, columns };
}

export function removeCard(board: BoardState, partnerId: string): BoardState {
  const columns: Record<BoardColumnId, string[]> = { ...board.columns };
  for (const column of BOARD_COLUMNS) {
    columns[column] = columns[column].filter((id) => id !== partnerId);
  }
  const notes = { ...board.notes };
  delete notes[partnerId];
  return { ...board, columns, notes };
}

/** Adds partners that aren't already anywhere on the board to `column` (default `to_contact`),
 * preserving the order of `partnerIds`. Partners already placed are left where they are. */
export function addPartnersToColumn(board: BoardState, partnerIds: string[], column: BoardColumnId = "to_contact"): BoardState {
  const existing = new Set(BOARD_COLUMNS.flatMap((col) => board.columns[col]));
  const toAdd = partnerIds.filter((id) => !existing.has(id));
  if (toAdd.length === 0) return board;
  return { ...board, columns: { ...board.columns, [column]: [...board.columns[column], ...toAdd] } };
}

export function setNote(board: BoardState, partnerId: string, note: string): BoardState {
  return { ...board, notes: { ...board.notes, [partnerId]: note.slice(0, BOARD_NOTES_MAX) } };
}
