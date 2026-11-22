"use client";

import { Button, Notice, PageStack } from "../lib/ui/broker-ui";
import styles from "../lib/ui/lead-screens.module.css";

/**
 * Boundary of the lead screens: an unexpected failure shows what happened, that nothing was lost, and
 * two ways out (retry, back to the list). Next 16 names the recovery function `retry`.
 */
export default function LeadsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <PageStack>
      <Notice tone="danger" title="Ce lead n'a pas pu s'afficher">
        Une erreur est survenue. Aucune action n'a été enregistrée par cet affichage ; vous pouvez réessayer ou revenir à la liste.
        {error.digest ? <span className={styles.hint}> Référence à communiquer au support : {error.digest}</span> : null}
        <div className={styles.shortcuts}>
          <Button variant="secondary" onClick={() => retry()}>Réessayer</Button>
          <Button href="/leads" variant="tertiary">Retour aux leads</Button>
        </div>
      </Notice>
    </PageStack>
  );
}
