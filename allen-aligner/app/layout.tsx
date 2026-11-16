import type { Metadata } from "next";
import Script from "next/script";
import { currentClinic } from "./lib/clinic-auth";
import { currentDoctor } from "./lib/portal-auth";
import { currentHR } from "./lib/hr-auth";
import { currentOwner } from "./lib/owner-auth";
import { clinicalActor } from "./lib/clinical-auth";
import SiteShell from "./components/site-shell";
import "./globals.css";
import "./professional.css";
import "./allen-aligner-theme.css";
import "./management.css";
import "./aa-browser-fonts.css";
import "./site-motion.css";
import "./header-glass.css";
import "./responsive-fixes.css";

export const metadata: Metadata = { title: { default: "Allen Aligner | A clearer way forward", template: "%s | Allen Aligner" }, description: "Explore Allen Aligner's digital workflow and professional doctor portal." };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [doctor, hr, clinic, clinical, owner] = await Promise.all([currentDoctor().catch(() => null), currentHR().catch(() => null), currentClinic().catch(() => null), clinicalActor().catch(() => null), currentOwner().catch(() => null)]);
  return <html lang="en" data-theme="light"><body><SiteShell session={{ doctor: !!doctor, hr: !!hr, clinic: !!clinic, owner: !!owner, clinicalRole: clinical?.role ?? null }}>{children}</SiteShell><Script src="/aa-global-button-loader.js?v=5" strategy="afterInteractive" /></body></html>;
}
