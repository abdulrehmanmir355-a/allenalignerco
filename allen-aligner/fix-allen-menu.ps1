
$ErrorActionPreference = "Stop"

$root = "C:\Users\NZ\Desktop\AllenAligner\allen-aligner"
Set-Location $root

$nav = Join-Path $root "app\components\main-navigation.tsx"
$css = Join-Path $root "app\components\allen-mega-navigation.css"

if (!(Test-Path $nav)) {
  throw "Main navigation file not found."
}

$react = @'
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./allen-mega-navigation.css";

const groups = [
  {
    id: "discover",
    label: "Discover",
    links: [
      ["/about", "Our approach"],
      ["/how-it-works", "How it works"],
    ],
  },
  {
    id: "doctors",
    label: "For Doctors",
    links: [
      ["/for-doctors", "Doctor overview"],
      ["/doctor-dashboard", "Your workspace"],
      ["/doctor-register", "Register your practice"],
    ],
  },
  {
    id: "resources",
    label: "Resources",
    links: [
      ["/resources", "Resource center"],
      ["/contact", "Contact and support"],
      ["/lab", "Laboratory workspace"],
    ],
  },
];

export default function MainNavigation({ path }: { path: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);

  function cancel() {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function close() {
    cancel();
    setOpen(null);
    setMobileOpen(false);
  }

  function desktop() {
    return window.matchMedia(
      "(min-width: 1001px) and (hover: hover) and (pointer: fine)"
    ).matches;
  }

  useEffect(() => {
    function outside(e: PointerEvent) {
      if (e.target instanceof Node && !root.current?.contains(e.target)) {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        setOpen(null);
        setMobileOpen(false);
      }
    }

    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      className="navigation-root aa-v9-root"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          close();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <button
        className="aa-v9-toggle"
        type="button"
        aria-expanded={mobileOpen}
        aria-controls="aa-v9-nav"
        onClick={() => {
          cancel();
          setOpen(null);
          setMobileOpen(!mobileOpen);
        }}
      >
        {mobileOpen ? "Close" : "Menu"}
      </button>

      <nav
        id="aa-v9-nav"
        className={`aa-v9-nav${mobileOpen ? " is-open" : ""}`}
        aria-label="Main navigation"
      >
        <Link href="/" className="aa-v9-link" onClick={close}>
          Home
        </Link>

        {groups.map((group) => {
          const active = group.links.some(([href]) =>
            path === href || (href === "/doctor-dashboard" && path.startsWith("/doctor-dashboard/"))
          );
          const expanded = open === group.id;

          return (
            <div
              className="aa-v9-group"
              key={group.id}
              onPointerEnter={(e) => {
                if (e.pointerType !== "mouse" || !desktop()) return;
                cancel();
                timer.current = setTimeout(() => {
                  setOpen(group.id);
                  timer.current = null;
                }, 300);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== "mouse" || !desktop()) return;
                cancel();
                setOpen((current) =>
                  current === group.id ? null : current
                );
              }}
            >
              <button
                type="button"
                className={`aa-v9-trigger${expanded || active ? " is-active" : ""}`}
                aria-expanded={expanded}
                aria-controls={`aa-v9-panel-${group.id}`}
                onFocus={() => {
                  if (desktop()) {
                    cancel();
                    setOpen(group.id);
                  }
                }}
                onClick={(e) => {
                  if (!desktop() || e.detail === 0) {
                    cancel();
                    setOpen(expanded ? null : group.id);
                  }
                }}
              >
                {group.label}
                <span aria-hidden="true">⌄</span>
              </button>

              <div
                id={`aa-v9-panel-${group.id}`}
                className="aa-v9-dropdown"
                hidden={!expanded}
              >
                <h2>{group.label}</h2>
                {group.links.map(([href, label]) => (
                  <Link href={href} key={href} onClick={close}>
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        <Link
          href="/doctor-login"
          className="aa-v9-link"
          onClick={close}
        >
          Doctor Login
        </Link>

        <Link
          href="/doctor-register"
          className="aa-v9-join"
          onClick={close}
        >
          Join the Network
        </Link>
      </nav>
    </div>
  );
}
'@

$style = @'
/* ALLEN ALIGNER — NAVIGATION V9 */

.aa-v9-root {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: visible !important;
}

.aa-v9-nav {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  min-height: 56px;
  overflow: visible !important;
}

.aa-v9-group {
  position: relative;
}

.aa-v9-nav .aa-v9-link,
.aa-v9-nav .aa-v9-trigger,
.aa-v9-nav .aa-v9-join {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 11px 16px !important;
  border-radius: 12px !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  color: #123B66 !important;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: none;
  transition:
    background-color 300ms ease,
    color 300ms ease,
    box-shadow 300ms ease;
}

.aa-v9-nav .aa-v9-join {
  background: #123B66 !important;
  color: #EAF6F7 !important;
}

.aa-v9-dropdown {
  position: absolute;
  left: 0;
  top: 100%;
  width: 270px;
  padding: 16px;
  z-index: 9999;
  background: #123B66 !important;
  border: 1px solid #20B8B1;
  border-radius: 14px !important;
  box-shadow: 0 18px 36px rgba(18,59,102,.2);
  animation: aa-v9-in 300ms ease both;
}

.aa-v9-dropdown[hidden] {
  display: none !important;
}

.aa-v9-dropdown h2 {
  margin: 0 0 12px !important;
  font-size: 15px !important;
  color: #EAF6F7 !important;
}

.aa-v9-dropdown a {
  display: block;
  padding: 12px 14px;
  margin-bottom: 4px;
  color: #EAF6F7 !important;
  background: transparent !important;
  border-radius: 10px !important;
  text-decoration: none;
  font-size: 14px;
  transition:
    background-color 300ms ease,
    color 300ms ease;
}

@media (hover:hover) and (min-width:1001px) {
  .aa-v9-nav .aa-v9-trigger:hover,
  .aa-v9-nav .aa-v9-trigger[aria-expanded="true"],
  .aa-v9-nav .aa-v9-link:hover,
  .aa-v9-nav .aa-v9-join:hover {
    background: #123B66 !important;
    color: #EAF6F7 !important;
    box-shadow: inset 0 -3px #20B8B1 !important;
  }

  .aa-v9-dropdown a:hover {
    background: #EAF6F7 !important;
    color: #123B66 !important;
  }
}

@keyframes aa-v9-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.aa-v9-toggle {
  display: none;
  padding: 11px 17px;
  min-height: 44px;
  border-radius: 12px !important;
  background: #123B66 !important;
  color: #EAF6F7 !important;
  border: 1px solid #20B8B1;
}

@media (max-width:1000px) {
  .aa-v9-root {
    display: flex;
    justify-content: flex-end;
  }

  .aa-v9-toggle {
    display: inline-flex;
  }

  .aa-v9-nav {
    display: none;
    position: absolute;
    top: 100%;
    right: 0;
    width: min(440px, calc(100vw - 24px));
    max-height: 80vh;
    overflow-y: auto !important;
    flex-direction: column;
    align-items: stretch;
    background: #EAF6F7;
    padding: 14px;
    border: 1px solid #20B8B1;
    border-radius: 14px;
    z-index: 999;
  }

  .aa-v9-nav.is-open {
    display: flex;
  }

  .aa-v9-nav .aa-v9-group,
  .aa-v9-nav .aa-v9-trigger,
  .aa-v9-nav .aa-v9-link,
  .aa-v9-nav .aa-v9-join {
    width: 100%;
  }

  .aa-v9-nav .aa-v9-trigger {
    justify-content: space-between;
  }

  .aa-v9-dropdown {
    position: static;
    width: 100%;
    box-shadow: none;
  }
}

@media (prefers-reduced-motion:reduce) {
  .aa-v9-root * {
    animation: none !important;
    transition: none !important;
  }
}
'@

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$utf8 = [System.Text.UTF8Encoding]::new($false)

$oldReact = [IO.File]::ReadAllText($nav)
$cssExists = Test-Path $css
$oldCSS = if ($cssExists) { [IO.File]::ReadAllText($css) } else { "" }

Copy-Item -LiteralPath $nav -Destination "$nav.backup-$stamp"
if ($cssExists) {
  Copy-Item -LiteralPath $css -Destination "$css.backup-$stamp"
}

[IO.File]::WriteAllText($nav, $react, $utf8)
[IO.File]::WriteAllText($css, $style, $utf8)

$env:Path = "C:\Users\NZ\Downloads\node-v24.22.0-win-x64\node-v24.22.0-win-x64;" + $env:Path

npx.cmd tsc --noEmit

if ($LASTEXITCODE -eq 0) {
  Write-Host "SUCCESS: Individual dropdown menus installed." -ForegroundColor Green
  Write-Host "Solutions removed."
  Write-Host "Discover / For Doctors / Resources added."
  Write-Host "Hover delay: 300ms."
  Write-Host "TypeScript check passed."
}
else {
  [IO.File]::WriteAllText($nav, $oldReact, $utf8)
  if ($cssExists) {
    [IO.File]::WriteAllText($css, $oldCSS, $utf8)
  } else {
    Remove-Item -LiteralPath $css -Force
  }
  Write-Host "TypeScript failed. Original files restored." -ForegroundColor Red
}
