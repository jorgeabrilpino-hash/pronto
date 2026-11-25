import { Screen } from '@/components/Screen';

/** Temporary screen for routes whose slice is not built yet. */
export function Placeholder({ title, root = false }: { title: string; root?: boolean }) {
  return (
    <Screen title={title} back={!root}>
      <p className="text-muted">Pantalla en construcción.</p>
    </Screen>
  );
}
