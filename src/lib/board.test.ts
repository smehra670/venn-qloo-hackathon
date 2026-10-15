import { beforeEach, describe, expect, it } from "vitest";
import {
  BOARD_VERSION,
  addPartnersToColumn,
  boardStorageKey,
  emptyBoard,
  findCardColumn,
  isBoardEmpty,
  moveCard,
  parseBoard,
  readBoard,
  removeCard,
  setNote,
  writeBoard,
} from "./board";

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) ?? null) : null),
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  } satisfies Storage;
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage();
});

describe("emptyBoard", () => {
  it("has every column empty and the current version", () => {
    const board = emptyBoard();
    expect(board.version).toBe(BOARD_VERSION);
    expect(isBoardEmpty(board)).toBe(true);
    expect(board.columns.to_contact).toEqual([]);
    expect(board.columns.passed).toEqual([]);
  });
});

describe("parseBoard", () => {
  it("returns null for non-objects", () => {
    expect(parseBoard(null)).toBeNull();
    expect(parseBoard("nope")).toBeNull();
    expect(parseBoard(42)).toBeNull();
  });

  it("rejects a mismatched version instead of guessing", () => {
    expect(parseBoard({ version: 999, columns: {} })).toBeNull();
  });

  it("rejects missing columns", () => {
    expect(parseBoard({ version: BOARD_VERSION })).toBeNull();
  });

  it("drops non-string ids and de-duplicates", () => {
    const parsed = parseBoard({
      version: BOARD_VERSION,
      columns: { to_contact: ["a", "b", "a", 7, null], contacted: "not-an-array" },
    });
    expect(parsed?.columns.to_contact).toEqual(["a", "b"]);
    expect(parsed?.columns.contacted).toEqual([]);
  });

  it("clamps notes to 500 characters and drops non-string notes", () => {
    const longNote = "x".repeat(600);
    const parsed = parseBoard({
      version: BOARD_VERSION,
      columns: {},
      notes: { a: longNote, b: 123 },
    });
    expect(parsed?.notes.a).toHaveLength(500);
    expect(parsed?.notes.b).toBeUndefined();
  });
});

describe("moveCard", () => {
  it("adds a card to the target column", () => {
    const board = moveCard(emptyBoard(), "p1", "to_contact");
    expect(board.columns.to_contact).toEqual(["p1"]);
  });

  it("moves a card out of its previous column", () => {
    let board = moveCard(emptyBoard(), "p1", "to_contact");
    board = moveCard(board, "p1", "in_talks");
    expect(board.columns.to_contact).toEqual([]);
    expect(board.columns.in_talks).toEqual(["p1"]);
  });

  it("does not duplicate a card already in the target column", () => {
    let board = moveCard(emptyBoard(), "p1", "done");
    board = moveCard(board, "p1", "done");
    expect(board.columns.done).toEqual(["p1"]);
  });
});

describe("findCardColumn", () => {
  it("finds the column a card is in", () => {
    const board = moveCard(emptyBoard(), "p1", "contacted");
    expect(findCardColumn(board, "p1")).toBe("contacted");
    expect(findCardColumn(board, "missing")).toBeNull();
  });
});

describe("removeCard", () => {
  it("removes the card and its note", () => {
    let board = moveCard(emptyBoard(), "p1", "passed");
    board = setNote(board, "p1", "called twice");
    board = removeCard(board, "p1");
    expect(findCardColumn(board, "p1")).toBeNull();
    expect(board.notes.p1).toBeUndefined();
  });
});

describe("addPartnersToColumn", () => {
  it("adds only partners not already on the board", () => {
    let board = moveCard(emptyBoard(), "p1", "done");
    board = addPartnersToColumn(board, ["p1", "p2", "p3"], "to_contact");
    expect(board.columns.to_contact).toEqual(["p2", "p3"]);
    expect(board.columns.done).toEqual(["p1"]);
  });

  it("is a no-op when nothing new to add", () => {
    const board = moveCard(emptyBoard(), "p1", "to_contact");
    const next = addPartnersToColumn(board, ["p1"], "to_contact");
    expect(next).toBe(board);
  });
});

describe("setNote", () => {
  it("stores and clamps a note to 500 characters", () => {
    const board = setNote(emptyBoard(), "p1", "x".repeat(600));
    expect(board.notes.p1).toHaveLength(500);
  });
});

describe("readBoard / writeBoard round trip", () => {
  it("persists and reloads a board under a run-scoped key", () => {
    const runId = "run-123";
    let board = moveCard(emptyBoard(), "p1", "in_talks");
    board = setNote(board, "p1", "great chat");
    writeBoard(runId, board);
    const reloaded = readBoard(runId);
    expect(reloaded.columns.in_talks).toEqual(["p1"]);
    expect(reloaded.notes.p1).toBe("great chat");
  });

  it("returns an empty board when nothing is stored", () => {
    expect(readBoard("unknown-run")).toEqual(emptyBoard());
  });

  it("returns an empty board when the stored JSON is corrupt", () => {
    const runId = "run-corrupt";
    localStorage.setItem(boardStorageKey(runId), "{not json");
    expect(readBoard(runId)).toEqual(emptyBoard());
  });

  it("scopes storage per run id", () => {
    writeBoard("run-a", moveCard(emptyBoard(), "p1", "done"));
    writeBoard("run-b", moveCard(emptyBoard(), "p2", "passed"));
    expect(readBoard("run-a").columns.done).toEqual(["p1"]);
    expect(readBoard("run-b").columns.passed).toEqual(["p2"]);
  });
});
