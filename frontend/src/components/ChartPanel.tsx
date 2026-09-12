import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../lib/format';

const PALETA = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#60a5fa', '#fb7185', '#c084fc'];

function TooltipMonto({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // La gráfica de barras sí manda "label" (viene del eje X), pero la
  // circular (por categoría) no -- ahí el nombre solo viene dentro de
  // "payload" (por el nameKey="nombre" del Pie). Sin este respaldo, el
  // tooltip de "Gasto por categoría" mostraba nada más el monto, sin decir
  // de qué categoría era.
  const nombre = label ?? payload[0].name ?? payload[0].payload?.nombre;
  return (
    <div className="glass rounded-lg px-3 py-2 text-sm">
      {nombre && <div className="text-[color:var(--text-dim)] mb-0.5">{nombre}</div>}
      <div className="font-semibold">{formatMoney(payload[0].value)}</div>
    </div>
  );
}

// El clic en una barra/rebanada avisa con el dato completo (no solo el
// índice) para que quien lo use no tenga que volver a buscarlo en su
// propia lista -- así Reportes.tsx solo necesita leer el id que ya trae.
export function GraficaBarras<T extends { nombre: string; gastado: number }>({
  datos,
  onClic,
}: {
  datos: T[];
  onClic?: (dato: T) => void;
}) {
  if (datos.length === 0) {
    return <p className="text-sm text-[color:var(--text-dim)] py-8 text-center">Todavía no hay gastos para graficar.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={datos} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="nombre" stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--text-dim)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => formatMoney(v)} width={70} />
        <Tooltip content={<TooltipMonto />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="gastado" radius={[6, 6, 0, 0]}>
          {datos.map((d, i) => (
            <Cell
              key={i}
              fill={PALETA[i % PALETA.length]}
              cursor={onClic ? 'pointer' : undefined}
              onClick={onClic ? () => onClic(d) : undefined}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GraficaCircular<T extends { nombre: string; gastado: number }>({
  datos,
  onClic,
}: {
  datos: T[];
  onClic?: (dato: T) => void;
}) {
  if (datos.length === 0) {
    return <p className="text-sm text-[color:var(--text-dim)] py-8 text-center">Todavía no hay gastos para graficar.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={datos} dataKey="gastado" nameKey="nombre" innerRadius={55} outerRadius={95} paddingAngle={2}>
          {datos.map((d, i) => (
            <Cell
              key={i}
              fill={PALETA[i % PALETA.length]}
              stroke="var(--bg)"
              strokeWidth={2}
              cursor={onClic ? 'pointer' : undefined}
              onClick={onClic ? () => onClic(d) : undefined}
            />
          ))}
        </Pie>
        <Tooltip content={<TooltipMonto />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function Leyenda({ datos }: { datos: { nombre: string; gastado: number }[] }) {
  const total = datos.reduce((s, d) => s + d.gastado, 0);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
      {datos.map((d, i) => (
        <div key={d.nombre} className="flex items-center gap-1.5 text-xs text-[color:var(--text-dim)]">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: PALETA[i % PALETA.length] }} />
          {d.nombre} · {total > 0 ? Math.round((d.gastado / total) * 100) : 0}%
        </div>
      ))}
    </div>
  );
}
