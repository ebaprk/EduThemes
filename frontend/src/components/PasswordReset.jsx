import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { Label } from "@eduthemes/ui/components/label";
import { Input } from "@eduthemes/ui/components/input";
import { Button } from "@eduthemes/ui/components/button";
export default function PasswordReset() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true),
    [allowed, setAllowed] = useState(false),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    supabase?.auth.getSession().then(({
      data,
      error
    }) => {
      if (active) {
        setAllowed(Boolean(data.session) && !error);
        setChecking(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const save = async event => {
    event.preventDefault();
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const {
        error
      } = await supabase.auth.updateUser({
        password
      });
      if (error) throw error;
      navigate('/', {
        replace: true
      });
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  return <main className="workflow-page import-page"><h1>Reset password</h1>{checking ? <LoadingSkeleton variant="text" label="Checking recovery link…" /> : !allowed ? <><p role="alert">This recovery link has expired. Request another link from the sign-in page.</p><Link to="/">Sign in</Link></> : <form className="study-panel" onSubmit={save}><fieldset disabled={busy} className="study-unframed-fieldset"><div className="study-field"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></div><div className="study-field"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></div></fieldset>{error && <p role="alert" className="study-error">{error}</p>}<Button type="submit" className="study-primary" disabled={busy} aria-busy={busy} variant="default" size="auto">{busy ? <><Skeleton className="edu-skeleton--button" /> Saving…</> : 'Save password'}</Button></form>}</main>;
}
