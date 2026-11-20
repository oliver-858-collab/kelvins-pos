import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  BarChart3, BriefcaseBusiness, ChevronDown, Clock3, Command, LayoutDashboard, LogOut, Menu, Package, ReceiptText, Settings2,
  Search, ShoppingBag, Store, TriangleAlert, Users, Wallet,
} from 'lucide-react';
import type { Role, User } from '../../types';
import { errorMessage } from '../../lib/business';
import { getCheckoutCatalog, getCheckoutSettings, getPersonalWorkspaceSettings, type Branch, type Shop } from '../../services/checkoutService';
import { Dialog, Empty, LoadError, useData } from './WorkspaceUI';
import CommandMenu, { type WorkspaceCommand } from './CommandMenu';
import StockIndicator from './StockIndicator';
import './workspace.css';

const AdminOverview = lazy(() => import('./AdminOverview'));
const StaffOverview = lazy(() => import('./StaffOverview'));
const SalesHistory = lazy(() => import('./Sales').then(module => ({ default: module.SalesHistory })));
const Reports = lazy(() => import('./Sales').then(module => ({ default: module.Reports })));
const PointOfSale = lazy(() => import('./PointOfSale'));
const Inventory = lazy(() => import('./Inventory'));
const Customers = lazy(() => import('./Customers'));
const Team = lazy(() => import('./Team'));
const MyWork = lazy(() => import('./Team').then(module => ({ default: module.MyWork })));
const Wages = lazy(() => import('./Wages'));
const Settings = lazy(() => import('./Settings'));
const ProductProfile = lazy(() => import('./ProductProfile'));
const Receipt = lazy(() => import('./Receipt'));

const menu = [
  { group: 'Store', items: [
    { key: 'overview', title: 'Overview', icon: LayoutDashboard },
    { key: 'checkout', title: 'Point of sale', icon: ShoppingBag },
    { key: 'sales', title: 'Sales history', icon: ReceiptText },
    { key: 'inventory', title: 'Inventory', icon: Package },
    { key: 'customers', title: 'Customers', icon: Users },
    { key: 'reports', title: 'Reports', icon: BarChart3 },
  ] },
  { group: 'Team', items: [
    { key: 'staff', title: 'Staff and attendance', icon: BriefcaseBusiness },
    { key: 'wages', title: 'Wages and payroll', icon: Wallet },
    { key: 'my-work', title: 'My work', icon: Clock3 },
  ] },
  { group: 'Settings', items: [
    { key: 'settings', title: 'Workspace settings', icon: Settings2 },
  ] },
] as const;

type View = typeof menu[number]['items'][number]['key'];

function requestedView(allowed: View[]) {
  const requested = new URLSearchParams(location.search).get('view');
  return allowed.find(item => item === requested) ?? allowed[0];
}

function savedBranch(userId: string) {
  try { return localStorage.getItem(`kelvins-pos:branch:${userId}`) || ''; }
  catch { return ''; }
}

export default function Workspace({ user, role, logout }: { user: User; role: Role | null; logout: () => Promise<void> }) {
  const isAdmin = role?.name === 'super_admin';
  const isManager = isAdmin || role?.name === 'manager';
  const canSell = isManager || role?.name === 'cashier';
  const canMove = isManager || role?.name === 'storekeeper';
  const personalOnly = role?.name === 'custom';
  const roleName = role?.name === 'custom' && role.display_name === 'Custom Role' ? 'Employee' : role?.display_name ?? 'Employee';
  const allowed: View[] = canSell ? ['overview', 'checkout', 'sales', 'inventory', 'customers']
    : canMove ? ['overview', 'inventory'] : personalOnly ? ['overview'] : ['my-work'];
  if (isManager) allowed.push('reports', 'staff', 'wages');
  if (isAdmin) allowed.push('settings');
  if (!allowed.includes('my-work')) allowed.push('my-work');

  const [requested, setRequested] = useState<View>(() => requestedView(allowed));
  const view = allowed.includes(requested) ? requested : allowed[0];
  const [mobileMenu, setMobileMenu] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [section, setSection] = useState(() => new URLSearchParams(location.search).get('section'));
  const [stockAlerts, setStockAlerts] = useState(() => new URLSearchParams(location.search).get('stock') === 'alerts');
  const [preferred, setPreferred] = useState(() => savedBranch(user.id));
  const [draft, setDraft] = useState(false);
  const [stockRevision, setStockRevision] = useState(0);
  const onStockChange = useCallback(() => setStockRevision(value => value + 1), []);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const setup = useData(personalOnly ? getPersonalWorkspaceSettings : getCheckoutSettings, canSell || canMove || personalOnly);
  const branch = setup.data?.branches.find(item => item.id === preferred) ?? setup.data?.branches[0];
  const items = menu.flatMap(group => [...group.items]);
  const active = items.find(item => item.key === view);
  const viewTitle = isAdmin && view === 'overview' ? 'Super admin dashboard' : active?.title;
  const initials = user.full_name.trim().split(/\s+/).slice(0, 2).map(name => name[0]).join('').toUpperCase();

  useEffect(() => {
    function pop() {
      setRequested(requestedView(allowed));
      const params = new URLSearchParams(location.search);
      setStockAlerts(params.get('stock') === 'alerts');
      setSection(params.get('section'));
      setMobileMenu(false);
    }
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [canSell, canMove, isManager, isAdmin, personalOnly]);

  useEffect(() => {
    function openCommand(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' &&
          !event.repeat && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener('keydown', openCommand);
    return () => window.removeEventListener('keydown', openCommand);
  }, []);

  function navigate(next: View, alerts = false, destinationSection?: string) {
    if (!allowed.includes(next)) return;
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    if (next === 'inventory' && alerts) url.searchParams.set('stock', 'alerts');
    else url.searchParams.delete('stock');
    if (destinationSection) url.searchParams.set('section', destinationSection);
    else url.searchParams.delete('section');
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
    setStockAlerts(next === 'inventory' && alerts);
    setSection(destinationSection ?? null);
    setRequested(next);
    setMobileMenu(false);
    window.scrollTo(0, 0);
  }

  function selectBranch(id: string) {
    if (draft && !window.confirm('Switch branches? Open and held carts for this register will be cleared. An unconfirmed checkout can still be retried from its original branch.')) return;
    setDraft(false);
    setPreferred(id);
    try { localStorage.setItem(`kelvins-pos:branch:${user.id}`, id); } catch { /* Remembering the branch is optional. */ }
  }

  async function signOut() {
    if (logoutBusy) return;
    setLogoutBusy(true); setLogoutError('');
    try { await logout(); }
    catch (cause) { setLogoutError(errorMessage(cause)); }
    finally { setLogoutBusy(false); }
  }

  const commands: WorkspaceCommand[] = menu.flatMap(group => group.items
    .filter(item => allowed.includes(item.key))
    .map(item => ({ ...item, group: group.group, run: () => navigate(item.key) })));
  if (allowed.includes('checkout')) commands.unshift({
    key: 'new-sale', title: 'Open checkout', group: 'Quick action', icon: ShoppingBag, keywords: 'new sale register scan',
    run: () => navigate('checkout'),
  });
  if (allowed.includes('inventory')) commands.unshift({
    key: 'stock-alerts', title: 'Review stock alerts', group: 'Quick action', icon: TriangleAlert,
    keywords: 'low stock out reorder inventory', run: () => navigate('inventory', true),
  });

  return <div className="pos-shell">
    {mobileMenu && <button className="pos-overlay" type="button" aria-label="Close workspace menu" onClick={() => setMobileMenu(false)} />}
    <aside className={mobileMenu ? 'pos-sidebar is-open' : 'pos-sidebar'}>
      <button className="pos-brand" type="button" onClick={() => navigate(allowed[0])}>
        <span><Store size={21} aria-hidden="true" /></span><div><strong>{setup.data?.shop.shop_name || 'Kelvin’s POS'}</strong><small>Retail workspace</small></div>
      </button>
      <nav aria-label="Workspace navigation">
        {menu.map(group => {
          const visible = group.items.filter(item => allowed.includes(item.key));
          return visible.length ? <div className="pos-nav-group" key={group.group}>
            <h2>{group.group}</h2>
            {visible.map(({ key, title, icon: Icon }) =>
              <button type="button" key={key} onClick={() => navigate(key)} aria-current={view === key ? 'page' : undefined}>
                <Icon size={17} aria-hidden="true" /><span>{key === 'overview' && isAdmin ? 'Admin dashboard' : title}</span>
              </button>)}
          </div> : null;
        })}
      </nav>
      <div className="pos-profile">
        <span className="pos-avatar">{initials || 'K'}</span>
        <div><strong>{user.full_name}</strong><small>{role?.display_name || 'Staff'}</small></div>
        <button type="button" className="pos-icon-button" aria-label="Sign out" title="Sign out" disabled={logoutBusy}
          onClick={() => void signOut()}><LogOut size={17} /></button>
      </div>
    </aside>
    <div className="pos-main">
      <header className="pos-topbar">
        <div className="pos-breadcrumb">
          <button type="button" className="pos-icon-button pos-menu-button" aria-label="Open workspace menu"
            aria-expanded={mobileMenu} onClick={() => setMobileMenu(true)}><Menu size={20} /></button>
          <span>Workspace</span><b aria-hidden="true">/</b><strong>{viewTitle}</strong>
        </div>
        <div className="pos-topbar-actions">
          {branch && allowed.includes('inventory') && <StockIndicator key={branch.id} branch={branch.id}
            revision={stockRevision} open={() => navigate('inventory', true)} />}
          <button type="button" className="pos-command-trigger" onClick={() => setCommandOpen(true)} aria-label="Jump to page or action">
            <Search size={17} aria-hidden="true" /><span>Jump to…</span><kbd><Command size={12} aria-hidden="true" /> / Ctrl K</kbd>
          </button>
          {branch && <label className="pos-branch"><Store size={16} aria-hidden="true" />
          <select aria-label="Branch" value={branch.id} onChange={event => selectBranch(event.target.value)}>
            {setup.data?.branches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select><ChevronDown size={14} aria-hidden="true" />
          </label>}
        </div>
      </header>
      {commandOpen && <CommandMenu commands={commands} close={() => setCommandOpen(false)} />}
      <main className="pos-content">
        <LoadError message={logoutError} />
        <LoadError message={setup.error} retry={setup.reload} />
        {setup.loading && !setup.data && <Empty>Loading workspace…</Empty>}
        {!canSell && !canMove && !personalOnly && <Empty>This role has no assigned workspace modules. Contact your administrator.</Empty>}
        {setup.data && !branch && !personalOnly && <Empty>There are no active branches. Enable a branch to use the workspace.</Empty>}
        {setup.data && !branch && personalOnly && <Suspense fallback={<Empty>Loading personal workspace…</Empty>}>
          {view === 'my-work' ? <MyWork key={section ?? 'my-work'} initialSection={section} shop={setup.data.shop}
            userId={user.id} userName={user.full_name} /> : <StaffOverview shop={setup.data.shop} userId={user.id}
            userName={user.full_name} roleName={roleName} canSell={false} canMove={false} isManager={false}
            revision={0} openPage={(target, destination) => navigate(target, false, destination)} />}
        </Suspense>}
        {setup.data && branch && <BranchWorkspace key={branch.id} shop={setup.data.shop} branch={branch}
          branches={setup.data.branches} user={user} roleName={roleName} isManager={isManager} isAdmin={isAdmin} canMove={canMove} canSell={canSell}
          view={view} section={section} stockAlerts={stockAlerts} navigate={navigate} onDraft={setDraft} onStockChange={onStockChange} onSettings={setup.reload} />}
        {setup.data && !branch && isAdmin && <Suspense fallback={<Empty>Loading settings…</Empty>}>
          <Settings shop={setup.data.shop} onChange={setup.reload} /></Suspense>}
      </main>
    </div>
  </div>;
}

function BranchWorkspace({ shop, branch, branches, user, roleName, isManager, isAdmin, canMove, canSell, view, section, stockAlerts, navigate, onDraft, onStockChange, onSettings }: {
  shop: Shop; branch: Branch; branches: Branch[]; user: User; roleName: string; isManager: boolean; isAdmin: boolean; canMove: boolean; canSell: boolean;
  view: View; section: string | null; stockAlerts: boolean; navigate: (view: View, alerts?: boolean, destinationSection?: string) => void; onDraft: (active: boolean) => void; onStockChange: () => void; onSettings: () => void;
}) {
  const [productId, setProductId] = useState<string>();
  const [sale, setSale] = useState<string>();
  const [revision, refreshSales] = useState(0);
  const [startedCheckout, setStartedCheckout] = useState(view === 'checkout');
  const needsCatalog = (canMove && view === 'overview') || view === 'checkout' || view === 'inventory';
  const loadCatalog = useCallback(() => getCheckoutCatalog(branch.id), [branch.id]);
  const inventory = useData(loadCatalog, needsCatalog);
  const { reload } = inventory;
  const reloadCatalog = useCallback(() => { reload(); onStockChange(); }, [reload, onStockChange]);
  const selectedProduct = inventory.data?.find(product => product.id === productId);
  const cashierId = canSell && !isManager ? user.id : undefined;

  useEffect(() => {
    if (view === 'checkout') setStartedCheckout(true);
  }, [view]);

  function saleChanged(id?: string) {
    if (id) setSale(id);
    refreshSales(value => value + 1);
    reloadCatalog();
  }

  return <Suspense fallback={<Empty>Loading {view.replace('-', ' ')}…</Empty>}>
    {view === 'overview' && isAdmin && <AdminOverview shop={shop} branch={branch.id} branchName={branch.name}
      revision={revision} catalog={inventory.data} catalogError={inventory.error} catalogLoading={inventory.loading}
      reloadCatalog={reloadCatalog} onReceipt={setSale} onProduct={setProductId}
      navigate={(target, options) => navigate(target, options?.stockAlerts, options?.staffSection ?? options?.payrollStatus ?? options?.section)} />}
    {view === 'overview' && !isAdmin && <StaffOverview shop={shop} branch={branch} catalog={inventory.data}
      catalogLoading={inventory.loading} catalogError={inventory.error} reloadCatalog={reloadCatalog}
      userId={user.id} userName={user.full_name} roleName={roleName} revision={revision}
      isManager={isManager} canSell={canSell} canMove={canMove} onReceipt={setSale} onProduct={setProductId}
      openPage={(target, destination, alerts) => navigate(target, alerts, destination)} />}
    {(startedCheckout || view === 'checkout') && <div hidden={view !== 'checkout'}>
      <PointOfSale shop={shop} branch={branch.id} catalog={inventory.data} catalogError={inventory.error} loading={inventory.loading}
        isManager={isManager} userId={user.id} onRefresh={reloadCatalog} onSale={saleChanged} onDraft={onDraft}
        onInventory={() => navigate('inventory')} onProduct={setProductId} />
    </div>}
    {view === 'inventory' && <Inventory key={`${stockAlerts}-${section ?? ''}`} initialLedger={section === 'ledger'} stockAlerts={stockAlerts} shop={shop} branch={branch.id} catalog={inventory.data ?? []} loading={inventory.loading}
      error={inventory.error} canManage={isManager} canMove={canMove} canSell={canSell} cashierId={cashierId} onChange={reloadCatalog} />}
    {view === 'sales' && <SalesHistory key={section ?? 'sales'} todayOnly={section === 'today'} shop={shop} branch={branch.id} isManager={isManager} onReceipt={setSale}
      revision={revision} onChange={saleChanged} />}
    {view === 'customers' && <Customers key={section ?? 'customers'} balanceOnly={section === 'balance'} shop={shop} userId={user.id} canManage={isManager} onReceipt={setSale} />}
    {view === 'reports' && <Reports shop={shop} branch={branch.id} revision={revision} />}
    {view === 'staff' && <Team key={section ?? 'staff'} initialSection={section} shop={shop} branch={branch.id} branches={branches} userId={user.id} canAdmin={isAdmin} />}
    {view === 'wages' && <Wages key={section ?? 'wages'} initialStatus={section} shop={shop} branch={branch.id} canAdmin={isAdmin} />}
    {view === 'my-work' && <MyWork key={section ?? 'my-work'} initialSection={section} shop={shop} branch={branch.id} userId={user.id} userName={user.full_name} />}
    {view === 'settings' && <Settings shop={shop} onChange={onSettings} />}
    {selectedProduct && <Dialog key={selectedProduct.id} title="Product details" className="pos-profile-dialog" wide close={() => setProductId(undefined)}>
      <ProductProfile shop={shop} branch={branch.id} product={selectedProduct}
        canMove={canMove} canSell={canSell} cashierId={cashierId} />
    </Dialog>}
    {sale && <Receipt key={sale} saleId={sale} shop={shop} close={() => setSale(undefined)} />}
  </Suspense>;
}
