"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function MediaSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="media-sheet"
      aria-label={title}
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-hairline bg-card px-5 py-3">
        <h2 className="t-title3">{title}</h2>
        <button
          autoFocus
          onClick={onClose}
          className="btn btn-gray px-4"
          aria-label={`Close ${title}`}
        >
          Close
        </button>
      </header>
      <div className="space-y-5 p-5">{children}</div>
    </dialog>
  );
}
