import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { FEASIBILITY_LABELS } from "@shared/constants";
import type { Partner } from "@shared/types";
import { GripVertical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  addPartnersToColumn,
  BOARD_COLUMNS,
  BOARD_COLUMN_LABELS,
  BOARD_NOTES_MAX,
  type BoardColumnId,
  type BoardState,
  emptyBoard,
  isBoardEmpty,
  moveCard,
  readBoard,
  setNote,
  writeBoard,
} from "@/lib/board";
import { cn } from "@/lib/cn";
import { KIND_META } from "@/lib/kinds";
import { useVenn } from "@/store/useVenn";

const TOP_N = 5;

export function PlanView() {
  const result = useVenn((state) => state.result);
  const pinnedIds = useVenn((state) => state.pinnedIds);
  const select = useVenn((state) => state.select);
  const runId = result?.runId ?? null;
  const [board, setBoard] = useState<BoardState>(emptyBoard());
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    let next = readBoard(runId);
    // Pinned partners seed the board the first time it's opened for this run only — after that
    // the board itself is the source of truth, so later pins/unpins don't reshuffle it.
    if (isBoardEmpty(next) && pinnedIds.size > 0) {
      next = addPartnersToColumn(next, [...pinnedIds], "to_contact");
      writeBoard(runId, next);
    }
    setBoard(next);
    // Intentionally only re-runs when the run changes, not on every pin/unpin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const partnersById = useMemo(() => {
    const map = new Map<string, Partner>();
    for (const partner of result?.partners ?? []) map.set(partner.id, partner);
    return map;
  }, [result]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  if (!result || !runId) return null;

  const persist = (next: BoardState) => {
    setBoard(next);
    writeBoard(runId, next);
  };

  const onMove = (partnerId: string, column: BoardColumnId) => persist(moveCard(board, partnerId, column));
  const onNote = (partnerId: string, note: string) => persist(setNote(board, partnerId, note));

  const addTop5 = () => {
    const top5 = [...result.partners]
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, TOP_N)
      .map((partner) => partner.id);
    persist(addPartnersToColumn(board, top5, "to_contact"));
  };

  const clearBoard = () => {
    if (isBoardEmpty(board)) return;
    if (!window.confirm("Clear the whole outreach board? Notes and placements can't be recovered.")) return;
    persist(emptyBoard());
  };

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));
  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const overId = event.over?.id;
    if (overId === undefined) return;
    const column = String(overId);
    if (!isBoardColumn(column)) return;
    onMove(String(event.active.id), column);
  };

  const empty = isBoardEmpty(board);
  const activePartner = activeId ? partnersById.get(activeId) : undefined;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 overflow-auto px-4 py-4 pb-28 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-2xl tracking-tight">Outreach plan</h2>
          <p className="text-sm text-ink-soft">Move partners through your pipeline. Saved on this device only.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={addTop5}>Add top 5 to plan</Button>
          <Button type="button" variant="ghost" className="text-coral hover:bg-coral-soft" onClick={clearBoard}>
            Clear board
          </Button>
        </div>
      </div>

      {empty ? (
        <EmptyState
          title="Nothing on the board yet"
          body={`Pin partners from the Shortlist, or add your top ${TOP_N} picks to start planning outreach.`}
          className="border-dashed"
        />
      ) : null}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {BOARD_COLUMNS.map((column) => (
            <Column
              key={column}
              column={column}
              partnerIds={board.columns[column]}
              partnersById={partnersById}
              notes={board.notes}
              onMove={onMove}
              onNote={onNote}
              onOpen={select}
            />
          ))}
        </div>
        <DragOverlay>{activePartner ? <DragPreview partner={activePartner} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function isBoardColumn(value: string): value is BoardColumnId {
  return (BOARD_COLUMNS as readonly string[]).includes(value);
}

function Column({
  column,
  partnerIds,
  partnersById,
  notes,
  onMove,
  onNote,
  onOpen,
}: {
  column: BoardColumnId;
  partnerIds: string[];
  partnersById: Map<string, Partner>;
  notes: Record<string, string>;
  onMove: (partnerId: string, column: BoardColumnId) => void;
  onNote: (partnerId: string, note: string) => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[260px] shrink-0 flex-col gap-2 rounded-[12px] border border-line bg-paper p-3 transition-colors",
        isOver && "border-coral bg-coral-soft/40",
      )}
    >
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{BOARD_COLUMN_LABELS[column]}</h3>
        <span className="font-mono text-xs text-ink-soft">{partnerIds.length}</span>
      </div>
      <div className="flex min-h-[72px] flex-col gap-2">
        {partnerIds.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-ink-soft">
            No partners here yet.
          </p>
        ) : (
          partnerIds.map((id) => {
            const partner = partnersById.get(id);
            if (!partner) return null;
            return (
              <Card
                key={id}
                partner={partner}
                column={column}
                note={notes[id] ?? ""}
                onMove={onMove}
                onNote={onNote}
                onOpen={onOpen}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function Card({
  partner,
  column,
  note,
  onMove,
  onNote,
  onOpen,
}: {
  partner: Partner;
  column: BoardColumnId;
  note: string;
  onMove: (partnerId: string, column: BoardColumnId) => void;
  onNote: (partnerId: string, note: string) => void;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: partner.id });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("rounded-2xl border border-line bg-paper p-3", isDragging && "opacity-40")}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`Drag ${partner.name} to a different column`}
          className="mt-0.5 shrink-0 cursor-grab touch-none text-ink-soft hover:text-ink active:cursor-grabbing"
        >
          <GripVertical size={16} />
        </button>
        <CardBody partner={partner} onOpen={onOpen} />
      </div>
      <label className="mt-2 block text-xs font-medium text-ink-soft" htmlFor={`plan-notes-${partner.id}`}>
        Notes
      </label>
      <textarea
        id={`plan-notes-${partner.id}`}
        value={note}
        maxLength={BOARD_NOTES_MAX}
        onChange={(event) => onNote(partner.id, event.target.value)}
        placeholder="Add a note…"
        rows={2}
        className="mt-1 w-full resize-none rounded-xl border border-line bg-paper px-2 py-1.5 text-sm text-ink outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-ink-soft">{note.length}/{BOARD_NOTES_MAX}</span>
        <label className="sr-only" htmlFor={`plan-move-${partner.id}`}>
          Move {partner.name} to…
        </label>
        <select
          id={`plan-move-${partner.id}`}
          aria-label={`Move ${partner.name} to…`}
          value={column}
          onChange={(event) => onMove(partner.id, event.target.value as BoardColumnId)}
          className="rounded-full border border-line bg-paper px-2 py-1 text-xs text-ink"
        >
          {BOARD_COLUMNS.map((col) => (
            <option key={col} value={col}>
              {BOARD_COLUMN_LABELS[col]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function CardBody({ partner, onOpen }: { partner: Partner; onOpen?: (id: string) => void }) {
  return (
    <div className="min-w-0 flex-1">
      {onOpen ? (
        <button type="button" onClick={() => onOpen(partner.id)} className="block truncate text-left font-medium hover:underline">
          {partner.name}
        </button>
      ) : (
        <p className="truncate font-medium">{partner.name}</p>
      )}
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Chip>{KIND_META[partner.kind].label}</Chip>
        <Chip>{`Match ${partner.matchScore}`}</Chip>
        {partner.feasibility ? <Chip>{FEASIBILITY_LABELS[partner.feasibility.level]}</Chip> : null}
      </div>
    </div>
  );
}

function DragPreview({ partner }: { partner: Partner }) {
  return (
    <div className="w-[228px] rounded-2xl border border-line bg-paper p-3">
      <CardBody partner={partner} />
    </div>
  );
}
