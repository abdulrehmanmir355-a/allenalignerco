"use client";
import Link from "next/link";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <section className="panel empty-state" role="alert"><span className="eyebrow">WORKSPACE UNAVAILABLE</span><h2>We couldn’t load this view.</h2><p>Please retry. Your saved case information has not been changed.</p><div className="actions" style={{justifyContent:"center"}}><button className="button" onClick={reset}>Try again</button><Link className="text-link" href="/doctor-dashboard">Back to overview →</Link></div></section>;
}
