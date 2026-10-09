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
import Participant from "./components/Participant";
import { API_URL } from "./api";
import { supabase } from './supabase';
import { responsesForQuestion, responsesToCsv } from './utils/studyResponses';
import "./components/Workflow.css";

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
  if (allowed === null) return <div className="route-loading" role="status">Checking researcher access…</div>;
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
      fetch(`${API_URL}/session/${sessionId}`, { method: 'DELETE' }).catch(() => {});
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

  const handleStudyAnalysis = async (study, question, submissions, savedAnalysis = null) => {
    const responses = responsesForQuestion(question.id, submissions, savedAnalysis);
    if (!responses.length) throw new Error('There are no responses to code for this question yet.');
    const modelStatus = await axios.get(`${API_URL}/models`);
    if (!modelStatus.data?.models?.navigator) throw new Error('Set NAVIGATOR_API_KEY on the analysis backend before coding study responses.');
    const csv = responsesToCsv(responses);
    if (new Blob([csv]).size > 20 * 1024 * 1024) throw new Error('This question has more than 20 MB of responses. Download and split the data before analysis.');
    const newSession = await axios.post(`${API_URL}/session/start`);
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
      handleSessionStart(newSessionId);
      setDataset(savedAnalysis?.coded_responses || uploaded.data.preprocessed_dataset);
      setLabels(savedAnalysis?.labels || uploaded.data.predefined_themes || []);
      setVisualization(uploaded.data.visualization_image);
      setClaudeData(savedAnalysis?.classifications || null);
      setProjectMetadata(metadata);
      setUploadSummary(uploaded.data.dataset_summary || null);
      setAnalysisSource({ studyId: study.id, questionId: question.id, ownerId: study.owner_id, title: study.title, prompt: question.prompt });
      navigate(savedAnalysis?.stage === 'review' && savedAnalysis.classifications ? '/review' : '/code');
    } catch (error) {
      await axios.delete(`${API_URL}/session/${newSessionId}`).catch(() => {});
      throw new Error(error?.response?.data?.error || error.message || 'Could not prepare these responses for coding.');
    }
  };

  useEffect(() => {
    if (!supabase || !analysisSource || !dataset || !['preview', 'review', 'results'].includes(currentStage)) return undefined;
    const version = ++saveVersion.current;
    setAnalysisSaveState('Saving study analysis…');
    const snapshot = {
      study_id: analysisSource.studyId,
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
      const { error } = await supabase.from('study_analyses').upsert(snapshot, { onConflict: 'study_id,question_id' });
      if (version === saveVersion.current) setAnalysisSaveState(error ? `Could not save study progress: ${error.message}` : 'Study progress saved');
    });
    return undefined;
  }, [analysisSource, currentStage, dataset, labels, claudeData, results]);

  useLayoutEffect(() => {
    let secondFrame;
    const firstFrame = window.requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      secondFrame = window.requestAnimationFrame(() => {
        window.scrollTo(0, 0);
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
  }, [currentStage]);

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

    fetch(`${API_URL}/session/${sessionId}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 410) {
          clearAnalysis();
          setSessionNotice('Your previous analysis session expired. Start a new analysis to continue.');
          navigate('/', { replace: true });
        }
      })
      .catch(() => {});

    return () => controller.abort();
  // Validate only the restored session ID; state setters are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="App">
      <Header hasActiveAnalysis={Boolean(sessionId && currentStage !== 'start')} participant={normalizedPath.startsWith('/join')} />
      <div className="app-content">
        {analysisSource && ['preview', 'review', 'results'].includes(currentStage) && (
          <div className="study-analysis-banner"><span><strong>{analysisSource.title}</strong> · {analysisSource.prompt}</span><span role="status">{analysisSaveState}</span><Link to={`/studies/${analysisSource.studyId}`} onClick={async (event) => { event.preventDefault(); await saveQueue.current; navigate(`/studies/${analysisSource.studyId}`); }}>Study overview</Link></div>
        )}
        {storageWarning && (
          <div className="app-storage-warning" role="status">
            This dataset is too large to preserve reliably after a refresh. Keep this tab open until you download your results.
            <button type="button" onClick={() => setStorageWarning(false)} aria-label="Dismiss storage warning">×</button>
          </div>
        )}
        <ErrorBoundary key={normalizedPath}>
          <Suspense fallback={<div className="route-loading" role="status">Loading this analysis step…</div>}>
          <Routes>
          <Route path="/" element={<Researcher onAnalyze={handleStudyAnalysis} hasActiveAnalysis={Boolean(sessionId)} onResumeAnalysis={() => handleAdvanceStage(resumeStage)} />} />
          <Route path="/studies/:studyId" element={<Researcher onAnalyze={handleStudyAnalysis} hasActiveAnalysis={Boolean(sessionId)} onResumeAnalysis={() => handleAdvanceStage(resumeStage)} />} />
          <Route path="/join" element={<Participant />} />
          <Route path="/join/:code" element={<Participant />} />
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
