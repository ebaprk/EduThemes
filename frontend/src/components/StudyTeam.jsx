import React, { useState } from 'react';
import { supabase } from '../supabase';
import { Skeleton } from './LoadingSkeleton';

export default function StudyTeam({ study, members, role, onChanged, onError, onNotice }) {
  const [email, setEmail] = useState('');
  const [memberRole, setMemberRole] = useState('researcher');
  const [busy, setBusy] = useState(false);
  const owner = role === 'owner';
  const mutate = async (name, args) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc(name, args);
      if (error) throw error;
      await onChanged();
      return true;
    } catch (error) { onError(error.message || 'The team could not be updated.'); return false; }
    finally { setBusy(false); }
  };
  const invite = async (event) => {
    event.preventDefault();
    if (await mutate('invite_study_member', { p_study_id: study.id, p_email: email.trim(), p_role: memberRole })) {
      setEmail(''); onNotice('Invitation created. Copy the invitation link and share it with your collaborator.');
    }
  };
  const copy = async (member) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/?invitation=${member.id}`); onNotice('Invitation link copied. Your collaborator must sign in with the invited email address.'); }
    catch { onError('Could not copy the link. Your collaborator can sign in on this site to see their invitation.'); }
  };
  return <section className="study-panel study-team">
    <h2>Study team</h2><p>Your access: <strong>{role}</strong>. Researchers can edit drafts and coding. Reviewers can view responses and download findings. The owner manages access and publication.</p>
    <ul className="study-team-list"><li><div><strong>Study owner</strong><small>Full access and publication</small></div><span className="study-status">Owner</span></li>
      {members.map((member) => <li key={member.id}><div><strong>{member.email}</strong><small>{member.accepted_at ? 'Joined' : 'Invitation pending'}</small></div>
        <div className="study-actions">{owner ? <><select aria-label={`Role for ${member.email}`} value={member.role} disabled={busy} onChange={(e) => mutate('invite_study_member', { p_study_id: study.id, p_email: member.email, p_role: e.target.value })}><option value="researcher">Researcher</option><option value="reviewer">Reviewer</option></select>
          {!member.accepted_at && <button type="button" className="study-text-button" onClick={() => copy(member)}>Copy invitation</button>}
          <button type="button" className="study-text-button" disabled={busy} onClick={() => mutate('remove_study_member', { p_member_id: member.id })}>Remove</button></> : <span className="study-status">{member.role}</span>}</div>
      </li>)}
    </ul>
    {owner && <form className="study-invite-form" onSubmit={invite}><div className="study-field"><label htmlFor="invite-email">Collaborator email</label><input id="invite-email" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="colleague@ufl.edu" /></div>
      <div className="study-field"><label htmlFor="invite-role">Role</label><select id="invite-role" value={memberRole} onChange={(e) => setMemberRole(e.target.value)}><option value="researcher">Researcher</option><option value="reviewer">Reviewer</option></select></div>
      <button type="submit" className="study-secondary" disabled={busy} aria-busy={busy}>{busy ? <><Skeleton className="edu-skeleton--button" />Updating…</> : 'Create invitation'}</button><p className="study-help">Share the invitation yourself. Access starts after the invited person signs in with their verified email and accepts.</p></form>}
  </section>;
}
