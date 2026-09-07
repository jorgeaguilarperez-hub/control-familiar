export function Kpi({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: 'good' | 'warn' | 'bad' }) {
  const color = tono ? `var(--${tono})` : 'var(--text)';
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-xs text-[color:var(--text-dim)] mb-1">{etiqueta}</div>
      <div className="heading text-2xl font-semibold" style={{ color }}>
        {valor}
      </div>
    </div>
  );
}
