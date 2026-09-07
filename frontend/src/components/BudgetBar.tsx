import { formatMoney } from '../lib/format';
import type { EstadoPresupuesto } from '../lib/api';

const COLOR: Record<EstadoPresupuesto, string> = {
  ok: 'var(--good)',
  aviso: 'var(--warn)',
  alerta: 'var(--bad)',
};

const MENSAJE: Record<EstadoPresupuesto, string> = {
  ok: 'Vas bien',
  aviso: 'Te estás acercando a tu límite',
  alerta: 'Ya llegaste (o pasaste) tu presupuesto',
};

export function BudgetBar({
  gastado,
  presupuesto,
  estado,
  compacto = false,
}: {
  gastado: number;
  presupuesto: number | null;
  estado: EstadoPresupuesto;
  compacto?: boolean;
}) {
  const porcentaje = presupuesto && presupuesto > 0 ? Math.min(100, (gastado / presupuesto) * 100) : 0;
  const color = COLOR[estado];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className={compacto ? 'text-sm text-[color:var(--text-dim)]' : 'text-base font-medium'}>
          {formatMoney(gastado)}
          {presupuesto != null && <span className="text-[color:var(--text-dim)]"> de {formatMoney(presupuesto)}</span>}
        </span>
        {!compacto && presupuesto != null && (
          <span className="text-sm font-semibold" style={{ color }}>
            {Math.round((gastado / presupuesto) * 100)}%
          </span>
        )}
      </div>
      <div className="h-2.5 w-full rounded-full bg-[color:var(--surface-2)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${porcentaje}%`, background: color }}
        />
      </div>
      {!compacto && presupuesto != null && estado !== 'ok' && (
        <p className="text-xs mt-1.5" style={{ color }}>
          {MENSAJE[estado]}
        </p>
      )}
      {presupuesto == null && !compacto && (
        <p className="text-xs mt-1.5 text-[color:var(--text-dim)]">Sin presupuesto asignado para este periodo</p>
      )}
    </div>
  );
}
