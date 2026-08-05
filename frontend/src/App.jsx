import React, { useLayoutEffect, useState } from "react";
import "./App.css";
import Header from "./components/Header";
import Upload from "./components/Upload";
import Start from "./components/Start";
import Preview from "./components/Preview";
import Review from "./components/Review";
import Analyze from "./components/Analyze";
import Chatbot from "./components/Chatbot";
import "./components/Workflow.css";

const unclassifiedTheme = {
        name: "Unclassified",
        description: "Responses that don't fit any other theme",
        color: "#cccccc"
    };

function App() {
  const [sessionId, setSessionId] = useState(null);
  const [dataset, setDataset] = useState(null);
  const [visualization, setVisualization] = useState(null);
  const [labels, setLabels] = useState([]);
  const [currentStage, setCurrentStage] = useState('start');
  const [claudeData, setClaudeData] = useState(null);
  const [svmData, setSvmData] = useState(null);
  const [results, setResults] = useState(null);
  const [projectMetadata, setProjectMetadata] = useState({
    researchQuestion: "",
    projectDescription: "",
    additionalContext: "",
    apiKey: ""
  });

  const handleSessionStart = (newSessionId) => {
    setSessionId(newSessionId);
  };

  const handleAdvanceStage = (stage) => {
    setCurrentStage(stage);
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
        {currentStage === "start" && (
          <Start
            onSessionStart={handleSessionStart}
            onAdvanceStage={() => handleAdvanceStage('upload')}
            setLabels={setLabels}
          />
        )}

        {currentStage === "upload" && sessionId && (
          <Upload
            sessionId={sessionId}
            setDataset={setDataset} 
            setVisualization={setVisualization}
            onAdvanceStage={() => handleAdvanceStage('preview')}
            setProjectMetadata={handleSetProjectMetadata}
          />
        )}

        {currentStage === "preview" && sessionId && (
          <div>
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
          </div>
        )}

        {currentStage === "review" && sessionId && (
          <div>
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
              onAdvanceStage={() => handleAdvanceStage('results')} 
            />
          </div>
        )}

        {currentStage === "results" && sessionId && (
          <div>
            <Analyze
              labels={labels}
              results={results}
              sessionId={sessionId}
              onAdvanceStage={() => handleAdvanceStage('start')}
            />
          </div>
        )}
      </div>
      <Chatbot 
        sessionId={sessionId} 
        currentStage={currentStage} 
        projectMetadata={projectMetadata} 
      />
    </div>
  );
}

export default App;
