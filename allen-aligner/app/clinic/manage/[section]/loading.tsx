import styles from "./loading.module.css";

export default function ClinicSectionLoading() {
  return (
    <main className={styles.workspace} role="status" aria-live="polite" aria-label="Loading clinic workspace">
      <div className={styles.heading}>
        <span className={styles.kicker}>CLINIC MANAGEMENT</span>
        <span className={styles.title} />
        <span className={styles.subtitle} />
      </div>
      <div className={styles.metrics}>
        {Array.from({ length: 5 }, (_, index) => <span className={styles.metric} key={index} />)}
      </div>
      <div className={styles.panels}>
        <span className={styles.panel} />
        <span className={styles.panel} />
      </div>
      <span className={styles.srOnly}>Loading clinic data…</span>
    </main>
  );
}
