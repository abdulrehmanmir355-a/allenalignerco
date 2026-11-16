import styles from "./loading.module.css";
export default function Loading() {
  return (
    <div
      className={styles.container}
      role="status"
      aria-live="polite"
      aria-label="Loading doctor workspace"
    >
      <div className={styles.header}>
        <div className={styles.icon}>A</div>
        <div className={styles.heading}>
          <h2>Preparing your workspace</h2>
          <p>Loading your secure clinical information...</p>
        </div>
      </div>
      <div className={styles.skeleton}>
        <div className={styles.title}></div>
        <div className={styles.subtitle}></div>
        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.line}></div>
            <div className={styles.largeLine}></div>
          </div>
          <div className={styles.card}>
            <div className={styles.line}></div>
            <div className={styles.largeLine}></div>
          </div>
          <div className={styles.card}>
            <div className={styles.line}></div>
            <div className={styles.largeLine}></div>
          </div>
        </div>
        <div className={styles.panel}>
          <div className={styles.line}></div>
          <div className={styles.input}></div>
          <div className={styles.line}></div>
          <div className={styles.input}></div>
        </div>
      </div>
    </div>
  );
}