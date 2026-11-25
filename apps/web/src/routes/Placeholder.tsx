import { Screen } from '@/components/Screen';

/** Temporary screen for routes whose slice is not built yet. */
export function Placeholder({ title }: { title: string }) {
  return (
    <Screen title={title}>
      <p className="text-muted">Pantalla en construcción.</p>
    </Screen>
  );
}
