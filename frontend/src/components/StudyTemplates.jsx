import React, { useState } from 'react';
import { studyTemplates, templateForm, templateFile } from '../utils/studyTemplates';
import { downloadText } from '../utils/researchQuality';
import { Skeleton } from './LoadingSkeleton';
import { Label } from "@eduthemes/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Button } from "@eduthemes/ui/components/button";
import { Input } from "@eduthemes/ui/components/input";
export default function StudyTemplates({
  form,
  onApply,
  disabled,
  isNew
}) {
  const [selected, setSelected] = useState('reflection'),
    [error, setError] = useState(''),
    [reading, setReading] = useState(false);
  const apply = () => {
    try {
      onApply(templateForm(studyTemplates.find(t => t.id === selected).form));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  const upload = async event => {
    const file = event.target.files[0];
    if (!file) return;
    setReading(true);
    setError('');
    try {
      if (file.size > 150000) throw new Error('Choose a template smaller than 150 KB.');
      const data = JSON.parse(await file.text());
      if (data.format !== 'eduthemes-study-template' || data.version !== 1) throw new Error('Choose an EduThemes study template JSON file.');
      onApply(templateForm(data.study));
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(false);
      event.target.value = '';
    }
  };
  return <details className="quality-panel study-template-picker"><summary>{isNew ? 'Start from a study template' : 'Reuse this study design'}</summary><p>Templates copy design and questions. Add consent and review the details for each new study. Applying a template replaces the fields in this editor.</p>
    <fieldset disabled={disabled || reading} className="study-unframed-fieldset"><div className="study-field"><Label htmlFor="study-template-choice">Starter template</Label><NativeSelect id="study-template-choice" value={selected} onChange={e => setSelected(e.target.value)}>{studyTemplates.map(t => <NativeSelectOption key={t.id} value={t.id}>{t.name}</NativeSelectOption>)}</NativeSelect><p className="study-help">{studyTemplates.find(t => t.id === selected)?.description}</p></div><div className="study-actions"><Button type="button" className="study-secondary" onClick={apply} variant="outline" size="auto">Apply template</Button><Button type="button" className="study-secondary" onClick={() => {
          try {
            downloadText(templateFile(form), 'study-template.json', 'application/json');
            setError('');
          } catch (e) {
            setError(e.message);
          }
        }} variant="outline" size="auto">Download reusable template</Button><Label className="study-secondary quality-file-label">{reading && <Skeleton className="edu-skeleton--button" />}{reading ? 'Reading template…' : 'Import template'}<Input aria-label="Import study template" type="file" accept=".json" onChange={upload} aria-busy={reading} /></Label></div></fieldset>{error && <p role="alert" className="study-error">{error}</p>}</details>;
}
