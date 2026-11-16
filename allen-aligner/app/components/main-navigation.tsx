"use client";


import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./allen-mega-navigation.css";
import "./aa-dynamic-overflow.css";

import { navigationGroups, type SessionNavigation } from "../lib/navigation";

export default function MainNavigation({ path, session }: { path: string; session: SessionNavigation }) {
  const groups = navigationGroups(session);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(80);
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [visibleGroupCount, setVisibleGroupCount] = useState(Math.min(2, groups.length));
  const [hasOverflow, setHasOverflow] = useState(true);

  useLayoutEffect(() => {
    const node = root.current;
    const measurement = probe.current;
    if (!node || !measurement) return;
    const calculate = () => {
      const widths = Array.from(measurement.children).map(el => el.getBoundingClientRect().width);
      const nextCompact = window.matchMedia("(max-width: 1000px)").matches;
      let visible = nextCompact ? Math.min(2, groups.length) : 0;
      if (!nextCompact && widths.length) {
        const available = Math.max(0, node.clientWidth - 56);
        let used = widths[0];
        for (const width of widths.slice(1)) {
          if (used + 4 + width > available) break;
          used += 4 + width;
          visible += 1;
        }
      }
      const overflow = nextCompact || visible < groups.length;
      setCompact(nextCompact);
      setVisibleGroupCount(visible);
      setHasOverflow(overflow);
      if (!overflow) setMobileOpen(false);
    };
    const observer = new ResizeObserver(calculate);
    observer.observe(node);
    window.addEventListener("resize", calculate);
    document.fonts?.ready.then(calculate).catch(() => {});
    calculate();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", calculate);
    };
  }, [groups.length]);

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
      className="navigation-root aa-v9-root aa-dyn-root"
      data-compact={compact ? "true" : "false"}
      data-overflow={hasOverflow ? "true" : "false"}
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          const target = root.current?.querySelector<HTMLButtonElement>(mobileOpen ? ".aa-v9-toggle" : '.aa-v9-trigger[aria-expanded="true"]');
          close();
          target?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <button className="aa-v9-toggle" type="button" aria-expanded={mobileOpen} aria-controls="aa-v9-nav" onClick={() => {
        cancel();
        setOpen(null);
        const top = root.current?.closest("header")?.getBoundingClientRect().bottom ?? 80;
        root.current?.style.setProperty("--aa-header-bottom", `${top}px`);
        setMenuTop(top);
        setMobileOpen(value => !value);
      }}>
        <span className="aa-menu-icon" aria-hidden="true"><span /><span /><span /></span><span className="aa-menu-label">Menu</span>
      </button>
      <nav
        id="aa-v9-nav"
        style={mobileOpen ? {
          top: menuTop,
          maxHeight: `calc(100dvh - ${menuTop + 12}px)`,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gridAutoFlow: "row",
          gridAutoRows: "max-content",
          alignItems: "stretch",
          justifyItems: "stretch",
          alignContent: "start",
          justifyContent: "stretch",
          gap: 8,
        } : undefined}
        className={`aa-v9-nav aa-dyn-nav${mobileOpen ? " is-open" : ""}`}
        aria-label="Main navigation"
        onWheel={(e) => {
          const nav = e.currentTarget;
          const maxScroll = nav.scrollHeight - nav.clientHeight;
          if (maxScroll <= 0) return;
          const multiplier = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? nav.clientHeight : 1;
          nav.scrollTop = Math.max(0, Math.min(maxScroll, nav.scrollTop + e.deltaY * multiplier));
          e.preventDefault();
        }}
      >
        <Link href="/" className="aa-v9-link" onClick={close}>
          Home
        </Link>

        {groups.map((group, index) => {
          const active = group.links.some(([href]) =>
            path === href ||
            path.startsWith(`${href}/`) ||
            (href === "/doctor-dashboard" && path.startsWith("/doctor-dashboard/"))
          ) || (group.id === "owner" && path.startsWith("/owner/"));
          const expanded = open === group.id;

          return (
            <div
              className="aa-v9-group"
              style={mobileOpen ? {
                display: "block",
                alignItems: "stretch",
                width: "100%",
                minWidth: 0,
                height: "auto",
                flex: "0 0 auto",
              } : undefined}
              hidden={!mobileOpen && index >= visibleGroupCount}
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
                timer.current = setTimeout(() => {
                  setOpen((current) => current === group.id ? null : current);
                  timer.current = null;
                }, 300);
              }}
            >
              <button
                type="button"
                className={`aa-v9-trigger${expanded || active ? " is-active" : ""}`}
                aria-expanded={expanded}
                aria-controls={`aa-v9-panel-${group.id}`}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault(); cancel(); setOpen(group.id);
                    requestAnimationFrame(() => document.getElementById(`aa-v9-panel-${group.id}`)?.querySelector("a")?.focus());
                  }
                }}
                onClick={() => {
                  cancel();
                  setOpen(expanded ? null : group.id);
                }}
              >
                {group.label}
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
              </button>

              <div
                id={`aa-v9-panel-${group.id}`}
                className="aa-v9-dropdown"
                hidden={!mobileOpen && !expanded}
                style={mobileOpen ? {
                  position: "static",
                  inset: "auto",
                  display: expanded ? "block" : "none",
                  width: "100%",
                  minWidth: 0,
                  maxWidth: "none",
                  maxHeight: "none",
                  margin: "6px 0 8px",
                  transform: "none",
                  flex: "0 0 auto",
                } : undefined}
              >
                <h2>{group.label}</h2>
                {group.links.map(([href, label]) => (
                  <Link href={href} key={href} onClick={close} aria-current={path === href || (href !== "/" && path.startsWith(`${href}/`)) ? "page" : undefined} target={href === "/hr/login" ? "_blank" : undefined} rel={href === "/hr/login" ? "noopener noreferrer" : undefined}>
                    {label}
                  </Link>
                ))}
                {group.id === "account" && <>
                  {session.doctor && <form action="/api/doctor-logout" method="post"><button className="aa-logout" type="submit">Doctor Logout</button></form>}
                  {session.clinic && <form action="/api/clinic/auth/logout" method="post"><button className="aa-logout" type="submit">Clinic Logout</button></form>}
                  {session.hr && <form action="/api/hr/logout" method="post"><button className="aa-logout" type="submit">HR Logout</button></form>}
                </>}
              </div>
            </div>
          );
        })}

      </nav>
      <div ref={probe} className="aa-dyn-measure" aria-hidden="true">
        <span className="aa-v9-link">Home</span>
        {groups.map(group => <button type="button" tabIndex={-1} key={group.id} className="aa-v9-trigger">{group.label} <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></button>)}
      </div>
    </div>
  );
}



