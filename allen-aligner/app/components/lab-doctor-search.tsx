'use client';
// LabDoctorSearch — lets the lab find a doctor by name / email / reg-no / ID
// and start or continue a direct communication thread.

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  DoctorSearchResult,
  LabDoctorThreadView,
  LabDoctorMessageView,
} from '../lib/lab-doctor-communication';

function pkt(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short',
  }) + ' PKT';
}

interface ThreadDetail {
  thread: LabDoctorThreadView;
  messages: LabDoctorMessageView[];
  hasMore: boolean;
}

export default function LabDoctorSearch({
  caseId,
  token,
}: {
  caseId: string;
  token: string;
}) {
  const headers = { Authorization: `Bearer ${token}` };

  // --- UI state ---
  const [tab, setTab] = useState<'threads' | 'search'>('threads');
  const [threads, setThreads] = useState<LabDoctorThreadView[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadDetail | null>(null);

  // Search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DoctorSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // New thread
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorSearchResult | null>(null);
  const [subject, setSubject] = useState('');
  const [firstMsg, setFirstMsg] = useState('');
  const [opening, setOpening] = useState(false);

  // Messaging
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const pendingRef = useRef<{ key: string; payload: string } | null>(null);
  const sendLock = useRef(false);
  const alive = useRef(true);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Load threads list.
  const loadThreads = useCallback(async () => {
    try {
      const r = await fetch(`/api/lab/cases/${encodeURIComponent(caseId)}/threads`, {
        cache: 'no-store', headers,
      });
      if (!r.ok) return;
      const data: LabDoctorThreadView[] = await r.json();
      if (alive.current) setThreads(data);
    } catch { /* silent */ }
  }, [caseId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  // Auto-refresh active thread.
  useEffect(() => {
    if (!activeThread) return;
    const tid = activeThread.thread.id;
    const id = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(
          `/api/lab/cases/${encodeURIComponent(caseId)}/threads/${encodeURIComponent(tid)}`,
          { cache: 'no-store', headers }
        );
        if (!r.ok || !alive.current) return;
        const d: ThreadDetail = await r.json();
        setActiveThread(d);
        const el = historyRef.current;
        if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
          el.scrollTop = el.scrollHeight;
        }
      } catch { /* silent */ }
    }, 5000);
    return () => clearInterval(id);
  }, [activeThread?.thread.id, caseId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search doctors.
  async function searchDoctors(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError('');
    try {
      const r = await fetch(`/api/lab/doctors?q=${encodeURIComponent(query.trim())}`, {
        headers,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Search failed.');
      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Unable to search.');
    } finally {
      setSearching(false);
    }
  }

  // Open or reuse a thread.
  async function openOrStartThread(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedDoctor || !subject.trim() || !firstMsg.trim()) return;
    setOpening(true);
    setError('');
    try {
      const r = await fetch(
        `/api/lab/cases/${encodeURIComponent(caseId)}/threads`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctorId: selectedDoctor.id,
            subject: subject.trim(),
            firstMessage: firstMsg.trim(),
            requestId: crypto.randomUUID(),
          }),
        }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Could not start thread.');

      // Open the new thread immediately.
      const tr = await fetch(
        `/api/lab/cases/${encodeURIComponent(caseId)}/threads/${encodeURIComponent(d.threadId)}`,
        { cache: 'no-store', headers }
      );
      if (tr.ok) {
        const td: ThreadDetail = await tr.json();
        setActiveThread(td);
        setTab('threads');
        setSelectedDoctor(null);
        setSubject('');
        setFirstMsg('');
        setResults([]);
        setQuery('');
        setTimeout(() => { if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; }, 80);
      }
      await loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start thread.');
    } finally {
      setOpening(false);
    }
  }

  // Open existing thread.
  async function openThread(thread: LabDoctorThreadView) {
    setError(''); setNotice('');
    try {
      const r = await fetch(
        `/api/lab/cases/${encodeURIComponent(caseId)}/threads/${encodeURIComponent(thread.id)}`,
        { cache: 'no-store', headers }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Could not open thread.');
      setActiveThread(d);
      setTimeout(() => { if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; }, 80);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open thread.');
    }
  }

  // Send a message in an active thread.
  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sendLock.current || !activeThread) return;
    sendLock.current = true;
    setSending(true);
    setError(''); setNotice('');

    const body = { text: msgText.trim() };
    const serialized = JSON.stringify(body);
    if (!pendingRef.current || pendingRef.current.payload !== serialized) {
      pendingRef.current = { key: crypto.randomUUID(), payload: serialized };
    }

    try {
      const r = await fetch(
        `/api/lab/cases/${encodeURIComponent(caseId)}/threads/${encodeURIComponent(activeThread.thread.id)}`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, requestId: pendingRef.current.key }),
        }
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Message could not be sent.');
      pendingRef.current = null;
      setMsgText('');
      setNotice(d.duplicate ? 'Message already saved.' : 'Message sent to doctor.');
      // Refresh thread.
      const tr = await fetch(
        `/api/lab/cases/${encodeURIComponent(caseId)}/threads/${encodeURIComponent(activeThread.thread.id)}`,
        { cache: 'no-store', headers }
      );
      if (tr.ok && alive.current) {
        const td: ThreadDetail = await tr.json();
        setActiveThread(td);
        setTimeout(() => { if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; }, 80);
      }
      await loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection interrupted. Retry the same message.');
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <section className="panel padded">
      <h2>Doctor Communication</h2>
      <p>
        Search for a doctor by name, registration number, email, or ID — then start a
        direct message thread. The doctor will receive a notification and can reply from
        their portal. Clinical leads can monitor all threads.
      </p>

      {error && <p role="alert" style={{ padding: 12, background: '#fff1ef', borderLeft: '4px solid #a53828', margin: '8px 0' }}>{error}</p>}
      {notice && <p role="status" style={{ padding: 12, background: '#ecf8f6', borderLeft: '4px solid #087989', margin: '8px 0' }}>{notice}</p>}

      {/* Tab bar */}
      {!activeThread && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            style={{ fontWeight: tab === 'threads' ? 700 : 400, textDecoration: tab === 'threads' ? 'underline' : 'none', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#087989' }}
            onClick={() => setTab('threads')}
          >
            Active threads ({threads.length})
          </button>
          <span style={{ color: '#aaa' }}>|</span>
          <button
            type="button"
            style={{ fontWeight: tab === 'search' ? 700 : 400, textDecoration: tab === 'search' ? 'underline' : 'none', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#087989' }}
            onClick={() => setTab('search')}
          >
            Search doctor &amp; start new thread
          </button>
        </div>
      )}

      {/* ─── Active thread view ─────────────────────────────────────────── */}
      {activeThread && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => { setActiveThread(null); void loadThreads(); }}
              style={{ background: 'none', border: '1px solid #087989', color: '#087989', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}
            >
              ← All threads
            </button>
            <div>
              <strong>{activeThread.thread.subject}</strong>
              <small style={{ display: 'block', color: '#6b8c86' }}>
                To: Dr. {activeThread.thread.doctorName} · {activeThread.thread.doctorEmail}
                {activeThread.thread.clinicName ? ` · ${activeThread.thread.clinicName}` : ''}
              </small>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8aa6ac' }}>
              {activeThread.thread.status} · Started {pkt(activeThread.thread.createdAt)}
            </span>
          </div>

          {/* Message history */}
          <div
            ref={historyRef}
            aria-label="Doctor message history"
            style={{
              maxHeight: 380, overflowY: 'auto', background: '#efeae2',
              borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
              marginBottom: 12,
            }}
          >
            {!activeThread.messages.length && (
              <p style={{ alignSelf: 'center', color: '#52666b' }}>No messages yet.</p>
            )}
            {activeThread.messages.map(m => {
              const fromLab = m.senderRole === 'LAB';
              return (
                <article
                  key={m.id}
                  style={{
                    alignSelf: fromLab ? 'flex-end' : 'flex-start',
                    maxWidth: 'min(82%,600px)',
                    background: fromLab ? '#d9fdd3' : '#fff',
                    borderRadius: fromLab ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    padding: '10px 13px 6px',
                    boxShadow: '0 1px 1px #00000012',
                    overflowWrap: 'anywhere',
                  }}
                >
                  <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#34535b' }}>
                    <strong>{m.senderName}</strong>
                    <time>{pkt(m.createdAt)}</time>
                  </header>
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, margin: '6px 0 2px' }}>{m.text}</p>
                </article>
              );
            })}
          </div>

          {/* Send message form */}
          {activeThread.thread.status === 'OPEN' ? (
            <form onSubmit={sendMessage}>
              <fieldset disabled={sending} style={{ border: 0, padding: 0 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  Message to Dr. {activeThread.thread.doctorName}
                </label>
                <textarea
                  required
                  maxLength={5000}
                  rows={3}
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  placeholder="Type your message to the doctor…"
                  style={{ display: 'block', width: '100%', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <small style={{ color: '#8aa6ac' }}>{msgText.length} / 5,000</small>
                  <button className="button" type="submit" disabled={sending || !msgText.trim()}>
                    {sending ? 'Sending…' : 'Send to doctor'}
                  </button>
                </div>
              </fieldset>
            </form>
          ) : (
            <p style={{ color: '#8aa6ac', fontStyle: 'italic' }}>This thread is closed.</p>
          )}
        </>
      )}

      {/* ─── Threads list ───────────────────────────────────────────────── */}
      {!activeThread && tab === 'threads' && (
        <>
          {!threads.length
            ? <p style={{ color: '#6b8c86' }}>No active threads. Use "Search doctor" to start a new conversation.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {threads.map(t => (
                  <div
                    key={t.id}
                    style={{
                      border: '1px solid #dce7e9', borderRadius: 8, padding: '12px 16px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                      background: t.unreadByLab > 0 ? '#f0faf8' : '#fff',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ overflowWrap: 'anywhere' }}>{t.subject}</strong>
                      <p style={{ margin: '2px 0', fontSize: 13, color: '#5a7a80' }}>
                        Dr. {t.doctorName}
                        {t.clinicName ? ` · ${t.clinicName}` : ''}
                        {' · '}{t.doctorEmail}
                      </p>
                      {t.lastMessage && (
                        <p style={{ margin: '2px 0', fontSize: 13, color: '#7a9ca3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                          {t.lastMessage}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      {t.unreadByLab > 0 && (
                        <span style={{ background: '#a53828', color: '#fff', borderRadius: 12, padding: '1px 8px', fontSize: 12 }}>
                          {t.unreadByLab} new
                        </span>
                      )}
                      {t.lastAt && <small style={{ color: '#8aa6ac' }}>{pkt(t.lastAt)}</small>}
                      <button className="button" type="button" onClick={() => void openThread(t)}>
                        Open →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </>
      )}

      {/* ─── Search + new thread ────────────────────────────────────────── */}
      {!activeThread && tab === 'search' && (
        <>
          <form onSubmit={searchDoctors} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Doctor name, email, registration number or ID"
              maxLength={100}
              required
              style={{ flex: 1 }}
              aria-label="Search query"
            />
            <button className="button" type="submit" disabled={searching || !query.trim()}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </form>
          {searchError && <p role="alert" style={{ color: '#a53828' }}>{searchError}</p>}

          {results.length > 0 && !selectedDoctor && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>Select a doctor to message:</p>
              {results.map(d => (
                <div
                  key={d.id}
                  style={{
                    border: '1px solid #dce7e9', borderRadius: 8, padding: '10px 14px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: d.canContact ? '#fff' : '#fafafa', opacity: d.canContact ? 1 : 0.7,
                  }}
                >
                  <div>
                    <strong>Dr. {d.fullName}</strong>
                    <small style={{ display: 'block', color: '#5a7a80' }}>
                      {d.email}
                      {d.clinicName ? ` · ${d.clinicName}` : ''}
                      {d.registrationNumber ? ` · Reg: ${d.registrationNumber}` : ''}
                    </small>
                    {!d.canContact && (
                      <small style={{ color: '#a87040' }}>Not verified / no clinic assigned — cannot be messaged yet</small>
                    )}
                  </div>
                  <button
                    type="button"
                    className="button"
                    disabled={!d.canContact}
                    onClick={() => { setSelectedDoctor(d); setSubject(''); setFirstMsg(''); }}
                  >
                    Message this doctor
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedDoctor && (
            <form onSubmit={openOrStartThread}>
              <fieldset disabled={opening} style={{ border: 0, padding: 0 }}>
                <p style={{ background: '#e6f4f1', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                  Starting thread with <strong>Dr. {selectedDoctor.fullName}</strong>
                  {selectedDoctor.clinicName ? ` · ${selectedDoctor.clinicName}` : ''}
                  <button
                    type="button"
                    style={{ marginLeft: 12, background: 'none', border: 'none', color: '#a53828', cursor: 'pointer', fontSize: 13 }}
                    onClick={() => setSelectedDoctor(null)}
                  >
                    Change doctor
                  </button>
                </p>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
                  Subject
                  <input
                    required
                    minLength={2}
                    maxLength={200}
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Brief subject for this conversation"
                    style={{ display: 'block', width: '100%', marginTop: 4 }}
                  />
                </label>
                <label style={{ display: 'block', fontWeight: 600, margin: '12px 0 4px' }}>
                  First message
                  <textarea
                    required
                    minLength={1}
                    maxLength={5000}
                    rows={4}
                    value={firstMsg}
                    onChange={e => setFirstMsg(e.target.value)}
                    placeholder="Introduce the query or provide the context for this case discussion…"
                    style={{ display: 'block', width: '100%', marginTop: 4 }}
                  />
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="button" type="submit" disabled={opening || !subject.trim() || !firstMsg.trim()}>
                    {opening ? 'Opening…' : 'Start communication →'}
                  </button>
                  <button
                    type="button"
                    style={{ background: 'none', border: '1px solid #aebfc5', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}
                    onClick={() => setSelectedDoctor(null)}
                  >
                    Cancel
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </>
      )}
    </section>
  );
}
