import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CircleAlert, Package, X } from 'lucide-react';
import { errorMessage } from '../../lib/business';

export function useData<T>(load: () => Promise<T>, enabled = true) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: enabled });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState(previous => ({ data: previous.data, loading: true }));
    load().then(
      data => { if (active) setState({ data, loading: false }); },
      error => { if (active) setState(previous => ({ ...previous, error: errorMessage(error), loading: false })); },
    );
    return () => { active = false; };
  }, [load, revision, enabled]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  return { ...state, reload };
}

export function LoadError({ message, retry }: { message?: string; retry?: () => void }) {
  if (!message) return null;
  return <div role="alert" className="pos-error"><CircleAlert size={17} />{message}
    {retry && <button type="button" className="pos-secondary" onClick={retry}>Retry</button>}
  </div>;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="pos-empty"><Package size={24} aria-hidden="true" /><div>{children}</div>{action}</div>;
}

export function ProductPhoto({ image, className = '' }: { image: string | null; className?: string }) {
  const [failed, setFailed] = useState('');
  return <div className={`pos-product-photo ${className}`}>
    {image && image !== failed
      ? <img src={image} alt="" loading="lazy" decoding="async" onError={() => setFailed(image)} />
      : <Package size={23} aria-hidden="true" />}
  </div>;
}

export function Pagination({ page, count, size, onPage, loading }: {
  page: number; count: number; size: number; onPage: (page: number) => void; loading?: boolean;
}) {
  return <div className="pos-pagination">
    <span>{count ? `${Math.min(count, page * size + 1)}–${Math.min(count, (page + 1) * size)} of ${count}` : '0 results'}</span>
    <button type="button" className="pos-icon-button" aria-label="Previous page" onClick={() => onPage(page - 1)} disabled={!page || loading}><ChevronLeft size={17} /></button>
    <button type="button" className="pos-icon-button" aria-label="Next page" onClick={() => onPage(page + 1)} disabled={(page + 1) * size >= count || loading}><ChevronRight size={17} /></button>
  </div>;
}

export function Dialog({ title, children, close, wide, className = '' }: {
  title: string; children: ReactNode; close: () => void; wide?: boolean; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return createPortal(<dialog aria-label={title} ref={ref}
    className={`pos-dialog ${wide ? 'pos-dialog-wide' : ''} ${className}`}
    onCancel={event => { event.preventDefault(); close(); }}>
    <div className="pos-dialog-head"><h2>{title}</h2>
      <button type="button" className="pos-icon-button" aria-label="Close dialog" onClick={close}><X size={19} /></button>
    </div>
    {children}
  </dialog>, document.body);
}

export function DialogForm<Result>({ children, onSave, onSaved, submit = 'Save', destructive = false }: {
  children: ReactNode; onSave: (form: FormData) => Promise<Result>; onSaved: (result: Result) => void; submit?: string; destructive?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      onSaved(await onSave(new FormData(event.currentTarget)));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return <form className="pos-dialog-form" onSubmit={save}>
    <fieldset disabled={busy}>{children}</fieldset>
    <LoadError message={error} />
    <div className="pos-dialog-actions"><button className={destructive ? 'pos-danger' : 'pos-primary'} disabled={busy}>{busy ? 'Saving…' : submit}</button></div>
  </form>;
}

export function DateRange({ start, end, today, onChange }: {
  start: string; end: string; today: string; onChange: (start: string, end: string) => void;
}) {
  return <div className="pos-date-range">
    <label className="pos-field">From<input type="date" max={end} value={start}
      onChange={event => { if (event.target.value) onChange(event.target.value, end); }} /></label>
    <label className="pos-field">To<input type="date" min={start} max={today} value={end}
      onChange={event => { if (event.target.value) onChange(start, event.target.value); }} /></label>
  </div>;
}
