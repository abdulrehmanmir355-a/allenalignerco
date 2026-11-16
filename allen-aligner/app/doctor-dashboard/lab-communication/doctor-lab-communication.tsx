'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { LabDoctorThreadView, LabDoctorMessageView } from '@/app/lib/lab-doctor-communication';

// Extend the thread type for the doctor-portal view (includes labLabel + unreadByDoctor)
type DoctorLabThread = LabDoctorThreadView & { labLabel?: string | null; unreadByDoctor?: number };

function pkt(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }) + ' PKT';
}

export default function DoctorLabCommunication({ doctorId, doctorName }: { doctorId: string; doctorName: string }) {
  const [threads, setThreads] = useState<DoctorLabThread[]>([]);
  const [activeThread, setActiveThread] = useState<{ thread: DoctorLabThread; messages: LabDoctorMessageView[]; hasMore: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<{ key: string; payload: string } | null>(null);
  const sending = useRef(false);
  const alive = useRef(true);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const loadThreads = useCallback(async () => {
    try {
      const r = await fetch('/api/portal/lab-threads', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Could not load lab messages.');
      if (alive.current) setThreads(Array.isArray(data) ? data : []);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Unable to load lab communication.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  // Auto-refresh active thread every 5 seconds.
  useEffect(() => {
    if (!activeThread) return;
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/api/portal/lab-threads/${encodeURIComponent(activeThread.thread.id)}`, { cache: 'no-store' });
        const d = await r.json();
        if (!r.ok || !alive.current) return;
        setActiveThread(d);
        // Scroll to bottom if already near end.
        const el = historyRef.current;
        if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
          el.scrollTop = el.scrollHeight;
        }
      } catch { /* silent */ }
    }, 5000);
    return () => clearInterval(id);
  }, [activeThread]);

  async function openThread(thread: DoctorLabThread) {
    setError(''); setNotice('');
    try {
      const r = await fetch(`/api/portal/lab-threads/${encodeURIComponent(thread.id)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Could not open thread.');
      setActiveThread(d);
      // Scroll to bottom of history after mount.
      setTimeout(() => { if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; }, 80);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open thread.');
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || !activeThread) return;
    sending.current = true;
    setBusy(true);
    setError(''); setNotice('');

    const body = { text: replyText.trim() };
    const serialized = JSON.stringify(body);
    if (!pendingRef.current || pendingRef.current.payload !== serialized) {
      pendingRef.current = { key: crypto.randomUUID(), payload: serialized };
    }

    try {
      const r = await fetch(`/api/portal/lab-threads/${encodeURIComponent(activeThread.thread.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, requestId: pendingRef.current.key }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Message could not be sent.');
      pendingRef.current = null;
      setReplyText('');
      setNotice(d.duplicate ? 'Your message was already saved.' : 'Reply sent to the laboratory.');
      // Refresh thread.
      const tr = await fetch(`/api/portal/lab-threads/${encodeURIComponent(activeThread.thread.id)}`, { cache: 'no-store' });
      const td = await tr.json();
      if (tr.ok && alive.current) {
        setActiveThread(td);
        setTimeout(() => { if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; }, 80);
      }
      await loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection interrupted. Retry the same message to avoid duplicates.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (loading) return <p>Loading lab messages…</p>;

  return (
    <div>
      <header>
        <span className="clinical-eyebrow">LABORATORY COMMUNICATION</span>
        <h1>Lab Messages</h1>
        <p>Direct messages from the laboratory assigned to your cases. Reply here to communicate with the lab team.</p>
      </header>

      {error && <p className="clinical-error" role="alert">{error}</p>}
      {notice && <p className="clinical-notice" role="status">{notice}</p>}

      {!activeThread ? (
        <section>
          <h2>Your lab message threads</h2>
          {!threads.length
            ? <p>No lab messages yet. The laboratory will contact you here when they need to discuss a case directly.</p>
            : <div className="clinical-table">
                <table>
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Case</th>
                      <th>Lab</th>
                      <th>Last message</th>
                      <th>Unread</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {threads.map(t => (
                      <tr key={t.id}>
                        <td><strong>{t.subject}</strong></td>
                        <td><small>{t.caseId}</small></td>
                        <td>{t.labLabel ?? 'Lab'}</td>
                        <td>{t.lastMessage ? t.lastMessage.slice(0, 80) + (t.lastMessage.length > 80 ? '…' : '') : <em>No messages</em>}
                          {t.lastAt && <small>{pkt(t.lastAt)}</small>}
                        </td>
                        <td>{t.unreadByDoctor && t.unreadByDoctor > 0
                          ? <strong style={{ color: '#a53828' }}>{t.unreadByDoctor} new</strong>
                          : <span style={{ color: '#6b8c86' }}>—</span>}
                        </td>
                        <td>{t.status}</td>
                        <td>
                          <button className="button" onClick={() => void openThread(t)}>
                            Open →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </section>
      ) : (
        <section>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <button className="button" style={{ background: 'transparent', color: '#087989', border: '1px solid #087989' }}
              onClick={() => { setActiveThread(null); void loadThreads(); }}>
              ← All lab threads
            </button>
            <h2 style={{ margin: 0 }}>{activeThread.thread.subject}</h2>
            <span className="clinical-eyebrow" style={{ marginLeft: 'auto' }}>
              Case {activeThread.thread.caseId} · {activeThread.thread.status}
            </span>
          </div>
          <p style={{ color: '#5a7a80', fontSize: 14 }}>
            Lab: {activeThread.thread.labLabel ?? 'Assigned laboratory'} ·
            Started {pkt(activeThread.thread.createdAt)}
          </p>

          {/* Message history */}
          <div
            ref={historyRef}
            style={{
              border: '1px solid #dce7e9', borderRadius: 8, padding: 16, maxHeight: 420,
              overflowY: 'auto', background: '#f9fcfc', marginBottom: 16
            }}
            aria-label="Lab message history"
          >
            {!activeThread.messages.length && (
              <p style={{ color: '#6b8c86', textAlign: 'center' }}>No messages in this thread yet.</p>
            )}
            {activeThread.messages.map(m => {
              const isMine = m.senderRole === 'DOCTOR';
              return (
                <article
                  key={m.id}
                  style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: isMine ? 'flex-end' : 'flex-start',
                    marginBottom: 12
                  }}
                >
                  <div style={{
                    maxWidth: '72%', background: isMine ? '#e6f4f1' : '#fff',
                    border: '1px solid ' + (isMine ? '#b2d8d1' : '#dce7e9'),
                    borderRadius: 8, padding: '10px 14px'
                  }}>
                    <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 13 }}>
                      {isMine ? `Dr. ${doctorName}` : m.senderName}
                    </p>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</p>
                  </div>
                  <small style={{ color: '#8aa6ac', marginTop: 2 }}>{pkt(m.createdAt)}</small>
                </article>
              );
            })}
          </div>

          {/* Reply form */}
          {activeThread.thread.status === 'OPEN' ? (
            <form onSubmit={sendReply}>
              <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
                <label htmlFor="lab-reply-text">Your reply to the laboratory</label>
                <textarea
                  id="lab-reply-text"
                  required
                  minLength={1}
                  maxLength={5000}
                  rows={4}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Type your reply to the laboratory…"
                  style={{ display: 'block', width: '100%', marginTop: 8, marginBottom: 8 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <small style={{ color: '#8aa6ac' }}>{replyText.length.toLocaleString()} / 5,000</small>
                  <button className="button" type="submit" disabled={busy || !replyText.trim()}>
                    {busy ? 'Sending…' : 'Send reply to lab'}
                  </button>
                </div>
              </fieldset>
            </form>
          ) : (
            <p style={{ color: '#8aa6ac', fontStyle: 'italic' }}>This thread is closed.</p>
          )}
        </section>
      )}
    </div>
  );
}
