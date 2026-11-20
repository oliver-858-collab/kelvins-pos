import { useCallback, useEffect } from 'react';
import { Bell, TriangleAlert } from 'lucide-react';
import { getStockAlertSummary } from '../../services/checkoutService';
import { useData } from './WorkspaceUI';

export default function StockIndicator({ branch, revision, open }: { branch: string; revision: number; open: () => void }) {
  const load = useCallback(() => getStockAlertSummary(branch), [branch, revision]);
  const { data, error, loading, reload } = useData(load);
  const total = data ? data.low + data.out : 0;

  useEffect(() => {
    if (loading) return;
    const refresh = () => { if (document.visibilityState === 'visible') reload(); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [loading, reload]);

  const label = error ? 'Stock alert status unavailable' : data
    ? `Stock alerts: ${data.low} low, ${data.out} out of stock` : 'Checking stock alerts';
  return <button type="button" className={`pos-stock-indicator ${total > 0 ? 'has-alerts' : ''}`}
    aria-label={label} title={label} onClick={open}>
    {total || error ? <TriangleAlert size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
    <span>{total ? 'Low stock' : 'Stock alerts'}</span>
    {total > 0 && <strong>{total}</strong>}
  </button>;
}
