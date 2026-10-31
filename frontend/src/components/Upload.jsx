import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL, getApiErrorMessage } from '../api';
import WorkflowAlert from './WorkflowAlert';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const Upload = ({sessionId,onAdvanceStage,setDataset,setLabels,setVisualization,setClaudeData,setSvmData,setResults,setProjectMetadata,setUploadSummary,projectMetadata={}}) => {
 const [file,setFile]=useState(null),[error,setError]=useState(null),[isLoading,setIsLoading]=useState(false);
 const [researchQuestion,setResearchQuestion]=useState(projectMetadata.researchQuestion || '');
 const [projectDescription,setProjectDescription]=useState(projectMetadata.projectDescription || '');
 const [additionalContext,setAdditionalContext]=useState(projectMetadata.additionalContext || '');
 const [apiKey,setApiKey]=useState(projectMetadata.apiKey || '');
 const [availableModels,setAvailableModels]=useState(null),[modelsLoading,setModelsLoading]=useState(true);
    useEffect(() => {
        const controller = new AbortController();
        fetch(`${API_URL}/models`, { signal: controller.signal })
            .then((response) => response.ok ? response.json() : null)
            .then((data) => {
                if (!data?.models) return;
                setAvailableModels(data.models);
                const configured = Object.entries(data.models).filter(([, enabled]) => enabled);
                if (configured.length === 1) setApiKey(configured[0][0]);
            })
            .catch(() => {})
            .finally(() => { if (!controller.signal.aborted) setModelsLoading(false); });
        return () => controller.abort();
    }, []);

    const handleFileChange = (event) => {
        const selectedFile = event.target.files?.[0];
        const extension = selectedFile?.name.split('.').pop()?.toLowerCase();
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
        ];

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
        if (isLoading || !sessionId) return;
        if (!researchQuestion.trim() || !projectDescription.trim() || !apiKey || !file) { setError('Add a research question, project description, model, and response file.'); return; }

        const formData = new FormData();
        formData.append('dataset', file);
        formData.append('projectDescription', projectDescription);
        formData.append('researchQuestion', researchQuestion);
        formData.append('additionalContext', additionalContext);
        formData.append('apiKey', apiKey);

        setError(null);
        setIsLoading(true);
        try {
            const response = await axios.post(`${API_URL}/session/${sessionId}/upload-dataset`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setProjectMetadata({ researchQuestion, projectDescription, additionalContext, apiKey });
            setDataset(response.data.preprocessed_dataset);
            setLabels(response.data.predefined_themes || []);
            setVisualization(response.data.visualization_image);
            setClaudeData(null);
            setSvmData(null);
            setResults(null);
            setUploadSummary(response.data.dataset_summary || null);
            onAdvanceStage();
        } catch (err) {
            console.error('Failed to upload dataset:', err);
            setError(getApiErrorMessage(err, 'We couldn\'t upload your dataset.'));
        } finally {
            setIsLoading(false);
        }
    };

    return <main className="workflow-page import-page"><h1>Import responses</h1>
      <form className="study-panel study-form" onSubmit={e => { e.preventDefault(); uploadDataset(); }}>
        <fieldset disabled={isLoading} className="study-unframed-fieldset">
        <div className="study-field"><label htmlFor="import-question">Research question</label><input id="import-question" required value={researchQuestion} onChange={e => setResearchQuestion(e.target.value)} /></div>
        <div className="study-field"><label htmlFor="import-description">Project description</label><textarea id="import-description" required value={projectDescription} onChange={e => setProjectDescription(e.target.value)} /></div>
        <div className="study-field"><label htmlFor="import-context">Additional context (optional)</label><textarea id="import-context" value={additionalContext} onChange={e => setAdditionalContext(e.target.value)} /></div>
        {modelsLoading ? <LoadingSkeleton variant="inline" label="Checking analysis service…" /> : <div className="study-field"><label htmlFor="import-model">Analysis model</label><select id="import-model" required value={apiKey} onChange={e => setApiKey(e.target.value)}><option value="">Select model</option><option value="navigator" disabled={availableModels?.navigator === false}>NaviGator AI</option></select></div>}
        <div className="study-field"><label htmlFor="import-file">Response file · CSV or Excel · up to 20 MB</label><input id="import-file" type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} /></div>
        </fieldset><WorkflowAlert message={error} onClose={() => setError(null)} />
        {isLoading && <LoadingSkeleton variant="inline" label="Importing responses…" />}
        <button className="study-primary" type="submit" disabled={isLoading || modelsLoading} aria-busy={isLoading}>{isLoading ? <><Skeleton className="edu-skeleton--button" /> Importing…</> : 'Import responses'}</button>
        <a className="study-text-button" href="/assets/sample-responses.csv" download>Sample CSV</a>
      </form></main>;
};
export default Upload;
