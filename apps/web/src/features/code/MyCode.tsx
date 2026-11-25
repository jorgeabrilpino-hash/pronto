import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCompany } from '@/api/session';
import { Button } from '@/components/Button';
import { IconScan } from '@/components/icons';
import { Scanner } from '@/components/Scanner';
import { Screen } from '@/components/Screen';
import { CodeCard } from '@/features/auth/CodeCard';
import { codeFromScan } from './scan';

/** View 11: my QR and code, plus Escanear. */
export function MyCode() {
  const company = useCompany();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  if (!company) return null;

  function onResult(text: string) {
    const code = codeFromScan(text);
    setScanning(false);
    if (code) navigate(`/e/${code}`);
  }

  return (
    <Screen
      title="Mi código"
      footer={
        <Button onClick={() => setScanning(true)}>
          <IconScan size={20} />
          Escanear
        </Button>
      }
    >
      <CodeCard company={company} />
      <Scanner open={scanning} onClose={() => setScanning(false)} onResult={onResult} />
    </Screen>
  );
}
