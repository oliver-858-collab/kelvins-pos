import type { ReactNode } from 'react';
import { ArrowUpRight, Store } from 'lucide-react';
import './auth.css';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="auth-shell">
    <div className="auth-brand"><span><Store size={23} aria-hidden="true" /></span><h1>Kelvin’s POS</h1></div>
    <section className="auth-card">{children}</section>
    <aside className="auth-aside">
      <div><div className="auth-aside-icon"><ArrowUpRight size={33} aria-hidden="true" /></div>
        <p>One workspace for your store.</p>
        <span>Sales, inventory, customer accounts and staff.</span>
      </div>
    </aside>
  </main>;
}
