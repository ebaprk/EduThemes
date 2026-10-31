import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import axios from 'axios';
import "./App.css";
import Header from "./components/Header";
import Upload from "./components/Upload";
import Start from "./components/Start";
import Preview from "./components/Preview";
import NotFound from "./components/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import Researcher from "./components/Researcher";
import LoadingSkeleton from './components/LoadingSkeleton';
import { API_URL } from "./api";
import { supabase } from './supabase';
import { attachResponseSources, responseRecordsForQuestion, responsesForQuestion, responsesToCsv } from './utils/studyResponses';
import "./components/Workflow.css";
import "./styles/ContextTheme.css";

const Review = lazy(() => import('./components/Review'));
const Analyze = lazy(() => import('./components/Analyze'));

const unclassifiedTheme = {
        name: "Unclassified",
        description: "Responses that don't fit any other theme",
        color: "#cccccc"
    };

const stagePaths = {
  start: "/analysis",
  upload: "/upload",
  preview: "/code",
  review: "/review",
  results: "/results",
};

const pathStages = Object.fromEntries(
  Object.entries(stagePaths).map(([stage, path]) => [path, stage])
);

const loadSessionValue = (key, fallback) => {
  try {
    const storedValue = window.sessionStorage.getItem(key);
    return storedValue === null ? fallback : JSON.parse(storedValue);
  } catch {
    return fallback;
  }
};

const useSessionValue = (key, fallback) => {
  const [value, setValue] = useState(() => loadSessionValue(key, fallback));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Unable to preserve ${key} in this browser session.`, error);
      window.dispatchEvent(new CustomEvent('eduthemes:storage-error'));
    }
  }, [key, value]);

  return [value, setValue];
};

function ResearcherGate({ children }) {
  const [allowed, setAllowed] = useState(null);
  useEffect(() => {
    if (!supabase) { setAllowed(false); return undefined; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setAllowed(Boolean(data.session)); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAllowed(Boolean(session));
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  if (allowed === null) return <main className="workflow-page"><LoadingSkeleton variant="analysis" label="Checking researcher access…" /></main>;
  return allowed ? children : <Navigate to="/" replace />;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
  const currentStage = pathStages[normalizedPath] || "start";

  const [sessionId, setSessionId] = useSessionValue("eduthemes.sessionId", null);
  const [dataset, setDataset] = useSessionValue("eduthemes.dataset", null);
  const [visualization, setVisualization] = useSessionValue("eduthemes.visualization", null);
  const [labels, setLabels] = useSessionValue("eduthemes.labels", []);
  const [claudeData, setClaudeData] = useSessionValue("eduthemes.claudeData", null);
  const [svmData, setSvmData] = useSessionValue("eduthemes.svmData", null);
  const [results, setResults] = useSessionValue("eduthemes.results", null);
  const [uploadSummary, setUploadSummary] = useSessionValue("eduthemes.uploadSummary", null);
  const [analysisSource, setAnalysisSource] = useSessionValue('eduthemes.analysisSource', null);
  const [analysisSaveState, setAnalysisSaveState] = useState('');
  const saveQueue = useRef(Promise.resolve());
  const saveVersion = useRef(0);
  const analysisRuns = useRef(new Map());
  const [sessionNotice, setSessionNotice] = useState(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [projectMetadata, setProjectMetadata] = useSessionValue("eduthemes.projectMetadata", {
    researchQuestion: "",
    projectDescription: "",
    additionalContext: "",
    apiKey: ""
  });
  const resumeStage = results && dataset
    ? "results"
    : claudeData && dataset
      ? "review"
      : dataset
        ? "preview"
        : "upload";

  const handleSessionStart = (newSessionId) => {
    if (sessionId && sessionId !== newSessionId) {
      axios.delete(`${API_URL}/session/${sessionId}`).catch(() => {});
    }
    setSessionId(newSessionId);
    setDataset(null);
    setVisualization(null);
    setLabels([]);
    setClaudeData(null);
    setSvmData(null);
    setResults(null);
    setUploadSummary(null);
    setAnalysisSource(null);
    setProjectMetadata({
      researchQuestion: "",
      projectDescription: "",
      additionalContext: "",
      apiKey: ""
    });
  };

  const clearAnalysis = () => {
    setSessionId(null);
    setDataset(null);
    setVisualization(null);
    setLabels([]);
    setClaudeData(null);
    setSvmData(null);
    setResults(null);
    setUploadSummary(null);
    setAnalysisSource(null);
    setProjectMetadata({ researchQuestion: '', projectDescription: '', additionalContext: '', apiKey: '' });
  };

  const handleAdvanceStage = (stage) => {
    navigate(stagePaths[stage] || stagePaths.start);
  };

  const handleSetProjectMetadata = (metadata) => {
    setProjectMetadata(metadata);
  };

  const handleStudyAnalysis = async (study, question, submissions, savedAnalysis = null, savedRevision = 0) => {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) throw new Error('Sign in before coding study responses.');
    const responses = responsesForQuestion(question.id, submissions, savedAnalysis);
    if (!responses.length) throw new Error('There are no responses to code for this question yet.');
    const modelStatus = await axios.get(`${API_URL}/models`);
    if (!modelStatus.data?.models?.navigator) throw new Error('Set NAVIGATOR_API_KEY on the analysis backend before coding study responses.');
    const csv = responsesToCsv(responses);
    if (new Blob([csv]).size > 20 * 1024 * 1024) throw new Error('This question has more than 20 MB of responses. Download and split the data before analysis.');
    const newSession = await axios.post(`${API_URL}/session/start`, { study_id: study.id });
    const newSessionId = newSession.data.session_id;
    if (!newSessionId) throw new Error('The analysis service did not create a session.');
    const metadata = {
      researchQuestion: study.research_question,
      projectDescription: study.description || study.title,
      additionalContext: [study.additional_context, `Study question being coded: ${question.prompt}`].filter(Boolean).join('\n\n'),
      apiKey: 'navigator',
    };
    const form = new FormData();
    form.append('dataset', new File([csv], 'study-responses.csv', { type: 'text/csv' }));
    form.append('researchQuestion', metadata.researchQuestion);
    form.append('projectDescription', metadata.projectDescription);
    form.append('additionalContext', metadata.additionalContext);
    form.append('apiKey', metadata.apiKey);
    try {
      const uploaded = await axios.post(`${API_URL}/session/${newSessionId}/upload-dataset`, form);
      const imported = savedAnalysis?.coded_responses || attachResponseSources(uploaded.data.preprocessed_dataset, responseRecordsForQuestion(question.id, submissions));
      handleSessionStart(newSessionId);
      setDataset(imported);
      setLabels(savedAnalysis?.labels || uploaded.data.predefined_themes || []);
      setVisualization(uploaded.data.visualization_image);
      setClaudeData(savedAnalysis?.classifications || null);
      setProjectMetadata(metadata);
      setUploadSummary(uploaded.data.dataset_summary || null);
      setAnalysisSource({ studyId: study.id, versionId: study.current_version_id, questionId: question.id,
        ownerId: study.owner_id, actorId: auth.session.user.id, runId: newSessionId,
        revision: savedAnalysis?.revision || savedRevision, title: study.title, prompt: question.prompt });
      navigate(savedAnalysis?.stage === 'review' && savedAnalysis.classifications ? '/review' : '/code');
    } catch (error) {
      await axios.delete(`${API_URL}/session/${newSessionId}`).catch(() => {});
      throw new Error(error?.response?.data?.error || error.message || 'Could not prepare these responses for coding.');
    }
  };

  useEffect(() => {
    if (!supabase || !analysisSource?.versionId || !dataset || !['preview', 'review', 'results'].includes(currentStage)) return undefined;
    const source = analysisSource;
    if (!analysisRuns.current.has(source.runId)) analysisRuns.current.set(source.runId, { revision: source.revision || 0, blocked: false });
    const run = analysisRuns.current.get(source.runId);
    if (run.blocked) return undefined;
    const version = ++saveVersion.current;
    setAnalysisSaveState('Saving study analysis…');
    const snapshot = {
      study_id: analysisSource.studyId,
      study_version_id: analysisSource.versionId,
      question_id: analysisSource.questionId,
      owner_id: analysisSource.ownerId,
      labels,
      coded_responses: dataset,
      classifications: claudeData,
      results: currentStage === 'results' ? results : null,
      stage: currentStage === 'preview' ? 'code' : currentStage,
      response_count: dataset.length,
      updated_at: new Date().toISOString(),
    };
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      if (run.blocked) return;
      try {
        const { data: auth } = await supabase.auth.getSession();
        if (auth.session?.user.id !== source.actorId) return;
        const { data: revision, error } = await supabase.rpc('save_study_analysis', { p_snapshot: snapshot, p_expected_revision: run.revision });
        if (error) throw error;
        run.revision = revision;
        setAnalysisSource((current) => current?.runId === source.runId ? { ...current, revision } : current);
        if (version === saveVersion.current) setAnalysisSaveState('Study progress saved');
      } catch (error) {
        run.blocked = true;
        setAnalysisSaveState(`Could not save study progress: ${error.message} Your changes remain in this tab. Download a copy before reopening the study.`);
      }
    });
    return undefined;
  }, [analysisSource?.runId, currentStage, dataset, labels, claudeData, results]);

  useEffect(() => {
    if (!supabase) return undefined;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || (analysisSource && analysisSource.actorId !== session.user.id)) {
        saveVersion.current += 1;
        for (const run of analysisRuns.current.values()) run.blocked = true;
        clearAnalysis();
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [analysisSource?.actorId]);

  useLayoutEffect(() => {
    let secondFrame;
    const firstFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      secondFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        const heading = document.querySelector('main h1, .workflow-heading h1');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: true });
        }
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [currentStage, location.pathname]);

  useEffect(() => {
    const handleStorageError = () => setStorageWarning(true);
    const handleSessionExpired = () => {
      clearAnalysis();
      setSessionNotice('Your analysis session expired. Start a new analysis to continue.');
      navigate('/', { replace: true });
    };
    const handleSignOut = () => clearAnalysis();
    window.addEventListener('eduthemes:storage-error', handleStorageError);
    window.addEventListener('eduthemes:session-expired', handleSessionExpired);
    const authListener = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') handleSignOut();
    });
    return () => {
      window.removeEventListener('eduthemes:storage-error', handleStorageError);
      window.removeEventListener('eduthemes:session-expired', handleSessionExpired);
      authListener?.data.subscription.unsubscribe();
    };
  // The event intentionally uses the latest state setters and router instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    if (!sessionId) return undefined;
    const controller = new AbortController();

    axios.get(`${API_URL}/session/${sessionId}`, { signal: controller.signal })
      .catch((error) => {
        if ([401, 403, 410].includes(error.response?.status)) {
          clearAnalysis();
          setSessionNotice(error.response.status === 410
            ? 'Your previous analysis session expired. Reopen the study to restore saved coding.'
            : 'Your access to this analysis has changed. Open the study again to check your access.');
          navigate('/', { replace: true });
        }
      });

    return () => controller.abort();
  // Validate only the restored session ID; state setters are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const downloadCurrentCoding = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ source: analysisSource, labels,
      coded_responses: dataset, classifications: claudeData, results, stage: currentStage }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'eduthemes-current-coding.json'; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="App">
      <a className="skip-to-content" href="#main-content">Skip to content</a>
      <Header hasActiveAnalysis={Boolean(sessionId && currentStage !== 'start')} />
      <div className="app-content" id="main-content" tabIndex="-1">
        {analysisSource && ['preview', 'review', 'results'].includes(currentStage) && (
          <div className="study-analysis-banner"><span><strong>{analysisSource.title}</strong> · {analysisSource.prompt}</span>{analysisSaveState.startsWith('Saving') ? <LoadingSkeleton variant="inline" label={analysisSaveState} /> : <span role="status">{analysisSaveState}</span>}{analysisSaveState.startsWith('Could not') && <button type="button" className="study-text-button" onClick={downloadCurrentCoding}>Download current coding</button>}<Link to={`/studies/${analysisSource.studyId}`} onClick={async (event) => { event.preventDefault(); await saveQueue.current; navigate(`/studies/${analysisSource.studyId}`); }}>Study overview</Link></div>
        )}
        {storageWarning && (
          <div className="app-storage-warning" role="status">
            This dataset is too large to preserve reliably after a refresh. Keep this tab open until you download your results.
            <button type="button" onClick={() => setStorageWarning(false)} aria-label="Dismiss storage warning">×</button>
          </div>
        )}
        <ErrorBoundary key={normalizedPath}>
          <Suspense fallback={<main className="workflow-page"><LoadingSkeleton variant={currentStage === 'results' ? 'results' : 'analysis'} label="Loading this analysis step…" /></main>}>
          <Routes>
          <Route path="/" element={<Researcher onAnalyze={handleStudyAnalysis} hasActiveAnalysis={Boolean(sessionId)} onResumeAnalysis={() => handleAdvanceStage(resumeStage)} />} />
          <Route path="/studies/:studyId" element={<Researcher onAnalyze={handleStudyAnalysis} hasActiveAnalysis={Boolean(sessionId)} onResumeAnalysis={() => handleAdvanceStage(resumeStage)} />} />
          <Route
            path="/analysis"
            element={(
              <ResearcherGate><Start
                hasActiveAnalysis={Boolean(sessionId)}
                researchQuestion={projectMetadata.researchQuestion}
                responseCount={dataset?.length || 0}
                resumeStage={resumeStage}
                onResume={() => handleAdvanceStage(resumeStage)}
                onSessionStart={handleSessionStart}
                onAdvanceStage={() => handleAdvanceStage("upload")}
                setLabels={setLabels}
                notice={sessionNotice}
                onDismissNotice={() => setSessionNotice(null)}
              /></ResearcherGate>
            )}
          />
          <Route
            path="/upload"
            element={sessionId ? <ResearcherGate>
              <Upload
                sessionId={sessionId}
                setDataset={setDataset}
                setLabels={setLabels}
                setVisualization={setVisualization}
                setClaudeData={setClaudeData}
                setSvmData={setSvmData}
                setResults={setResults}
                onAdvanceStage={() => handleAdvanceStage("preview")}
                setProjectMetadata={handleSetProjectMetadata}
                setUploadSummary={setUploadSummary}
              />
            </ResearcherGate> : <Navigate to="/" replace />}
          />
          <Route
            path="/code"
            element={sessionId && dataset ? <ResearcherGate>
              <Preview
                sessionId={sessionId}
                dataset={dataset}
                labels={labels}
                setLabels={setLabels}
                claudeData={claudeData}
                setClaudeData={setClaudeData}
                svmData={svmData}
                setSvmData={setSvmData}
                setDataset={setDataset}
                projectMetadata={projectMetadata}
                uploadSummary={uploadSummary}
                onAdvanceStage={() => handleAdvanceStage("review")}
              />
            </ResearcherGate> : <Navigate to={sessionId ? "/upload" : "/"} replace />}
          />
          <Route
            path="/review"
            element={sessionId && dataset && claudeData ? <ResearcherGate>
              <Review
                sessionId={sessionId}
                visualization={visualization}
                labels={[...labels, unclassifiedTheme]}
                setLabels={setLabels}
                claudeData={claudeData}
                setClaudeData={setClaudeData}
                dataset={dataset}
                setDataset={setDataset}
                setResults={setResults}
                projectMetadata={projectMetadata}
                onAdvanceStage={() => handleAdvanceStage("results")}
              />
            </ResearcherGate> : <Navigate to={sessionId && dataset ? "/code" : sessionId ? "/upload" : "/"} replace />}
          />
          <Route
            path="/results"
            element={sessionId && results ? <ResearcherGate>
              <Analyze
                labels={labels}
                results={results}
                responseCount={dataset?.length || 0}
                sessionId={sessionId}
                onAdvanceStage={() => handleAdvanceStage("start")}
              />
            </ResearcherGate> : <Navigate to={sessionId && dataset && claudeData ? "/review" : sessionId && dataset ? "/code" : sessionId ? "/upload" : "/"} replace />}
          />
          <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
