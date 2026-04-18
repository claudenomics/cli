export function createRootAbortController(): AbortController {
  return new AbortController();
}

export function createChildAbortController(
  parent: AbortController,
  maxListeners?: number,
): AbortController {
  const child = new AbortController();
  if (parent.signal.aborted) {
    child.abort(parent.signal.reason);
    return child;
  }

  const weakChild = new WeakRef(child);
  const propagate = (): void => {
    const alive = weakChild.deref();
    if (alive && !alive.signal.aborted) alive.abort(parent.signal.reason);
  };

  if (typeof maxListeners === 'number') {
    const signal = parent.signal as AbortSignal & { setMaxListeners?: (n: number) => void };
    signal.setMaxListeners?.(maxListeners);
  }

  parent.signal.addEventListener('abort', propagate, { once: true });
  child.signal.addEventListener(
    'abort',
    () => {
      parent.signal.removeEventListener('abort', propagate);
    },
    { once: true },
  );

  return child;
}
