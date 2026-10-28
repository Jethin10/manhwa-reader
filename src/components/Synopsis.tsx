"use client";

import { useState } from "react";

export function Synopsis({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420;
  return (
    <div className="max-w-[680px] text-[15px] leading-[1.6] text-label/80">
      <div className={!open && long ? "line-clamp-4" : ""}>
        {text.split(/\n\s*\n/).map((p, i) => (
          <p key={i} className={i ? "mt-3" : ""}>
            {p}
          </p>
        ))}
      </div>
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="mt-1 text-[15px] font-medium text-accent">
          {open ? "less" : "more"}
        </button>
      )}
    </div>
  );
}
