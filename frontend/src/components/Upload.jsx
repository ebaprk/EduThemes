import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_URL, getApiErrorMessage } from '../api';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { fileStudyTitle, saveFileStudy } from '../utils/fileStudies';
import WorkflowAlert from './WorkflowAlert';
import WorkflowHeader from './WorkflowHeader';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { Label } from "@eduthemes/ui/components/label";
import { Input } from "@eduthemes/ui/components/input";
import { Textarea } from "@eduthemes/ui/components/textarea";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Button } from "@eduthemes/ui/components/button";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const Upload = ({
  projectMetadata = {}
}) => {
  const navigate = useNavigate();
  const pendingImport = useRef(null);
  const importing = useRef(false);
  const [file, setFile] = useState(null),
    [error, setError] = useState(null),
    [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [researchQuestion, setResearchQuestion] = useState(projectMetadata.researchQuestion || '');
  const [projectDescription, setProjectDescription] = useState(projectMetadata.projectDescription || '');
  const [additionalContext, setAdditionalContext] = useState(projectMetadata.additionalContext || '');
  const [apiKey, setApiKey] = useState(projectMetadata.apiKey || '');
  const [availableModels, setAvailableModels] = useState(null),
    [modelsLoading, setModelsLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/models`, {
      signal: controller.signal
    }).then(response => response.ok ? response.json() : null).then(data => {
      if (!data?.models) return;
      setAvailableModels(data.models);
      const configured = Object.entries(data.models).filter(([, enabled]) => enabled);
      if (configured.length === 1) setApiKey(configured[0][0]);
    }).catch(() => {}).finally(() => {
      if (!controller.signal.aborted) setModelsLoading(false);
    });
    return () => controller.abort();
  }, []);
  const handleFileChange = event => {
    const selectedFile = event.target.files?.[0];
    const extension = selectedFile?.name.split('.').pop()?.toLowerCase();
    const allowedTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
    if (!selectedFile) return;
    if (selectedFile.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('Choose a file smaller than 20 MB.');
    } else if (allowedTypes.includes(selectedFile.type) || ['xlsx', 'xls', 'csv'].includes(extension)) {
      setFile(selectedFile);
      setError(null);
    } else {
      setFile(null);
      setError('Choose a valid Excel or CSV file (.xlsx, .xls, or .csv).');
    }
  };
  const uploadDataset = async () => {
    if (importing.current) return;
    if (!researchQuestion.trim() || !projectDescription.trim() || !apiKey || !file) {
      setError('Add a research question, project description, model, and response file.');
      return;
    }
    const metadata = { projectDescription, researchQuestion, additionalContext, apiKey };
    const studyTitle = title.trim() || fileStudyTitle(file.name);
    const signature = JSON.stringify([studyTitle, metadata]);
    if (pendingImport.current?.file !== file || pendingImport.current.signature !== signature) {
      const previousSession = pendingImport.current?.sessionId;
      if (previousSession) axios.delete(`${API_URL}/session/${previousSession}`).catch(() => {});
      pendingImport.current = { file, signature, id: crypto.randomUUID() };
    }
    const attempt = pendingImport.current;
    importing.current = true;
    setError(null);
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || (attempt.actorId && attempt.actorId !== session.user.id)) {
        throw new Error('Sign in to the account that started this import.');
      }
      attempt.actorId = session.user.id;
      if (!attempt.sessionId) {
        const created = await axios.post(`${API_URL}/session/start`);
        attempt.sessionId = created.data?.session_id;
        if (!attempt.sessionId) throw new Error('Could not open the analysis service. Please try again.');
      }
      if (!attempt.parsed) {
        const formData = new FormData();
        formData.append('dataset', file);
        for (const [key, value] of Object.entries(metadata)) formData.append(key, value);
        const response = await axios.post(`${API_URL}/session/${attempt.sessionId}/upload-dataset`, formData);
        attempt.parsed = response.data;
      }
      const { preprocessed_dataset, predefined_themes, dataset_summary } = attempt.parsed;
      const { data: auth } = await supabase.auth.getSession();
      if (auth.session?.user.id !== attempt.actorId) throw new Error('Your account changed while importing. Sign in again to save this study.');
      const id = await saveFileStudy({
        importId: attempt.id, title: studyTitle, metadata, dataset: preprocessed_dataset,
        labels: predefined_themes || [], stage: 'code', uploadSummary: dataset_summary
      });
      axios.delete(`${API_URL}/session/${attempt.sessionId}`).catch(() => {});
      const { data: saved } = await supabase.from('study_analyses')
        .select('question_id,study_version_id,stage').eq('study_id', id).maybeSingle();
      pendingImport.current = null;
      navigate(saved ? `/studies/${id}/questions/${saved.question_id}/${saved.stage}?version=${saved.study_version_id}`
        : `/studies/${id}?section=analysis`, { replace: true });
    } catch (err) {
      if (err.response?.status === 410) attempt.sessionId = null;
      setError(err.message && !err.isAxiosError ? err.message : getApiErrorMessage(err, 'We couldn\'t import and save your dataset.'));
    } finally {
      importing.current = false;
      setIsLoading(false);
    }
  };
  return <main className="workflow-page import-page">
      <WorkflowHeader currentStep={1} title="Import responses" description="Choose a file and add the research context." />
      <form className="study-panel import-form" onSubmit={e => {
      e.preventDefault();
      uploadDataset();
    }}>
        <fieldset disabled={isLoading} className="study-unframed-fieldset">
          <section><h2>Response file</h2><div className="study-field"><Label htmlFor="import-file">CSV or Excel file · up to 20 MB</Label><Input id="import-file" type="file" required accept=".csv,.xlsx,.xls" onChange={handleFileChange} aria-describedby="import-file-help" /><p className="study-help" id="import-file-help">Use one response per row. <a href="/assets/sample-responses.csv" download>Download a sample CSV</a></p></div></section>
          <section><h2>What are you studying?</h2><div className="study-field"><Label htmlFor="import-title">Study name</Label><Input id="import-title" maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder={file ? fileStudyTitle(file.name) : 'Defaults to the file name'} /></div>
          <div className="study-field"><Label htmlFor="import-question">Research question</Label><Input id="import-question" maxLength={500} required value={researchQuestion} onChange={e => setResearchQuestion(e.target.value)} placeholder="What are you trying to understand?" /></div>
          <div className="study-field"><Label htmlFor="import-description">Project description</Label><Textarea id="import-description" required rows={3} value={projectDescription} onChange={e => setProjectDescription(e.target.value)} placeholder="Describe the responses and their context." /></div>
          <details className="import-optional-context"><summary>Add additional context (optional)</summary><div className="study-field"><Label htmlFor="import-context">Additional context</Label><Textarea id="import-context" rows={3} value={additionalContext} onChange={e => setAdditionalContext(e.target.value)} /></div></details>
          {modelsLoading ? <LoadingSkeleton variant="inline" label="Checking analysis service…" /> : <div className="study-field"><Label htmlFor="import-model">Analysis model</Label><NativeSelect id="import-model" required value={apiKey} onChange={e => setApiKey(e.target.value)}><NativeSelectOption value="">Select model</NativeSelectOption><NativeSelectOption value="navigator" disabled={availableModels?.navigator === false}>NaviGator AI</NativeSelectOption></NativeSelect></div>}</section>
        </fieldset>
        <WorkflowAlert message={error} onClose={() => setError(null)} />
        {isLoading && <LoadingSkeleton variant="inline" label="Importing responses…" />}
        <footer className="workflow-action-bar"><p className="study-help">Your import saves as a private study you can reopen anytime.</p><Button className="study-primary" type="submit" disabled={isLoading || modelsLoading} aria-busy={isLoading} variant="default" size="auto">{isLoading ? <><Skeleton className="edu-skeleton--button" /> Importing…</> : 'Import & continue'}</Button></footer>
      </form></main>;
};
export default Upload;
