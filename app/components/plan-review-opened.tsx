'use client';
import { useEffect, useRef } from 'react';

export default function PlanReviewOpened({ action, planId }: { action: string; planId: string }) {
  const marker = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      observer.disconnect();
      // Records display of this exact version, never claims that a clinical review was completed.
      void fetch(action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'opened', planId }) }).catch(() => {});
    });
    if (marker.current) observer.observe(marker.current);
    return () => observer.disconnect();
  }, [action, planId]);
  return <p ref={marker} className="fine-print">Review the supplied files and written plan before recording your decision. Approval records your authenticated application decision.</p>;
}
