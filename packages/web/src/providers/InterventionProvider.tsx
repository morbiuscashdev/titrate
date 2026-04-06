import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type {
  InterventionPoint,
  InterventionContext,
  InterventionAction,
  InterventionHook,
  InterventionEntry,
} from '@titrate/sdk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InterventionState = {
  readonly isActive: boolean;
  readonly context: InterventionContext | null;
  readonly resolve: ((action: InterventionAction) => void) | null;
};

export type InterventionContextValue = {
  readonly state: InterventionState;
  readonly createInterventionHook: () => InterventionHook;
  readonly enabledPoints: ReadonlySet<InterventionPoint>;
  readonly setEnabledPoints: (points: ReadonlySet<InterventionPoint>) => void;
  readonly dismiss: (action: InterventionAction) => void;
  readonly journal: readonly InterventionEntry[];
  readonly clearJournal: () => void;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Only stuck-transaction is enabled by default. */
const DEFAULT_ENABLED_POINTS: ReadonlySet<InterventionPoint> = new Set([
  'stuck-transaction',
]);

const INITIAL_STATE: InterventionState = {
  isActive: false,
  context: null,
  resolve: null,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const InterventionCtx = createContext<InterventionContextValue | null>(null);

export type InterventionProviderProps = {
  readonly children: ReactNode;
};

/**
 * Provides an intervention hook that pauses the SDK disperse loop
 * until the user takes an action via the modal UI.
 *
 * The async Promise pattern works as follows:
 * 1. SDK calls `onIntervention(context)` and awaits the returned Promise
 * 2. Provider sets the context + a resolve function in React state
 * 3. InterventionModal renders based on state
 * 4. User clicks an action button, which calls `dismiss(action)`
 * 5. `dismiss` resolves the Promise and clears state
 * 6. SDK continues with the chosen action
 */
export function InterventionProvider({ children }: InterventionProviderProps) {
  const [state, setState] = useState<InterventionState>(INITIAL_STATE);
  const [enabledPoints, setEnabledPoints] =
    useState<ReadonlySet<InterventionPoint>>(DEFAULT_ENABLED_POINTS);
  const [journal, setJournal] = useState<readonly InterventionEntry[]>([]);

  const dismiss = useCallback((action: InterventionAction) => {
    setState((prev) => {
      if (prev.resolve) {
        prev.resolve(action);
      }
      return INITIAL_STATE;
    });
    // Record journal entry from current state (read before clearing)
    const currentContext = state.context;
    if (currentContext) {
      const entry: InterventionEntry = {
        timestamp: Date.now(),
        campaignId: currentContext.campaignId ?? '',
        point: currentContext.point,
        action: action.type,
        issueCount: currentContext.issues?.length ?? 0,
      };
      setJournal((j) => [...j, entry]);
    }
  }, [state.context]);

  const clearJournal = useCallback(() => setJournal([]), []);

  const createInterventionHook = useCallback((): InterventionHook => {
    return (context: InterventionContext) => {
      if (!enabledPoints.has(context.point)) {
        return Promise.resolve({ type: 'approve' });
      }

      return new Promise<InterventionAction>((resolve) => {
        setState({ isActive: true, context, resolve });
      });
    };
  }, [enabledPoints]);

  const value = useMemo(
    (): InterventionContextValue => ({
      state,
      createInterventionHook,
      enabledPoints,
      setEnabledPoints,
      dismiss,
      journal,
      clearJournal,
    }),
    [state, createInterventionHook, enabledPoints, setEnabledPoints, dismiss, journal, clearJournal],
  );

  return (
    <InterventionCtx.Provider value={value}>
      {children}
    </InterventionCtx.Provider>
  );
}

/**
 * Access the intervention context.
 *
 * @throws When called outside of an `<InterventionProvider>`.
 */
export function useIntervention(): InterventionContextValue {
  const context = useContext(InterventionCtx);
  if (!context) {
    throw new Error('useIntervention must be used within an InterventionProvider');
  }
  return context;
}
