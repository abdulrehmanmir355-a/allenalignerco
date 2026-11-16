"use client";
import { useId, useRef, useState } from "react";
import Link from "next/link";
import { workflowSteps } from "../lib/site-content";

export default function WorkflowExplorer() {
  const [selected, setSelected] = useState(0);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const step = workflowSteps[selected];
  const paused = manuallyPaused;
  const selectStep = (index: number) => setSelected((index + workflowSteps.length) % workflowSteps.length);
  return <div className="workflow-explorer">
    <div className="workflow-tabs" role="tablist" aria-label="Case workflow steps">
      {workflowSteps.map((item, index) => <button key={item.short} ref={el => { buttons.current[index] = el; }}
        id={`${id}-tab-${index}`} role="tab" aria-selected={selected === index}
        aria-controls={`${id}-panel`} tabIndex={selected === index ? 0 : -1}
        onClick={() => selectStep(index)} onKeyDown={event => {
          let next = selected;
          if (event.key === "ArrowRight") next = (selected + 1) % workflowSteps.length;
          else if (event.key === "ArrowLeft") next = (selected + workflowSteps.length - 1) % workflowSteps.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = workflowSteps.length - 1;
          else return;
          event.preventDefault(); selectStep(next); buttons.current[next]?.focus();
        }}><span>0{index + 1}</span>{item.short}<span aria-hidden="true">↗</span>
        {selected === index && !manuallyPaused && <i key={`${index}-${paused}`} className="workflow-progress" aria-hidden="true" style={{ animationPlayState: paused ? "paused" : "running" }} onAnimationEnd={() => {
          if (!paused) setSelected(current => current === index ? (current + 1) % workflowSteps.length : current);
        }} />}</button>)}
    </div>
    <div className="workflow-detail" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`} tabIndex={0}>
      <div key={`step-number-${selected}`} className="workflow-step-number" aria-hidden="true">0{selected + 1}<span>/ 04</span></div>
      <div key={`step-copy-${selected}`} className="workflow-copy"><span className="eyebrow">STEP 0{selected + 1} · YOUR NEXT STEP</span><h3>{step.title}</h3><p>{step.text}</p><div className="workflow-detail-tags">{step.detail.split(" · ").map(tag => <span key={tag}>{tag}</span>)}</div><Link className="text-link" href={step.href}>{step.action} <span aria-hidden="true">↗</span></Link></div>
    </div>
    <div className="workflow-controls" aria-label="Journey controls">
      <span className="workflow-current-step">Step {selected + 1} of {workflowSteps.length}</span>
      <div>
        <button type="button" className="workflow-control-button" onClick={() => selectStep(selected - 1)} aria-label="Previous journey step">← Previous</button>
        <button type="button" className="workflow-control-button" onClick={() => setManuallyPaused(value => !value)} aria-pressed={manuallyPaused}>{manuallyPaused ? "Resume journey" : "Pause journey"}</button>
        <button type="button" className="workflow-control-button is-primary" onClick={() => selectStep(selected + 1)}>Next step <span aria-hidden="true">→</span></button>
      </div>
    </div>
  </div>;
}
