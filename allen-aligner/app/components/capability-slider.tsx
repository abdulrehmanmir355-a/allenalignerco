"use client";

import { useEffect, useState } from "react";

const cards = [
  { title: "Patient organization", text: "Keep each patient’s information and case history easy to find.", number: "01" },
  { title: "Clinical file management", text: "Bring scans, photographs and clinical records together around the case.", number: "02" },
  { title: "Plan review", text: "Review published plan versions and record the doctor’s decision.", number: "03" },
  { title: "Case communication", text: "Keep doctor and laboratory conversations connected to the case.", number: "04" },
];

export default function CapabilitySlider() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive(current => (current + 1) % cards.length), 6000);
    return () => window.clearInterval(timer);
  }, [paused, active]);

  const card = cards[active];
  const move = (direction: number) => setActive(current => (current + direction + cards.length) % cards.length);

  return (
    <section className="capability-slider" aria-label="Practice capabilities" aria-roledescription="carousel">
      <div className="capability-slider-card" key={card.number} aria-live="polite">
        <span className="capability-slider-kicker">ONE PRACTICE. A CLEARER PICTURE. <span>{card.number} / 04</span></span>
        <h2>{card.title}</h2>
        <p>{card.text}</p>
        <div className="capability-slider-controls" aria-label="Capability slides">
          <button type="button" className="capability-arrow" onClick={() => move(-1)} aria-label="Previous capability">←</button>
          <div className="capability-dots">
            {cards.map((item, index) => <button key={item.number} type="button" aria-label={`Show slide ${index + 1}: ${item.title}`} aria-current={active === index ? "true" : undefined} onClick={() => setActive(index)}><span /></button>)}
          </div>
          <button type="button" className="capability-arrow" onClick={() => move(1)} aria-label="Next capability">→</button>
          <button type="button" className="capability-play" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "Play" : "Pause"}</button>
        </div>
      </div>
    </section>
  );
}
