import { PageStack, Skeleton } from "../../lib/ui/broker-ui";
import styles from "../../lib/ui/lead-screens.module.css";

/** Shown at once while a lead (detail, history, proposals, conversation) is read. */
export default function LeadDetailLoading() {
  return (
    <PageStack>
      <div className={styles.loading} role="status" aria-live="polite">
        <span className="bo-visually-hidden">Chargement du lead…</span>
        <Skeleton lines={1} height={36} />
        <Skeleton lines={4} height={20} />
        <Skeleton lines={6} height={20} />
      </div>
    </PageStack>
  );
}
