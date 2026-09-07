export function PresenceDot({ enLinea }: { enLinea: boolean }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{
        background: enLinea ? 'var(--good)' : 'var(--text-dim)',
        boxShadow: enLinea ? '0 0 0 3px rgba(52, 211, 153, 0.18)' : 'none',
      }}
      title={enLinea ? 'En línea' : 'Desconectado'}
    />
  );
}
