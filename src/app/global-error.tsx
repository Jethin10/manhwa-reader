"use client";

/** Last resort when the root layout itself fails; it replaces the whole document. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#000",
          color: "#fff",
          fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "rgba(235,235,245,.62)", marginTop: 8 }}>
            The app hit an unexpected error. Your library and downloads are safe on this device.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              border: 0,
              borderRadius: 999,
              padding: "12px 24px",
              fontWeight: 600,
              fontSize: 15,
              background: "#fff",
              color: "#000",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
