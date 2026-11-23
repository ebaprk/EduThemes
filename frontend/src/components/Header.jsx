import { FeatureHelp } from '@eduthemes/ui/components/feature-help';
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LuChevronDown, LuLogOut } from 'react-icons/lu';
import { supabase } from '../supabase';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import './Header.css';
import { Button } from '@eduthemes/ui/components/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem } from '@eduthemes/ui/components/dropdown-menu';

const Brand = ({ onClick, busy = false }) => <Link className="site-brand" to="/" aria-label="EduThemes home" aria-busy={busy || undefined} onClick={onClick}>
  <img src="/eduthemes-mark.svg" alt="" width="28" height="28" />
  {busy && <Skeleton className="edu-skeleton--button" />}
  <span className="brand-label">{busy ? 'Opening studies…' : <>EduThemes<span className="brand-period">.</span></>}</span>
</Link>;

export default function Header({ analysisSource, beforeNavigate }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(supabase));
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [navigating, setNavigating] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const inAnalysis = ['/analysis', '/upload', '/code', '/review', '/results'].includes(location.pathname) || location.pathname.includes('/questions/');

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setUser(data.session?.user || null); setChecking(false); }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user || null); setChecking(false); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { setAccountOpen(false); }, [location.pathname, location.search, user?.id]);

  const signOut = async () => {
    if (signingOut || navigating) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      if (inAnalysis && analysisSource) await beforeNavigate?.();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/');
    } catch {
      setSignOutError('Could not sign out. Please try again.');
    } finally { setSigningOut(false); }
  };

  const goHome = async () => {
    if (navigating || signingOut) return;
    setNavigating(true);
    setNavigationError('');
    try {
      if (inAnalysis && analysisSource) await beforeNavigate?.();
      navigate('/');
    } catch {
      setNavigationError('Could not finish saving your analysis. Try again before leaving this page.');
    } finally { setNavigating(false); }
  };
  const followHome = event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    goHome();
  };

  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Researcher';
  const parts = name.trim().split(/\s+/);
  const initials = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();

  return <>
    <header className="workspace-topbar" aria-label={user ? 'Researcher navigation' : 'EduThemes navigation'}>
      <div className="workspace-topbar__inner">
        <Brand onClick={followHome} busy={navigating} />
        <div className="workspace-topbar__actions">
          {checking ? <LoadingSkeleton className="header-auth-check" label="Checking account…" rows={1} /> : user ? <>
            <FeatureHelp className="header-help" label="Help" />
            <DropdownMenu open={accountOpen} onOpenChange={setAccountOpen}>
              <DropdownMenuTrigger asChild><Button type="button" className="workspace-account-trigger" variant="ghost" size="auto" aria-label="Account menu">
                <span className="header-avatar" aria-hidden="true">{initials}</span>
                <span className="workspace-account-name">{name}</span>
                <LuChevronDown className="workspace-account-chevron" aria-hidden="true" />
              </Button></DropdownMenuTrigger>
              <DropdownMenuContent className="workspace-account-menu" align="end" sideOffset={8} collisionPadding={12}>
                <DropdownMenuLabel className="workspace-account-identity"><strong>{name}</strong>{user.email && <span>{user.email}</span>}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={signingOut || navigating} aria-busy={signingOut} onSelect={event => { event.preventDefault(); signOut(); }}>
                  {signingOut ? <Skeleton className="edu-skeleton--button" /> : <LuLogOut aria-hidden="true" />}{signingOut ? 'Signing out…' : 'Sign out'}
                </DropdownMenuItem>
                {signOutError && <p className="workspace-account-error" role="alert">{signOutError}</p>}
              </DropdownMenuContent>
            </DropdownMenu>
          </> : <FeatureHelp className="header-help header-about" label="Help" />}
        </div>
      </div>
    </header>
    {navigationError && <p className="study-error workspace-navigation-error" role="alert">{navigationError}</p>}
  </>;
}
