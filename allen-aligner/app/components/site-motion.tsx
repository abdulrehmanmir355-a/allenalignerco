'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const revealSelector = [
  'main > :is(header, section, article, .section, .workflow-section, .editorial-hero, .page-hero, .page-heading)',
  'main > * > :is(.feature-grid, .professional-features, .resource-grid, .service-list, .steps, .stats-grid, .work-metrics, .identity-metrics, .footer-grid)',
  'main :is(.feature-card, .professional-feature, .resource-card, .service-list > article, .stats-grid > *, .work-metrics > *, .identity-metrics > *, .guide-panel, .cta-panel, .workflow-detail, .case-row)',
].join(',');
const countSelector = ':is(.stats-grid, .work-metrics, .identity-metrics) strong';

export default function SiteMotion() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.getElementById('main-content');
    const progress = document.querySelector<HTMLElement>('.aa-scroll-progress');
    if (!root) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionPreference.matches) return;
    // Run only after hydration; the server and first client render keep identical markup.

    let frame = 0;
    const counted = new WeakSet<HTMLElement>();
    const revealElements = new WeakSet<HTMLElement>();
    const revealDelays = new WeakMap<HTMLElement, number>();

    function countUp(element: HTMLElement) {
      if (counted.has(element)) return;
      const original = element.textContent?.trim() ?? '';
      const match = original.match(/^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/);
      if (!match) return;
      const value = Number(match[2].replaceAll(',', ''));
      if (!Number.isFinite(value) || value === 0) return;
      counted.add(element);
      const decimals = (match[2].split('.')[1] ?? '').length;
      const started = performance.now();
      const duration = 680;

      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 4);
        const current = value * eased;
        const formatted = current.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
        element.textContent = `${match[1]}${formatted}${match[3]}`;
        if (progress < 1) requestAnimationFrame(tick);
        else element.textContent = original;
      };
      requestAnimationFrame(tick);
    }

    const observer = 'IntersectionObserver' in window
      ? new IntersectionObserver(entries => {
          for (const entry of entries) {
            const element = entry.target as HTMLElement;
            if (!entry.isIntersecting) continue;
            if (revealElements.has(element)) {
              element.animate(
                [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }],
                { duration: 520, delay: revealDelays.get(element) ?? 0, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' },
              );
            } else {
              countUp(element);
            }
            observer?.unobserve(element);
          }
        }, { threshold: 0.14, rootMargin: '0px 0px -36px 0px' })
      : null;

    const registeredCounters = new WeakSet<HTMLElement>();
    let revealIndex = 0;
    function registerReveals(scope: ParentNode) {
      const elements = new Set<HTMLElement>();
      if (scope instanceof HTMLElement && scope.matches(revealSelector)) elements.add(scope);
      scope.querySelectorAll<HTMLElement>(revealSelector).forEach(element => elements.add(element));
      elements.forEach(element => {
        if (revealElements.has(element)) return;
        revealElements.add(element);
        revealDelays.set(element, Math.min(revealIndex++ % 5, 4) * 65);
        if (observer) observer.observe(element);
        else element.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 520, fill: 'both' });
      });
    }
    function registerCounters(scope: ParentNode) {
      const elements = new Set<HTMLElement>();
      if (scope instanceof HTMLElement && scope.matches(countSelector)) elements.add(scope);
      scope.querySelectorAll<HTMLElement>(countSelector).forEach(element => elements.add(element));
      elements.forEach(element => {
        if (registeredCounters.has(element)) {
          if (!counted.has(element) && observer) observer.observe(element);
          return;
        }
        registeredCounters.add(element);
        if (observer) observer.observe(element);
        else countUp(element);
      });
    }
    registerReveals(root);
    registerCounters(root);

    // Re-run the same entrance and counter effects when API-backed sections load later.
    const contentObserver = new MutationObserver(records => {
      for (const record of records) {
        if (record.target instanceof HTMLElement) {
          registerReveals(record.target);
          registerCounters(record.target);
        }
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) {
            registerReveals(node);
            registerCounters(node);
          }
        }
      }
    });
    contentObserver.observe(root, { childList: true, subtree: true });

    const progressScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const available = document.documentElement.scrollHeight - window.innerHeight;
        const amount = available > 0 ? Math.min(1, Math.max(0, window.scrollY / available)) : 0;
        progress?.style.setProperty('--aa-scroll-progress', String(amount));
      });
    };
    progressScroll();
    window.addEventListener('scroll', progressScroll, { passive: true });
    window.addEventListener('resize', progressScroll, { passive: true });


    return () => {
      observer?.disconnect();
      contentObserver.disconnect();
      window.removeEventListener('scroll', progressScroll);
      window.removeEventListener('resize', progressScroll);
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return <div className="aa-scroll-progress" aria-hidden="true"><span /></div>;
}
