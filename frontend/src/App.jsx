import React, { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import Header from "./components/Header";
import Upload from "./components/Upload";
import Start from "./components/Start";
import Preview from "./components/Preview";
import NotFound from "./components/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import { API_URL } from "./api";
import "./components/Workflow.css";

const Review = lazy(() => import('./components/Review'));
const Analyze = lazy(() => import('./components/Analyze'));

const unclassifiedTheme = {
        name: "Unclassified",
        description: "Responses that don't fit any other theme",
        color: "#cccccc"
    };

const stagePaths = {
  start: "/",
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
  const [sessionNotice, setSessionNotice] = useState(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [projectMetadata, setProjectMetadata] = useSessionValue("eduthemes.projectMetadata", {
    researchQuestion: "",
    projectDescription: "",
    additionalContext: "",
    apiKey: ""
  });

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
  };

  const handleAdvanceStage = (stage) => {
    navigate(stagePaths[stage] || stagePaths.start);
  };

  const handleSetProjectMetadata = (metadata) => {
    setProjectMetadata(metadata);
  };

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
    window.addEventListener('eduthemes:storage-error', handleStorageError);
    window.addEventListener('eduthemes:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('eduthemes:storage-error', handleStorageError);
      window.removeEventListener('eduthemes:session-expired', handleSessionExpired);
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
      <Header hasActiveAnalysis={Boolean(sessionId && currentStage !== 'start')} />
      <div className="app-content">
        {storageWarning && (
          <div className="app-storage-warning" role="status">
            This dataset is too large to preserve reliably after a refresh. Keep this tab open until you download your results.
            <button type="button" onClick={() => setStorageWarning(false)} aria-label="Dismiss storage warning">×</button>
          </div>
        )}
        <ErrorBoundary key={normalizedPath}>
          <Suspense fallback={<div className="route-loading" role="status">Loading this analysis step…</div>}>
          <Routes>
          <Route
            path="/"
            element={(
              <Start
                onSessionStart={handleSessionStart}
                onAdvanceStage={() => handleAdvanceStage("upload")}
                setLabels={setLabels}
                notice={sessionNotice}
                onDismissNotice={() => setSessionNotice(null)}
              />
            )}
          />
          <Route
            path="/upload"
            element={sessionId ? (
              <Upload
                sessionId={sessionId}
                setDataset={setDataset}
                setLabels={setLabels}
                setVisualization={setVisualization}
                onAdvanceStage={() => handleAdvanceStage("preview")}
                setProjectMetadata={handleSetProjectMetadata}
                setUploadSummary={setUploadSummary}
              />
            ) : <Navigate to="/" replace />}
          />
          <Route
            path="/code"
            element={sessionId && dataset ? (
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
            ) : <Navigate to={sessionId ? "/upload" : "/"} replace />}
          />
          <Route
            path="/review"
            element={sessionId && dataset && claudeData ? (
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
            ) : <Navigate to={sessionId && dataset ? "/code" : sessionId ? "/upload" : "/"} replace />}
          />
          <Route
            path="/results"
            element={sessionId && results ? (
              <Analyze
                labels={labels}
                results={results}
                responseCount={dataset?.length || 0}
                sessionId={sessionId}
                onAdvanceStage={() => handleAdvanceStage("start")}
              />
            ) : <Navigate to={sessionId && dataset && claudeData ? "/review" : sessionId && dataset ? "/code" : sessionId ? "/upload" : "/"} replace />}
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
