import React, { useEffect, useLayoutEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import Header from "./components/Header";
import Upload from "./components/Upload";
import Start from "./components/Start";
import Preview from "./components/Preview";
import Review from "./components/Review";
import Analyze from "./components/Analyze";
import NotFound from "./components/NotFound";
import "./components/Workflow.css";

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
  const [projectMetadata, setProjectMetadata] = useSessionValue("eduthemes.projectMetadata", {
    researchQuestion: "",
    projectDescription: "",
    additionalContext: "",
    apiKey: ""
  });

  const handleSessionStart = (newSessionId) => {
    setSessionId(newSessionId);
    setDataset(null);
    setVisualization(null);
    setLabels([]);
    setClaudeData(null);
    setSvmData(null);
    setResults(null);
    setProjectMetadata({
      researchQuestion: "",
      projectDescription: "",
      additionalContext: "",
      apiKey: ""
    });
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
      secondFrame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [currentStage]);

  return (
    <div className="App">
      <Header />
      <div className="app-content">
        <Routes>
          <Route
            path="/"
            element={(
              <Start
                onSessionStart={handleSessionStart}
                onAdvanceStage={() => handleAdvanceStage("upload")}
                setLabels={setLabels}
              />
            )}
          />
          <Route
            path="/upload"
            element={sessionId ? (
              <Upload
                sessionId={sessionId}
                setDataset={setDataset}
                setVisualization={setVisualization}
                onAdvanceStage={() => handleAdvanceStage("preview")}
                setProjectMetadata={handleSetProjectMetadata}
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
                sessionId={sessionId}
                onAdvanceStage={() => handleAdvanceStage("start")}
              />
            ) : <Navigate to={sessionId && dataset && claudeData ? "/review" : sessionId && dataset ? "/code" : sessionId ? "/upload" : "/"} replace />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
