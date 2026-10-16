/**
 * Resolves with the first shutdown signal received by the process.
 * Listeners are removed once a signal arrives.
 */
export function waitForShutdownSignal(
  signals: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"],
): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    const listeners = signals.map((signal) => {
      const listener = () => {
        removeListeners();
        resolve(signal);
      };

      process.once(signal, listener);

      return { signal, listener };
    });

    function removeListeners(): void {
      for (const { signal, listener } of listeners) {
        process.removeListener(signal, listener);
      }
    }
  });
}
