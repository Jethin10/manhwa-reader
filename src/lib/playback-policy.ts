/** Browser hints are optional; the explicit preference works on every platform. */
export function saveDataEnabled(preference = false) {
  const connection =
    typeof navigator === "undefined"
      ? undefined
      : (
          navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string };
          }
        ).connection;
  return (
    preference ||
    connection?.saveData === true ||
    ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")
  );
}
