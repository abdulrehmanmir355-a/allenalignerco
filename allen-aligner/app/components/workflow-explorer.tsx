"use client";
import { useId, useRef, useState } from "react";
import Link from "next/link";
import { workflowSteps } from "../lib/site-content";

export default function WorkflowExplorer() {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const step = workflowSteps[selected];
  return <div className="workflow-explorer">
    <div className="workflow-tabs" role="tablist" aria-label="Case workflow steps">
      {workflowSteps.map((item, index) => <button key={item.short} ref={el => { buttons.current[index] = el; }}
        id={`${id}-tab-${index}`} role="tab" aria-selected={selected === index}
        aria-controls={`${id}-panel`} tabIndex={selected === index ? 0 : -1}
        onClick={() => setSelected(index)} onKeyDown={event => {
          let next = selected;
          if (event.key === "ArrowRight") next = (selected + 1) % 4;
          else if (event.key === "ArrowLeft") next = (selected + 3) % 4;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = 3;
          else return;
          event.preventDefault(); setSelected(next); buttons.current[next]?.focus();
        }}><span>0{index + 1}</span>{item.short}<span aria-hidden="true">↗</span>
        {selected === index && <i className="workflow-progress" aria-hidden="true" onAnimationEnd={() => {
          setSelected(current => current === index ? (current + 1) % workflowSteps.length : current);
        }} />}</button>)}
    </div>
    <div className="workflow-detail" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`} tabIndex={0}>
      <div key={`step-number-${selected}`} className="workflow-step-number" aria-hidden="true">0{selected + 1}<span>/ 04</span></div>
      <div key={`step-copy-${selected}`} className="workflow-copy"><span className="eyebrow">YOUR NEXT STEP</span><h3>{step.title}</h3><p>{step.text}</p><div className="workflow-detail-tags">{step.detail.split(" · ").map(tag => <span key={tag}>{tag}</span>)}</div><Link className="text-link" href={step.href}>{step.action} <span aria-hidden="true">↗</span></Link></div>
    </div>
  </div>;
}
