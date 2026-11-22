import { PageStack, Skeleton } from "../lib/ui/broker-ui";
import styles from "../lib/ui/lead-screens.module.css";

/** Shown at once while the list of leads is read: the page keeps its height and says what is loading. */
export default function LeadsLoading() {
  return (
    <PageStack>
      <div className={styles.loading} role="status" aria-live="polite">
        <span className="bo-visually-hidden">Chargement de vos leads…</span>
        <Skeleton lines={1} height={36} />
        <Skeleton lines={2} height={40} />
        <Skeleton lines={6} height={22} />
      </div>
    </PageStack>
  );
}
