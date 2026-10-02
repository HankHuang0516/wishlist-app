import { useCallback, useRef, useState } from 'react';
import { ApiFailure } from './marketplaceApi';

export const shouldPauseChatReads = (failure: unknown) => failure instanceof ApiFailure && (failure.status === 401 || failure.status === 429);

// A deadline expiring or returning to the foreground is not explicit recovery.
// A later failure also prevents an earlier successful read from lifting a pause.
export function useChatReadPause() {
  const control = useRef({ paused: false, generation: 0 });
  const [paused, setPaused] = useState(false);
  const pause = useCallback(() => {
    control.current.paused = true;
    control.current.generation++;
    setPaused(true);
  }, []);
  const resume = useCallback((generation: number) => {
    if (control.current.generation !== generation) return;
    control.current.paused = false;
    setPaused(false);
  }, []);
  return { control, paused, pause, resume };
}
