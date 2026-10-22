"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { moveCrmLeadStatusAction } from "../../lib/kanban-actions";
import { KANBAN_ERROR_MESSAGES, KANBAN_READ_ONLY_MESSAGE, decideKanbanDrop, moveCardBetweenColumns } from "../../lib/kanban-moves";
import type { KanbanColumns } from "../../lib/kanban-moves";
import { CRM_OUTCOME_REASONS, CRM_PIPELINE_STATUSES, CRM_REASON_LABELS, CRM_STATUS_LABELS } from "../../lib/lead-vocabulary";
import type { CrmPipelineStatus } from "../../lib/lead-vocabulary";
import { Button, Card, Field, Notice, Select } from "../../lib/ui/broker-ui";

export interface KanbanCardData {
  id: string;
  reference: string;
  product: string;
  country: string;
  advisor?: string | undefined;
}

export interface KanbanBoardProps {
  columns: KanbanColumns<KanbanCardData>;
  /** False for a role without CRM update right, or a suspended tenant: cards are neither draggable nor movable. */
  canMove: boolean;
}

interface PendingReason {
  leadId: string;
  status: CrmPipelineStatus;
}

/**
 * Kanban CRM: HTML5 drag and drop plus a keyboard alternative ("Déplacer vers" select + button on
 * each card), announced through an aria-live region. The move is optimistic and rolled back when the
 * API refuses it (the API stays the authority and audits every change).
 */
export function KanbanBoard({ columns: initial, canMove }: KanbanBoardProps) {
  const [columns, setColumns] = useState(initial);
  const columnsRef = useRef(initial);
  const [dragging, setDragging] = useState<{ id: string; from: string } | undefined>();
  const [overColumn, setOverColumn] = useState<string | undefined>();
  const [pendingReason, setPendingReason] = useState<PendingReason | undefined>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | undefined>();
  const [targets, setTargets] = useState<Record<string, string>>({});

  function commit(next: KanbanColumns<KanbanCardData>) {
    columnsRef.current = next;
    setColumns(next);
  }

  async function submitMove(leadId: string, status: CrmPipelineStatus, moveReason?: string) {
    const snapshot = columnsRef.current;
    commit(moveCardBetweenColumns(snapshot, leadId, status));
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await moveCrmLeadStatusAction(leadId, status, moveReason);
      if (result.ok) {
        setMessage({ tone: "info", text: `Lead déplacé vers « ${CRM_STATUS_LABELS[status]} ». Le changement est historisé.` });
      } else {
        commit(snapshot);
        setMessage({ tone: "danger", text: KANBAN_ERROR_MESSAGES[result.code] });
      }
    } catch {
      commit(snapshot);
      setMessage({ tone: "danger", text: KANBAN_ERROR_MESSAGES.error });
    } finally {
      setBusy(false);
    }
  }

  function requestMove(leadId: string, from: string, to: string) {
    if (!canMove || busy) return;
    const decision = decideKanbanDrop(from, to);
    if (decision.kind === "noop") return;
    if (decision.kind === "needs_reason") {
      setReason("");
      setPendingReason({ leadId, status: decision.status });
      return;
    }
    void submitMove(leadId, decision.status);
  }

  function onDrop(event: DragEvent, to: string) {
    event.preventDefault();
    setOverColumn(undefined);
    const current = dragging;
    setDragging(undefined);
    if (current) requestMove(current.id, current.from, to);
  }

  return (
    <div>
      {!canMove ? <Notice tone="info">{KANBAN_READ_ONLY_MESSAGE}</Notice> : null}
      <div role="status" aria-live="polite" aria-atomic="true">
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      </div>
      {pendingReason ? (
        <form
          role="group"
          aria-label="Motif du changement de statut"
          onSubmit={(event) => {
            event.preventDefault();
            const pending = pendingReason;
            setPendingReason(undefined);
            void submitMove(pending.leadId, pending.status, reason);
          }}
        >
          <Field id="kanban-reason" label={`Motif pour « ${CRM_STATUS_LABELS[pendingReason.status]} »`} required requiredLabel="obligatoire" hint="Le motif est historisé avec le changement de statut.">
            <Select
              id="kanban-reason"
              name="reason"
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Choisir un motif"
              options={CRM_OUTCOME_REASONS.map((value) => ({ value, label: CRM_REASON_LABELS[value] }))}
            />
          </Field>
          <Button type="submit" disabled={!reason || busy}>Confirmer le déplacement</Button>{" "}
          <Button type="button" variant="secondary" onClick={() => setPendingReason(undefined)}>Annuler</Button>
        </form>
      ) : null}
      <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(240px, 1fr)", gap: "var(--bo-space-4, 16px)", overflowX: "auto" }} aria-label="Colonnes du pipeline CRM">
        {CRM_PIPELINE_STATUSES.map((status) => {
          const cards = columns[status] ?? [];
          return (
            <section
              key={status}
              data-kanban-column={status}
              aria-label={`${CRM_STATUS_LABELS[status]}, ${cards.length} lead(s)`}
              onDragOver={canMove ? (event) => { event.preventDefault(); setOverColumn(status); } : undefined}
              onDragLeave={canMove ? () => setOverColumn((current) => (current === status ? undefined : current)) : undefined}
              onDrop={canMove ? (event) => onDrop(event, status) : undefined}
              style={overColumn === status ? { outline: "2px dashed currentColor", outlineOffset: 2 } : undefined}
            >
              <Card title={`${CRM_STATUS_LABELS[status]} (${cards.length})`} as="div">
                {cards.length > 0 ? (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
                    {cards.map((card) => {
                      const targetId = `kanban-move-${card.id}`;
                      return (
                        <li
                          key={card.id}
                          data-kanban-card={card.id}
                          draggable={canMove}
                          onDragStart={canMove ? (event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.id); setDragging({ id: card.id, from: status }); } : undefined}
                          onDragEnd={canMove ? () => { setDragging(undefined); setOverColumn(undefined); } : undefined}
                          style={{ cursor: canMove ? "grab" : undefined, opacity: dragging?.id === card.id ? 0.5 : 1 }}
                        >
                          <a href={`/crm/leads/${card.id}`}>{card.reference}</a> - {card.product} / {card.country}
                          {card.advisor ? ` - ${card.advisor}` : ""}
                          {canMove ? (
                            <div>
                              <label htmlFor={targetId}>Déplacer {card.reference} vers</label>
                              <Select
                                id={targetId}
                                value={targets[card.id] ?? ""}
                                onChange={(event) => setTargets((current) => ({ ...current, [card.id]: event.target.value }))}
                                placeholder="Choisir une colonne"
                                options={CRM_PIPELINE_STATUSES.filter((target) => target !== status).map((target) => ({ value: target, label: CRM_STATUS_LABELS[target] }))}
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={busy || !targets[card.id]}
                                onClick={() => {
                                  const target = targets[card.id];
                                  if (target) requestMove(card.id, status, target);
                                }}
                              >
                                Déplacer
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>Aucun lead.</p>
                )}
              </Card>
            </section>
          );
        })}
      </div>
    </div>
  );
}
