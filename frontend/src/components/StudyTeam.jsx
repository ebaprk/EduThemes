import { ContextHelp } from '@eduthemes/ui/workbench';
import React, { useState } from 'react';
import { supabase } from '../supabase';
import { Skeleton } from './LoadingSkeleton';
import { Card } from "@eduthemes/ui/components/card";
import { Badge } from "@eduthemes/ui/components/badge";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Button } from "@eduthemes/ui/components/button";
import { Label } from "@eduthemes/ui/components/label";
import { Input } from "@eduthemes/ui/components/input";
export default function StudyTeam({
  study,
  members,
  role,
  onChanged,
  onError,
  onNotice
}) {
  const [email, setEmail] = useState('');
  const [memberRole, setMemberRole] = useState('researcher');
  const [busy, setBusy] = useState(false);
  const owner = role === 'owner';
  const mutate = async (name, args) => {
    setBusy(true);
    try {
      const {
        error
      } = await supabase.rpc(name, args);
      if (error) throw error;
      await onChanged();
      return true;
    } catch (error) {
      onError(error.message || 'The team could not be updated.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const invite = async event => {
    event.preventDefault();
    if (await mutate('invite_study_member', {
      p_study_id: study.id,
      p_email: email.trim(),
      p_role: memberRole
    })) {
      setEmail('');
      onNotice('Invitation created. Copy the invitation link and share it with your collaborator.');
    }
  };
  const copy = async member => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?invitation=${member.id}`);
      onNotice('Invitation link copied. Your collaborator must sign in with the invited email address.');
    } catch {
      onError('Could not copy the link. Your collaborator can sign in on this site to see their invitation.');
    }
  };
  return <Card className="study-panel study-team" as="section">
    <h2>Study team</h2><p className="study-help">Your access: <strong>{role}</strong></p>
    <ul className="study-team-list"><li><div><strong>Study owner</strong><small>{study.source_type === 'file' ? 'Full access and team management' : 'Full access and publication'}</small></div><Badge className="study-status" variant="secondary">Owner</Badge></li>
      {members.map(member => <li key={member.id}><div><strong>{member.email}</strong><small>{member.accepted_at ? 'Joined' : 'Invitation pending'}</small></div>
        <div className="study-actions">{owner ? <><NativeSelect aria-label={`Role for ${member.email}`} value={member.role} disabled={busy} onChange={e => mutate('invite_study_member', {
              p_study_id: study.id,
              p_email: member.email,
              p_role: e.target.value
            })}><NativeSelectOption value="researcher">Researcher</NativeSelectOption><NativeSelectOption value="reviewer">Reviewer</NativeSelectOption></NativeSelect>
          {!member.accepted_at && <Button type="button" className="study-text-button" onClick={() => copy(member)} variant="link" size="auto">Copy invitation</Button>}
          <Button type="button" className="study-text-button" disabled={busy} onClick={() => mutate('remove_study_member', {
              p_member_id: member.id
            })} variant="link" size="auto">Remove</Button></> : <Badge className="study-status" variant="secondary">{member.role}</Badge>}</div>
      </li>)}
    </ul>
    {owner && <form className="study-invite-form" onSubmit={invite}><div className="study-field"><Label htmlFor="invite-email">Collaborator email</Label><Input id="invite-email" type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} required placeholder="colleague@ufl.edu" /></div>
      <div className="study-field"><Label htmlFor="invite-role">Role</Label><NativeSelect id="invite-role" value={memberRole} onChange={e => setMemberRole(e.target.value)}><NativeSelectOption value="researcher">Researcher</NativeSelectOption><NativeSelectOption value="reviewer">Reviewer</NativeSelectOption></NativeSelect></div>
      <Button type="submit" className="study-secondary" disabled={busy} aria-busy={busy} variant="outline" size="auto">{busy ? <><Skeleton className="edu-skeleton--button" />Updating…</> : 'Create invitation'}</Button><p className="study-help">Share the invitation. The collaborator must verify their email and accept.</p></form>}
    <ContextHelp title="Study roles"><p>The owner manages access and publication. Researchers can edit drafts and coding. Reviewers can view responses and download findings.</p></ContextHelp>
  </Card>;
}
