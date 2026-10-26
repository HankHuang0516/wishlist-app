import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AuthScreen } from './AuthScreen';
import { GuestExploreScreen } from './GuestExploreScreen';
import { createAuthOperationGate } from './authOperation';
import type { RecoveryLink } from './authFlow';

export function GuestEntryScreen({ apiUrl, initialLink, externalBusy, externalIssue, onRetryRestore, onAuthenticated, onTermsAccepted, onCloseRecovery }: {
  apiUrl: string; initialLink: RecoveryLink | null; externalBusy: boolean; externalIssue?: string;
  onRetryRestore?: () => void; onAuthenticated: (value: unknown) => Promise<void>; onTermsAccepted: () => void; onCloseRecovery: () => void;
}) {
  const [authOpen, setAuthOpen] = useState(!!initialLink), operation = useRef(createAuthOperationGate()).current;
  useEffect(() => { if (initialLink) setAuthOpen(true); }, [initialLink]);
  return <View style={{ flex: 1 }}>
    <View style={{ flex: 1, display: authOpen ? 'none' : 'flex' }}>
      <GuestExploreScreen apiUrl={apiUrl} active={!authOpen} onSignIn={() => setAuthOpen(true)} />
    </View>
    {authOpen && <AuthScreen apiUrl={apiUrl} initialLink={initialLink} externalBusy={externalBusy} externalIssue={externalIssue}
      onRetryRestore={onRetryRestore} onAuthenticated={onAuthenticated} onTermsAccepted={onTermsAccepted} operationGate={operation}
      onBrowse={() => { if (operation.isRunning() || externalBusy) return; onCloseRecovery(); setAuthOpen(false); }} />}
  </View>;
}
