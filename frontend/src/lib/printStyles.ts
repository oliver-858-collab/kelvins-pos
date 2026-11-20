/**
 * Thermal receipt & invoice print styles for Kelvin's POS System.
 * Inject these styles into <head> before calling window.print().
 */

export const RECEIPT_PRINT_STYLES_58MM = `
@media print {
  @page {
    size: 58mm auto;
    margin: 0;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  body, html {
    margin: 0;
    padding: 0;
    width: 58mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    line-height: 1.3;
    color: #000;
    background: #fff;
  }

  .no-print,
  .print-hide,
  nav,
  header,
  footer,
  aside,
  button,
  .modal-backdrop {
    display: none !important;
  }

  .receipt-container {
    width: 58mm;
    padding: 2mm;
    margin: 0 auto;
  }

  .receipt-header {
    text-align: center;
    margin-bottom: 3mm;
  }

  .receipt-header .logo {
    max-width: 30mm;
    max-height: 15mm;
    object-fit: contain;
  }

  .receipt-header .shop-name {
    font-size: 13px;
    font-weight: bold;
    margin: 1mm 0;
  }

  .receipt-header .shop-info {
    font-size: 9px;
    color: #333;
  }

  .receipt-divider {
    border: none;
    border-top: 1px dashed #000;
    margin: 2mm 0;
  }

  .receipt-meta {
    font-size: 9px;
    margin-bottom: 2mm;
  }

  .receipt-meta .meta-row {
    display: flex;
    justify-content: space-between;
  }

  .receipt-items {
    width: 100%;
    border-collapse: collapse;
    font-size: 9px;
    margin: 2mm 0;
  }

  .receipt-items th {
    text-align: left;
    border-bottom: 1px solid #000;
    padding: 0.5mm 0;
    font-weight: bold;
  }

  .receipt-items td {
    padding: 0.5mm 0;
    vertical-align: top;
  }

  .receipt-items .item-name {
    max-width: 28mm;
    word-break: break-word;
  }

  .receipt-items .item-qty {
    text-align: center;
    width: 8mm;
  }

  .receipt-items .item-price {
    text-align: right;
    white-space: nowrap;
  }

  .receipt-totals {
    margin-top: 2mm;
    font-size: 9px;
  }

  .receipt-totals .total-row {
    display: flex;
    justify-content: space-between;
    padding: 0.3mm 0;
  }

  .receipt-totals .grand-total {
    font-size: 12px;
    font-weight: bold;
    border-top: 1px solid #000;
    border-bottom: 2px solid #000;
    padding: 1mm 0;
    margin-top: 1mm;
  }

  .receipt-payments {
    font-size: 9px;
    margin-top: 2mm;
  }

  .receipt-footer {
    text-align: center;
    font-size: 9px;
    margin-top: 4mm;
    padding-top: 2mm;
    border-top: 1px dashed #000;
  }

  .receipt-barcode {
    text-align: center;
    margin: 2mm 0;
    font-size: 8px;
    letter-spacing: 2px;
  }
}
`;

export const RECEIPT_PRINT_STYLES_80MM = `
@media print {
  @page {
    size: 80mm auto;
    margin: 0;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  body, html {
    margin: 0;
    padding: 0;
    width: 80mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    line-height: 1.4;
    color: #000;
    background: #fff;
  }

  .no-print,
  .print-hide,
  nav,
  header,
  footer,
  aside,
  button,
  .modal-backdrop {
    display: none !important;
  }

  .receipt-container {
    width: 80mm;
    padding: 3mm;
    margin: 0 auto;
  }

  .receipt-header {
    text-align: center;
    margin-bottom: 4mm;
  }

  .receipt-header .logo {
    max-width: 40mm;
    max-height: 20mm;
    object-fit: contain;
  }

  .receipt-header .shop-name {
    font-size: 15px;
    font-weight: bold;
    margin: 1.5mm 0;
  }

  .receipt-header .shop-info {
    font-size: 10px;
    color: #333;
  }

  .receipt-divider {
    border: none;
    border-top: 1px dashed #000;
    margin: 3mm 0;
  }

  .receipt-meta {
    font-size: 10px;
    margin-bottom: 2mm;
  }

  .receipt-meta .meta-row {
    display: flex;
    justify-content: space-between;
  }

  .receipt-items {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
    margin: 3mm 0;
  }

  .receipt-items th {
    text-align: left;
    border-bottom: 1px solid #000;
    padding: 1mm 0;
    font-weight: bold;
  }

  .receipt-items td {
    padding: 0.8mm 0;
    vertical-align: top;
  }

  .receipt-items .item-name {
    max-width: 40mm;
    word-break: break-word;
  }

  .receipt-items .item-qty {
    text-align: center;
    width: 10mm;
  }

  .receipt-items .item-price {
    text-align: right;
    white-space: nowrap;
  }

  .receipt-totals {
    margin-top: 3mm;
    font-size: 10px;
  }

  .receipt-totals .total-row {
    display: flex;
    justify-content: space-between;
    padding: 0.5mm 0;
  }

  .receipt-totals .grand-total {
    font-size: 14px;
    font-weight: bold;
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
    padding: 1.5mm 0;
    margin-top: 1mm;
  }

  .receipt-payments {
    font-size: 10px;
    margin-top: 3mm;
  }

  .receipt-footer {
    text-align: center;
    font-size: 10px;
    margin-top: 5mm;
    padding-top: 3mm;
    border-top: 1px dashed #000;
  }
}
`;

export const A4_INVOICE_PRINT_STYLES = `
@media print {
  @page {
    size: A4 portrait;
    margin: 15mm 20mm;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  body, html {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #000;
    background: #fff;
    margin: 0;
    padding: 0;
  }

  .no-print,
  .print-hide,
  nav,
  aside,
  button,
  .modal-backdrop {
    display: none !important;
  }

  .invoice-container {
    width: 100%;
    max-width: 170mm;
    margin: 0 auto;
  }

  .invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10mm;
    padding-bottom: 5mm;
    border-bottom: 2px solid #2563eb;
  }

  .invoice-header .logo {
    max-width: 50mm;
    max-height: 25mm;
    object-fit: contain;
  }

  .invoice-header .shop-name {
    font-size: 20px;
    font-weight: bold;
    color: #2563eb;
  }

  .invoice-header .shop-address {
    font-size: 11px;
    color: #555;
    margin-top: 2mm;
  }

  .invoice-title {
    font-size: 24px;
    font-weight: bold;
    color: #1e3a8a;
    text-align: right;
    margin-bottom: 5mm;
  }

  .invoice-meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8mm;
  }

  .invoice-meta .label {
    font-weight: bold;
    color: #555;
  }

  .invoice-items {
    width: 100%;
    border-collapse: collapse;
    margin: 5mm 0;
  }

  .invoice-items thead tr {
    background: #2563eb;
    color: #fff;
  }

  .invoice-items th {
    padding: 2.5mm 3mm;
    text-align: left;
    font-size: 11px;
  }

  .invoice-items td {
    padding: 2mm 3mm;
    border-bottom: 1px solid #e5e7eb;
    font-size: 11px;
    vertical-align: top;
  }

  .invoice-items tr:nth-child(even) td {
    background: #f9fafb;
  }

  .invoice-totals {
    width: 70mm;
    margin-left: auto;
    margin-top: 5mm;
  }

  .invoice-totals .total-row {
    display: flex;
    justify-content: space-between;
    padding: 1.5mm 0;
    font-size: 11px;
    border-bottom: 1px solid #e5e7eb;
  }

  .invoice-totals .grand-total {
    font-size: 14px;
    font-weight: bold;
    color: #2563eb;
    border-top: 2px solid #2563eb;
    padding-top: 2mm;
  }

  .invoice-footer {
    margin-top: 15mm;
    padding-top: 5mm;
    border-top: 1px solid #e5e7eb;
    font-size: 10px;
    color: #6b7280;
    text-align: center;
  }

  .invoice-payment-info {
    margin-top: 8mm;
    padding: 3mm;
    border: 1px solid #e5e7eb;
    border-radius: 2mm;
    font-size: 11px;
  }
}
`;

/**
 * Inject print styles into document head.
 * Call this before window.print() and clean up after.
 */
export function injectPrintStyles(
  size: '58mm' | '80mm' | 'a4' = '80mm'
): () => void {
  const styleEl = document.createElement('style');
  styleEl.id = 'kelvins-pos-print-styles';

  switch (size) {
    case '58mm':
      styleEl.textContent = RECEIPT_PRINT_STYLES_58MM;
      break;
    case '80mm':
      styleEl.textContent = RECEIPT_PRINT_STYLES_80MM;
      break;
    case 'a4':
      styleEl.textContent = A4_INVOICE_PRINT_STYLES;
      break;
  }

  document.head.appendChild(styleEl);

  return () => {
    const el = document.getElementById('kelvins-pos-print-styles');
    if (el) el.remove();
  };
}
