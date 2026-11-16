"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MainNavigation from "./main-navigation";
import type { SessionNavigation } from "../lib/navigation";
import SiteSearch from "./site-search";
import SiteMotion from "./site-motion";

export function Brand() {
  return <Link href="/" className="brand" aria-label="Allen Aligner home"><span className="brand-mark" aria-hidden="true">a</span><span>allen<span className="brand-light">aligner</span><small>DIGITAL DENTISTRY, CONNECTED.</small></span></Link>;
}
export default function SiteShell({ children, session }: { children: React.ReactNode; session: SessionNavigation }) {
  const signedIn = session.doctor || session.hr || session.clinic;
  const workspace = session.doctor ? "/doctor-dashboard" : session.hr ? "/hr/offboarding/dashboard" : "/clinic/dashboard";
  const path = usePathname(), portal = path.startsWith("/doctor-dashboard");
  return <><a className="skip-link" href="#main-content">Skip to content</a><header className="site-header"><div className="container header-inner"><Brand/><MainNavigation key={path} path={path} session={session}/><SiteSearch/></div></header><div id="main-content" tabIndex={-1}>{children}</div><SiteMotion/>{!portal&&<footer className="site-footer"><div className="allen-footer-content footer-grid"><div><Brand/><p>A considered workspace for<br/>a connected dental practice.</p><Link className="text-link" href={signedIn ? workspace : "/doctor-register"}>{signedIn ? "Your Dashboard" : "Become part of the network ↗"}</Link></div><div><h3>Discover</h3><Link href="/about">Our approach</Link><Link href="/how-it-works">How it works</Link><Link href="/for-doctors">For doctors</Link><Link href="/catalog">Product information</Link></div><div><h3>Your workspace</h3>{!signedIn && <Link href="/doctor-login">Doctor sign-in</Link>}<Link href="/doctor-dashboard">Practice overview</Link><Link href="/doctor-dashboard/cases">Clinical cases</Link><Link href="/lab">Laboratory access</Link><Link href="/clinic/dashboard">Clinic management</Link></div><div><h3>Useful information</h3><Link href="/resources">Resource center</Link><Link href="/contact">Contact and support</Link><Link href="/ctn">CTN information</Link><Link href="/dms">DMS information</Link><Link href="/admin/login">Administration availability</Link></div></div><div className="allen-footer-meta footer-bottom"><span>© {new Date().getFullYear()} Allen Aligner. All rights reserved.</span><span>Professional care. Clearer connections.</span><a href="#main-content">Back to top ↑</a></div></footer>}</>;
}
