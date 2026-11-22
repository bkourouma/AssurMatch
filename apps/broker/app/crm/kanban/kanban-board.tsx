"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { moveCrmLeadStatusAction } from "../../lib/kanban-actions";
import { KANBAN_READ_ONLY_MESSAGE, KANBAN_SAME_COLUMN_MESSAGE, canConfirmKanbanReason, decideKanbanDrop, effectiveKanbanTarget, failKanbanMove, moveCardBetweenColumns, settleKanbanMove, withoutKanbanTarget } from "../../lib/kanban-moves";
import type { KanbanColumns, KanbanMessage } from "../../lib/kanban-moves";
import { productLabel } from "../../lib/product-vocabulary";
import { CRM_OUTCOME_REASONS, CRM_PIPELINE_STATUSES, CRM_REASON_LABELS, CRM_STATUS_LABELS } from "../../lib/lead-vocabulary";
import type { CrmPipelineStatus } from "../../lib/lead-vocabulary";
import { Badge, Button, Cluster, EmptyState, Field, Notice, Select } from "../../lib/ui/broker-ui";
import styles from "../../lib/ui/broker-screens.module.css";

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

/** Where keyboard focus goes after a state change: the moved card's link, or the card's "Déplacer vers" select (the button is disabled once the target is cleared). */
interface FocusRequest {
  leadId: string;
  target: "card" | "control";
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
  const [message, setMessage] = useState<KanbanMessage | undefined>();
  const [focusRequest, setFocusRequest] = useState<FocusRequest | undefined>();
  const [targets, setTargets] = useState<Record<string, string>>({});

  // A keyboard move removes the focused button from the DOM (the card changes column): focus is set
  // explicitly once the new tree is rendered. A form opening moves focus to the reason field.
  useEffect(() => {
    if (!pendingReason) return;
    document.getElementById("kanban-reason")?.focus();
  }, [pendingReason]);

  useEffect(() => {
    if (!focusRequest) return;
    const card = document.querySelector(`[data-kanban-card="${focusRequest.leadId}"]`);
    const element = focusRequest.target === "card" ? card?.querySelector<HTMLElement>("a") : card?.querySelector<HTMLElement>("select");
    element?.focus();
    setFocusRequest(undefined);
  }, [focusRequest]);

  function commit(next: KanbanColumns<KanbanCardData>) {
    columnsRef.current = next;
    setColumns(next);
  }

  async function submitMove(leadId: string, status: CrmPipelineStatus, moveReason?: string) {
    const snapshot = columnsRef.current;
    const optimistic = moveCardBetweenColumns(snapshot, leadId, status);
    commit(optimistic);
    // The keyboard target never outlives the move (success, rollback or cancel): no stale "Déplacer".
    setTargets((current) => withoutKanbanTarget(current, leadId));
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await moveCrmLeadStatusAction(leadId, status, moveReason);
      const settled = settleKanbanMove({ snapshot, optimistic, status, statusLabel: CRM_STATUS_LABELS[status], result });
      commit(settled.columns);
      setMessage(settled.message);
      setFocusRequest({ leadId, target: settled.moved ? "card" : "control" });
    } catch {
      const failed = failKanbanMove(snapshot);
      commit(failed.columns);
      setMessage(failed.message);
      setFocusRequest({ leadId, target: "control" });
    } finally {
      setBusy(false);
    }
  }

  function requestMove(leadId: string, from: string, to: string) {
    if (!canMove || busy) return;
    const decision = decideKanbanDrop(from, to);
    if (decision.kind === "noop") {
      if (from === to) setMessage({ tone: "info", text: KANBAN_SAME_COLUMN_MESSAGE });
      return;
    }
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

  const totalCards = CRM_PIPELINE_STATUSES.reduce((sum, status) => sum + (columns[status]?.length ?? 0), 0);

  return (
    <div>
      {!canMove ? <Notice tone="info" title="Lecture seule">{KANBAN_READ_ONLY_MESSAGE}</Notice> : null}
      <div role="status" aria-live="polite" aria-atomic="true">
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : busy ? <p className={styles.boardHint}>Déplacement en cours...</p> : null}
      </div>
      {totalCards === 0 ? (
        <EmptyState
          title="Aucun lead dans le pipeline"
          description="Les leads qui vous sont assignés apparaissent ici, dans la colonne de leur statut."
          action={<Button href="/leads" variant="secondary" size="sm">Ouvrir les leads reçus</Button>}
        />
      ) : null}
      {pendingReason ? (
        <form
          role="group"
          className={styles.reasonForm}
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
          <Cluster>
            <Button type="submit" disabled={!canConfirmKanbanReason(reason, busy)}>Confirmer le déplacement</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setTargets((current) => withoutKanbanTarget(current, pendingReason.leadId));
                setFocusRequest({ leadId: pendingReason.leadId, target: "control" });
                setPendingReason(undefined);
              }}
            >
              Annuler
            </Button>
          </Cluster>
        </form>
      ) : null}
      {totalCards > 0 ? (
      <div className={styles.board} role="region" tabIndex={0} aria-busy={busy} aria-label="Colonnes du pipeline CRM">
        {CRM_PIPELINE_STATUSES.map((status) => {
          const cards = columns[status] ?? [];
          return (
            <section
              key={status}
              className={styles.column}
              data-kanban-column={status}
              aria-label={`${CRM_STATUS_LABELS[status]}, ${cards.length} lead(s)`}
              onDragOver={canMove ? (event) => { event.preventDefault(); setOverColumn(status); } : undefined}
              onDragLeave={canMove ? () => setOverColumn((current) => (current === status ? undefined : current)) : undefined}
              onDrop={canMove ? (event) => onDrop(event, status) : undefined}
              style={overColumn === status ? { outline: "2px dashed currentColor", outlineOffset: 2 } : undefined}
            >
              <h2 className={styles.columnHead}>
                <span>{CRM_STATUS_LABELS[status]}</span>
                <Badge tone={cards.length > 0 ? "info" : "neutral"}>{String(cards.length)}</Badge>
              </h2>
              {cards.length > 0 ? (
                <ul className={styles.columnList}>
                    {cards.map((card) => {
                      const targetId = `kanban-move-${card.id}`;
                      const target = effectiveKanbanTarget(status, targets[card.id]);
                      return (
                        <li
                          key={card.id}
                          className={styles.ticket}
                          data-kanban-card={card.id}
                          draggable={canMove}
                          onDragStart={canMove ? (event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.id); setDragging({ id: card.id, from: status }); } : undefined}
                          onDragEnd={canMove ? () => { setDragging(undefined); setOverColumn(undefined); } : undefined}
                          style={{ cursor: canMove ? "grab" : undefined, opacity: dragging?.id === card.id ? 0.5 : 1 }}
                        >
                          <a className={styles.ticketRef} href={`/crm/leads/${card.id}`}>{card.reference}</a>
                          <span className={styles.ticketMeta}>
                            {productLabel(card.product)} / {card.country}
                            {card.advisor ? ` - ${card.advisor}` : ""}
                          </span>
                          {canMove ? (
                            <div className={styles.moveRow}>
                              <label className={styles.moveLabel} htmlFor={targetId}>Déplacer {card.reference} vers</label>
                              <div className={styles.moveControls}>
                              <Select
                                id={targetId}
                                value={target}
                                onChange={(event) => setTargets((current) => ({ ...current, [card.id]: event.target.value }))}
                                placeholder="Choisir une colonne"
                                options={CRM_PIPELINE_STATUSES.filter((target) => target !== status).map((target) => ({ value: target, label: CRM_STATUS_LABELS[target] }))}
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={busy || !target}
                                onClick={() => {
                                  if (target) requestMove(card.id, status, target);
                                }}
                              >
                                Déplacer
                              </Button>
                              </div>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className={styles.columnEmpty}>Aucun lead.</p>
                )}
            </section>
          );
        })}
      </div>
      ) : null}
    </div>
  );
}
