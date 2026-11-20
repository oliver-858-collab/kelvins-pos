import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Printer } from 'lucide-react';
import { displayDay, formatMoney } from '../../lib/business';
import { getCheckoutReceipt, paymentName, type Shop } from '../../services/checkoutService';
import { Dialog, LoadError, useData } from './WorkspaceUI';

type PaperWidth = 58 | 80;
const paperKey = 'kelvins-pos:receipt-width';

function loadPaperWidth(): PaperWidth {
  try { return localStorage.getItem(paperKey) === '80' ? 80 : 58; }
  catch { return 58; }
}

export default function Receipt({ saleId, shop, close }: { saleId: string; shop: Shop; close: () => void }) {
  const [width, setWidth] = useState<PaperWidth>(loadPaperWidth);
  const paper = useRef<HTMLElement>(null);
  const load = useCallback(() => getCheckoutReceipt(saleId), [saleId]);
  const data = useData(load);
  const receipt = data.data;
  const money = formatMoney(shop.currency);
  const time = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: shop.timezone });

  useLayoutEffect(() => {
    const element = paper.current;
    if (!element) return;
    const style = document.createElement('style');
    style.dataset.posThermalPrint = String(width);
    document.head.append(style);

    const layOutPage = () => {
      const copy = element.cloneNode(true) as HTMLElement;
      copy.classList.add('pos-receipt-measure');
      copy.style.width = `${width - 8}mm`;
      document.body.append(copy);
      const contentHeightMm = copy.getBoundingClientRect().height * 25.4 / 96;
      copy.remove();
      const pageLength = Math.max(45, Math.ceil(contentHeightMm) + 10);
      style.textContent = `@media print { @page { size: ${width}mm ${pageLength}mm; margin: 4mm; } }`;
    };
    layOutPage();
    window.addEventListener('beforeprint', layOutPage);
    return () => {
      window.removeEventListener('beforeprint', layOutPage);
      style.remove();
    };
  }, [receipt, width]);

  function choosePaper(value: PaperWidth) {
    setWidth(value);
    try { localStorage.setItem(paperKey, String(value)); } catch { /* Printing still works without saved preferences. */ }
  }

  return <Dialog title="Sales receipt" close={close} className="pos-receipt-dialog">
    <LoadError message={data.error} retry={data.reload} />
    {data.loading && !receipt && <p className="pos-empty" role="status">Loading receipt…</p>}
    {receipt && <>
      <div className="pos-receipt-preview">
        <article ref={paper} className="pos-receipt-paper" style={{ '--receipt-width': `${width - 8}mm` } as CSSProperties}>
          <div className="pos-receipt-merchant">
            <h3>{shop.shop_name}</h3>
            {receipt.branch && <div>{receipt.branch.name}</div>}
            <div>{receipt.branch?.address || [shop.address, shop.city].filter(Boolean).join(', ')}</div>
            <div>{receipt.branch?.phone || shop.phone}</div>
            {(shop.kra_pin || shop.tax_pin) && <div>Tax PIN {shop.kra_pin || shop.tax_pin}</div>}
            {shop.receipt_header && <div>{shop.receipt_header}</div>}
            {receipt.status !== 'completed' && <strong className="pos-receipt-status">{receipt.status.toUpperCase()}</strong>}
          </div>
          <dl className="pos-receipt-meta">
            <div><dt>Receipt</dt><dd>{receipt.receipts[0].receipt_number}</dd></div>
            <div><dt>Sale</dt><dd>{receipt.sale_number}</dd></div>
            <div><dt>Date</dt><dd>{time.format(new Date(receipt.created_at))}</dd></div>
            {receipt.customer_name && <div><dt>Customer</dt><dd>{receipt.customer_name}</dd></div>}
            {receipt.cashier_name && <div><dt>Staff</dt><dd>{receipt.cashier_name}</dd></div>}
          </dl>
          <table>
            <thead><tr><th scope="col">Item</th><th scope="col">Amount</th></tr></thead>
            <tbody>{receipt.sale_items.map(item => <tr key={item.id}>
              <td>{item.name}<small>{item.quantity} × {money(item.unit_price)}</small></td>
              <td>{money(item.total_price)}</td>
            </tr>)}</tbody>
          </table>
          <dl className="pos-receipt-meta">
            {shop.receipt_show_tax && <>
              <div><dt>Subtotal</dt><dd>{money(receipt.subtotal)}</dd></div>
              <div><dt>{shop.tax_name}</dt><dd>{money(receipt.tax_amount)}</dd></div>
            </>}
            {receipt.discount_amount > 0 && <div><dt>Discount</dt><dd>−{money(receipt.discount_amount)}</dd></div>}
            <div className="pos-receipt-total"><dt>Total</dt><dd>{money(receipt.total_amount)}</dd></div>
            {receipt.sale_payments.map((payment, index) => <div key={index}>
              <dt>{paymentName(payment.payment_method)}{payment.reference && <small>{payment.reference}</small>}</dt>
              <dd>{money(payment.payment_method === 'cash' ? payment.tendered_amount ?? receipt.amount_paid : payment.amount)}</dd>
            </div>)}
            {receipt.change_amount > 0 && <div><dt>Change</dt><dd>{money(receipt.change_amount)}</dd></div>}
            {receipt.is_credit && <>
              <div><dt>Outstanding</dt><dd>{money(Math.max(0, receipt.total_amount - receipt.amount_paid))}</dd></div>
              {!!receipt.credit_due_date && <div><dt>Due</dt><dd>{displayDay(receipt.credit_due_date)}</dd></div>}
            </>}
          </dl>
          {shop.receipt_footer && <p className="pos-receipt-merchant">{shop.receipt_footer}</p>}
        </article>
      </div>
      <div className="pos-receipt-actions">
        <label className="pos-field">Paper width<select value={width} onChange={event => choosePaper(Number(event.target.value) === 80 ? 80 : 58)}>
          <option value="58">58 mm</option><option value="80">80 mm</option>
        </select></label>
        <button type="button" className="pos-primary" onClick={() => window.print()}><Printer size={17} /> Print receipt</button>
      </div>
    </>}
  </Dialog>;
}
