import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LuArrowLeft, LuArrowUpRight, LuChevronRight, LuCircleHelp, LuFolder, LuImport, LuLogOut, LuMenu, LuPanelLeftClose, LuPanelLeftOpen, LuPlus, LuSearch, LuX } from 'react-icons/lu';
import { supabase } from '../supabase';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { studySearchUrl, workspaceNavigation } from '../utils/workspaceNavigation';
import './Header.css';

const Brand = () => <Link className="site-brand" to="/" aria-label="EduThemes home"><img src="/eduthemes-mark.svg" alt="" width="30" height="30" /><span>EduThemes<span className="brand-period">.</span></span></Link>;

export default function Header({ hasActiveAnalysis = false, analysisSource, beforeNavigate }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(supabase));
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [navigating, setNavigating] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const drawer = useRef(null);
  const menuButton = useRef(null);
  const inAnalysis = ['/analysis', '/upload', '/code', '/review', '/results'].includes(location.pathname) || location.pathname.includes('/questions/');
  const studyAnalysis = inAnalysis && Boolean(analysisSource);
  const context = workspaceNavigation(location.pathname, location.search, analysisSource);
  useEffect(() => { setSearch(location.pathname === '/' ? new URLSearchParams(location.search).get('q') || '' : ''); }, [location.pathname, location.search]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setUser(data.session?.user || null); setChecking(false); } });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (active) { setUser(session?.user || null); setChecking(false); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname, location.search]);
  useEffect(() => { if (!user) setMobileOpen(false); }, [user]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 901px)');
    const onResize = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener('change', onResize);
    return () => desktop.removeEventListener('change', onResize);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const background = [...document.querySelectorAll('.app-content, .workspace-header, .skip-to-content')];
    background.forEach((element) => { element.inert = true; });
    drawer.current?.querySelector('a, button')?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') { setMobileOpen(false); menuButton.current?.focus(); }
      if (event.key !== 'Tab') return;
      const items = [...drawer.current.querySelectorAll('a, button')].filter((item) => item.getClientRects().length);
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; background.forEach((element) => { element.inert = false; }); document.removeEventListener('keydown', onKey); menuButton.current?.focus({ preventScroll: true }); };
  }, [mobileOpen]);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true); setSignOutError('');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/');
    } catch { setSignOutError('Could not sign out. Please try again.'); }
    finally { setSigningOut(false); }
  };
  const go = async (href) => {
    if (navigating) return;
    setNavigating(true); setNavigationError('');
    try { if (inAnalysis && analysisSource) await beforeNavigate?.(); navigate(href); }
    catch { setNavigationError('Could not finish saving your analysis. Try again before leaving this page.'); }
    finally { setNavigating(false); }
  };
  const follow = (event, href) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); go(href);
  };

  if (!user) return <header className="public-header"><Brand /><span className="public-header__label">A workspace for educational research</span>{checking ? <LoadingSkeleton className="header-auth-check" label="Checking account…" rows={1} /> : <a className="header-help" href="https://github.com/ebaprk/EduThemes#research-studies-and-participant-responses" target="_blank" rel="noreferrer">About EduThemes <LuArrowUpRight aria-hidden="true" /></a>}</header>;

  const links = [{href:'/',label:'Studies',icon:LuFolder,active:!inAnalysis || studyAnalysis}];
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Researcher';

  return <>
    {mobileOpen && <div className="sidebar-backdrop" onClick={() => { setMobileOpen(false); menuButton.current?.focus(); }} aria-hidden="true" />}
    <aside id="workspace-navigation" ref={drawer} className={`workspace-sidebar${mobileOpen ? ' is-open' : ''}`} data-collapsed={collapsed} role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen || undefined} aria-label="Workspace navigation">
      <div className="sidebar-brand"><Brand /><button type="button" className="icon-button sidebar-mobile-close" aria-label="Close navigation" onClick={() => { setMobileOpen(false); menuButton.current?.focus(); }}><LuX /></button></div>
      <nav aria-label="Main navigation"><span className="sidebar-label">WORKSPACE</span>{links.map(({ href, label, icon: Icon, active }) => <Link key={href} to={href} className={`sidebar-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} title={collapsed ? label : undefined}><Icon aria-hidden="true" /><span>{label}</span>{active && <span className="sidebar-active-dot" aria-hidden="true" />}</Link>)}
        <span className="sidebar-label sidebar-label--second">ANALYSIS</span><Link to="/analysis" className={`sidebar-link${inAnalysis && !studyAnalysis ? ' is-active' : ''}`} aria-current={inAnalysis && !studyAnalysis ? 'page' : undefined} title={collapsed ? 'Import responses' : undefined}><LuImport aria-hidden="true" /><span>Import responses</span>{hasActiveAnalysis && !studyAnalysis && <span className="analysis-live-dot" aria-label="Analysis in progress" />}</Link>
      </nav>
      <div className="sidebar-bottom"><a className="sidebar-link" href="https://github.com/ebaprk/EduThemes#research-studies-and-participant-responses" target="_blank" rel="noreferrer" title={collapsed ? 'Help and documentation' : undefined}><LuCircleHelp aria-hidden="true" /><span>Help & documentation</span><LuArrowUpRight className="sidebar-external" aria-hidden="true" /></a><div className="sidebar-profile"><span className="profile-avatar" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span><div><strong>{name}</strong><span title={user.email}>{user.email}</span></div><button type="button" className="icon-button sidebar-collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <LuPanelLeftOpen /> : <LuPanelLeftClose />}</button></div><button type="button" className="sidebar-link sidebar-sign-out" onClick={signOut} disabled={signingOut} aria-busy={signingOut} aria-label={signingOut ? 'Signing out…' : 'Sign out'} title={collapsed ? 'Sign out' : undefined}>{signingOut ? <Skeleton className="edu-skeleton--button" /> : <LuLogOut aria-hidden="true" />}<span>{signingOut ? 'Signing out…' : 'Sign out'}</span></button>{signOutError && <p className="sidebar-account-error" role="alert">{signOutError}</p>}</div>
    </aside>
    <header className="workspace-header workspace-toolbar" aria-label="Researcher workspace tools">
      <div className="workspace-toolbar-context">
        <button ref={menuButton} type="button" className="icon-button mobile-menu" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><LuMenu /></button>
        <nav className={`workspace-breadcrumb${context.back?' has-parent':''}`} aria-label="Breadcrumb">
          <ol>
            {context.back&&<><li className="workspace-breadcrumb-parent"><Link className="workspace-parent-link" to={context.back} aria-label={context.backLabel} onClick={event=>follow(event,context.back)}><LuArrowLeft className="workspace-breadcrumb-back" aria-hidden="true"/>{context.back==='/'?'Studies':context.back==='/analysis'?'Import':'Study'}</Link></li><li className="workspace-breadcrumb-separator" aria-hidden="true"><LuChevronRight/></li></>}
            <li className="workspace-breadcrumb-current"><span className="workspace-current-section" aria-current="page" title={context.title}>{context.title}</span></li>
          </ol>
        </nav>
      </div>
      <div className="workspace-toolbar-actions"><form className="workspace-study-search" role="search" aria-label="Find a study" onSubmit={event => { event.preventDefault(); go(studySearchUrl(search)); }}><label className="visually-hidden" htmlFor="workspace-study-search">Find a study</label><input id="workspace-study-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a study…" disabled={navigating}/><button type="submit" aria-label={navigating ? 'Opening workspace…' : 'Search studies'} disabled={navigating} aria-busy={navigating}>{navigating ? <Skeleton className="edu-skeleton--button"/> : <LuSearch aria-hidden="true"/>}</button></form>{location.pathname !== '/studies/new' && <Link className="workspace-create-study" to="/studies/new" aria-label="Create study" onClick={event => follow(event,'/studies/new')}><LuPlus aria-hidden="true"/><span>Create study</span></Link>}</div>
    </header>
    {navigationError && <p className="study-error workspace-navigation-error" role="alert">{navigationError}</p>}
  </>;
}
