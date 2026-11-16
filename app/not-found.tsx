import Link from "next/link";
export default function NotFound() { return <main className="container section empty-state"><span className="eyebrow">404 / PAGE NOT FOUND</span><h1>Let’s get you back<br/>on the right path.</h1><p>This page or case could not be found.</p><Link href="/" className="button">Back to home →</Link></main>; }
