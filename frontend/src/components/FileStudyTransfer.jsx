import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@eduthemes/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@eduthemes/ui/components/dialog';
import { Input } from '@eduthemes/ui/components/input';
import { Label } from '@eduthemes/ui/components/label';
import { supabase } from '../supabase';
import { fileStudyTitle, saveFileStudy } from '../utils/fileStudies';
import { Skeleton } from './LoadingSkeleton';

export default function FileStudyTransfer({ importId, metadata, dataset, labels, results, classifications, loading, stage = 'results', uploadSummary }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(() => fileStudyTitle(uploadSummary?.filename));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const completed = stage === 'results';

  const save = async event => {
    event.preventDefault();
    if (pending.current || !title.trim()) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const id = await saveFileStudy({
        importId, title, metadata, dataset, labels, results, classifications, stage, uploadSummary
      });
      navigate(`/studies/${id}?section=${completed ? 'team-coding' : 'analysis'}`);
    } catch (failure) {
      setError(failure.code === 'PGRST202'
        ? 'Saving imports is currently unavailable. Your analysis is still open.'
        : failure.message || 'Could not save the imported study. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  if (!supabase || !importId || !dataset.length) return null;
  return <Dialog open={open} onOpenChange={next => { if (!pending.current) setOpen(next); }}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" disabled={loading} aria-busy={loading}>
        {loading && <Skeleton className="edu-skeleton--button" />}{completed ? 'Compare independent coding' : 'Save to Studies'}
      </Button>
    </DialogTrigger>
    <DialogContent className="file-study-transfer-dialog" aria-describedby="file-study-description">
      <DialogHeader>
        <DialogTitle>{completed ? 'Save a study for team coding' : 'Save imported study'}</DialogTitle>
        <DialogDescription id="file-study-description">{completed
          ? 'Save the responses, codebook, and findings to a private study. Invite a second researcher there to compare coding.'
          : 'Save your responses and coding progress to a private study you can reopen from Studies.'}</DialogDescription>
      </DialogHeader>
      <form className="study-form" onSubmit={save}>
        <div className="study-field">
          <Label htmlFor="file-study-title">Study name</Label>
          <Input id="file-study-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required disabled={busy} />
        </div>
        {error && <p className="study-error" role="alert">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy || !title.trim()} aria-busy={busy}>
            {busy && <Skeleton className="edu-skeleton--button" />}{completed ? 'Save and open team coding' : 'Save study'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
