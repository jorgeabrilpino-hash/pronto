import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { sessionStore, useSession } from '@/api/session';
import { lockTestAccount } from '@/wallet';
import { nextRoute } from './signIn';
import { BackupStep } from './testAccount/BackupStep';
import { FundStep } from './testAccount/FundStep';
import { PinStep } from './testAccount/PinStep';

type Step =
  | { id: 'pin' }
  | { id: 'backup'; address: string; pin: string }
  | { id: 'fund'; address: string };

/** Create the testnet account: PIN, recovery key, funds. */
export function TestAccount() {
  const session = useSession();
  const [step, setStep] = useState<Step>({ id: 'pin' });

  // Leaving the flow without signing in locks the new key.
  useEffect(
    () => () => {
      if (!sessionStore.get()) void lockTestAccount();
    },
    [],
  );

  if (session) return <Navigate to={nextRoute(session)} replace />;
  if (step.id === 'pin') {
    return <PinStep onDone={(address, pin) => setStep({ id: 'backup', address, pin })} />;
  }
  if (step.id === 'backup') {
    return (
      <BackupStep pin={step.pin} onDone={() => setStep({ id: 'fund', address: step.address })} />
    );
  }
  return <FundStep address={step.address} />;
}
