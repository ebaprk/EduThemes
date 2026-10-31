import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import axios from 'axios';
import "./App.css";
import { AnalysisContext } from './components/AnalysisContext';
import PasswordReset from './components/PasswordReset';
import Header from "./components/Header";
import Upload from "./components/Upload";
import Start from "./components/Start";
import Preview from "./components/Preview";
import NotFound from "./components/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import Researcher from "./components/Researcher";
import LoadingSkeleton from './components/LoadingSkeleton';
import { completedRuns, retainedRuns, resultsSnapshot, findRun } from './utils/analysisHistory';
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
  const studyRoute = normalizedPath.match(/^\/studies\/([^/]+)\/questions\/([^/]+)\/(code|review|results)$/);
  const currentStage = studyRoute ? ({code:'preview', review:'review', results:'results'})[studyRoute[3]] : pathStages[normalizedPath] || "start";
  const [openingError, setOpeningError] = useState('');
  const opening = useRef('');

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
  const requestedRun = new URLSearchParams(location.search).get('run') || 'latest';
  const requestedVersion = new URLSearchParams(location.search).get('version');
  const contextMatches = Boolean(studyRoute && analysisSource?.studyId === studyRoute[1] && analysisSource?.questionId === studyRoute[2]
    && (!requestedVersion || analysisSource.versionId === requestedVersion)
    && (currentStage === 'results' ? (!analysisSource.readOnly && !new URLSearchParams(location.search).has('run')) || (analysisSource.readOnly && analysisSource.viewRun === requestedRun) : !analysisSource.readOnly));
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
    navigate(analysisSource && ['preview','review','results'].includes(stage)
      ? `/studies/${analysisSource.studyId}/questions/${analysisSource.questionId}/${stage === 'preview' ? 'code' : stage}?version=${analysisSource.versionId}` : stagePaths[stage] || stagePaths.start);
  };

  const handleSetProjectMetadata = (metadata) => {
    setProjectMetadata(metadata);
  };

  const handleStudyAnalysis = async (study, question, submissions, savedAnalysis = null, savedRevision = 0) => {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) throw new Error('Sign in before coding study responses.');
    const responses = responsesForQuestion(question.id, submissions, savedAnalysis);
    if (!responses.length && savedAnalysis?.stage !== 'results') throw new Error('There are no responses to code for this question yet.');
    const newSessionId = `study:${crypto.randomUUID()}`;
    const metadata = {
      researchQuestion: study.research_question,
      projectDescription: study.description || study.title,
      additionalContext: [study.additional_context, `Study question being coded: ${question.prompt}`].filter(Boolean).join('\n\n'),
      apiKey: 'navigator',
    };
    const imported = savedAnalysis?.coded_responses || attachResponseSources(responses.map(original => ({ original, cleaned: original, themes: [] })), responseRecordsForQuestion(question.id, submissions));
    handleSessionStart(newSessionId);
    setDataset(imported);
    setLabels(savedAnalysis?.labels || []);
    setClaudeData(savedAnalysis?.classifications || null);
    setResults(savedAnalysis?.stage === 'results' ? savedAnalysis.results : null);
    setProjectMetadata(metadata);
    setUploadSummary({ response_count: imported.length, response_column: 'Response' });
    const original = savedAnalysis || submissions.savedAnalysis;
    const source = { studyId: study.id, versionId: study.current_version_id, questionId: question.id, ownerId: study.owner_id,
      actorId: auth.session.user.id, runId: savedAnalysis?.stage !== 'results' && savedAnalysis?.results?._run_id || newSessionId, revision: savedRevision || savedAnalysis?.revision || 0,
      title: study.title, prompt: question.prompt, versionNumber: study.version_number, viewRun: new URLSearchParams(location.search).get('run') || 'latest',
      retained: retainedRuns(original), readOnly: savedAnalysis?.stage === 'results' };
    analysisRuns.current.set(source.runId, {revision:source.revision,blocked:false});
    setAnalysisSource(source);
    const step = savedAnalysis?.stage === 'results' ? 'results' : savedAnalysis?.stage === 'review' && savedAnalysis.classifications ? 'review' : 'code';
    navigate(`/studies/${study.id}/questions/${question.id}/${step}?version=${study.current_version_id}${step === 'results' ? `&run=${source.viewRun}` : ''}`, { replace: Boolean(studyRoute) });
  };

  const activeSession = useRef(sessionId);
  activeSession.current = sessionId;
  const ensureAnalysisSession = async () => {
    if (!sessionId?.startsWith('study:')) return sessionId;
    try {
      const created = await axios.post(`${API_URL}/session/start`, { study_id: analysisSource?.studyId });
      const id = created.data.session_id;
      if (!id) throw new Error('Unable to connect to the analysis service.');
      const form = new FormData();
      form.append('dataset', new File([responsesToCsv(dataset.map(entry => entry.original))], 'responses.csv', {type:'text/csv'}));
      for (const [key,value] of Object.entries(projectMetadata)) form.append(key,value);
      await axios.post(`${API_URL}/session/${id}/upload-dataset`, form);
      if (activeSession.current !== sessionId) throw new Error('Analysis changed.');
      setSessionId(id);
      return id;
    } catch { throw new Error('The analysis service is unavailable. Your coding is saved; try this action again later.'); }
  };

  useEffect(() => {
    if (!studyRoute || !supabase) return;
    const key = location.pathname + location.search;
    const index = new URLSearchParams(location.search).get('run') || 'latest';
    if (contextMatches && dataset && (currentStage !== 'results' || results)) return;
    if (opening.current === key) return;
    opening.current = key;
    setOpeningError('');
    let cancelled = false;
    (async () => {
      const {data:study,error} = await supabase.from('studies').select('*').eq('id',studyRoute[1]).single();
      if(error || !study) throw error || new Error('Study unavailable.');
      if (currentStage !== 'results') { const access=await supabase.rpc('study_role',{p_study_id:study.id}); if(access.error || !['owner','researcher'].includes(access.data)) throw new Error('You have read-only access. Open the saved findings from the study.'); }
      const versionId = new URLSearchParams(location.search).get('version') || study.current_version_id;
      const [versions, submissions, analyses] = await Promise.all([
        supabase.from('study_versions').select('*').eq('study_id',study.id),
        supabase.from('study_submissions').select('*').eq('study_id',study.id),
        supabase.from('study_analyses').select('*').eq('study_id',study.id)]);
      const failed = [versions,submissions,analyses].find(r => r.error); if(failed) throw failed.error;
      const version = versions.data.find(v => v.id === versionId);
      const question = version?.questions.find(q => q.id === studyRoute[2]);
      if(!question) throw new Error('Question unavailable in this version.');
      const analysis = analyses.data.find(a => a.question_id === question.id && a.study_version_id === versionId);
      const saved = currentStage === 'results' ? findRun(analysis,index) : analysis;
      if(currentStage === 'results' && !saved) throw new Error('No completed findings for this question.');
      const entries = submissions.data.filter(r => r.study_version_id === versionId);
      if (cancelled) return;
      await handleStudyAnalysis({...study,...version,id:study.id,current_version_id:versionId},question,entries,saved,analysis?.revision || 0);
    })().catch(error => { if (!cancelled) setOpeningError(error.message || 'Could not reopen this analysis.'); }).finally(() => { if (opening.current === key) opening.current = ''; });
    return () => { cancelled = true; if (opening.current === key) opening.current = ''; };
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (currentStage !== 'results' || !results || !analysisSource || analysisSource.readOnly) return;
    setAnalysisSource(previous => !previous || (previous.completedRun && JSON.stringify({...previous.completedRun.results,_run_id:undefined}) === JSON.stringify({...results,_run_id:undefined}) && JSON.stringify(previous.completedRun.coded_responses) === JSON.stringify(dataset) && JSON.stringify(previous.completedRun.labels) === JSON.stringify(labels)) ? previous : ({...previous,
      retained: previous.completedRun ? [previous.completedRun, ...(previous.retained || [])] : previous.retained,
      completedRun: {stage:'results',labels,coded_responses:dataset,classifications:claudeData,results:{...results,_run_id:previous.runId},response_count:dataset.length,updated_at:new Date().toISOString()} }));
  }, [currentStage, results]);

  useEffect(() => {
    if (!supabase || !analysisSource?.versionId || analysisSource.readOnly || !dataset || !['preview', 'review', 'results'].includes(currentStage)) return undefined;
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
      results: resultsSnapshot(currentStage === 'results' ? results : null, currentStage !== 'results' && analysisSource.completedRun ? [analysisSource.completedRun, ...(analysisSource.retained || [])] : analysisSource.retained, analysisSource.runId),
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
  }, [analysisSource?.runId, currentStage, dataset, labels, claudeData, results, analysisSource?.retained]);

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
      if (event === 'PASSWORD_RECOVERY') navigate('/reset-password', {replace:true});
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
    if (!sessionId || sessionId.startsWith('study:')) return undefined;
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
      <Header analysisSource={analysisSource} hasActiveAnalysis={Boolean(sessionId && currentStage !== 'start')} />
      <div className="app-content" id="main-content" tabIndex="-1">
        {analysisSource && ['preview', 'review', 'results'].includes(currentStage) && (
          <div className="study-analysis-banner"><span><strong>{analysisSource.title}</strong> · {analysisSource.versionNumber ? `Version ${analysisSource.versionNumber} · ` : ''}{analysisSource.prompt}</span>{analysisSaveState.startsWith('Saving') ? <LoadingSkeleton variant="inline" label={analysisSaveState} /> : <span role="status">{analysisSource.readOnly ? 'Saved findings' : analysisSaveState}</span>}{analysisSaveState.startsWith('Could not') && <button type="button" className="study-text-button" onClick={downloadCurrentCoding}>Download current coding</button>}<Link to={`/studies/${analysisSource.studyId}?section=analysis&version=${analysisSource.versionId}`} onClick={async (event) => { event.preventDefault(); await saveQueue.current; navigate(`/studies/${analysisSource.studyId}?section=analysis&version=${analysisSource.versionId}`); }}>Study overview</Link></div>
        )}
        {storageWarning && (
          <div className="app-storage-warning" role="status">
            This dataset is too large to preserve reliably after a refresh. Keep this tab open until you download your results.
            <button type="button" onClick={() => setStorageWarning(false)} aria-label="Dismiss storage warning">×</button>
          </div>
        )}
        <AnalysisContext.Provider value={analysisSource}><ErrorBoundary key={normalizedPath}>
          <Suspense fallback={<main className="workflow-page"><LoadingSkeleton variant={currentStage === 'results' ? 'results' : 'analysis'} label="Loading this analysis step…" /></main>}>
          {openingError ? <main className="workflow-page"><p role="alert">{openingError}</p><Link to={`/studies/${studyRoute?.[1]}?section=analysis`}>Back to study</Link></main> : studyRoute && (!contextMatches || !dataset || (currentStage === 'results' && !results)) ? <LoadingSkeleton variant="analysis" label="Opening saved analysis…" /> : <Routes location={studyRoute ? {...location, pathname: stagePaths[currentStage]} : location}>
          <Route path="/reset-password" element={<PasswordReset />} />
          <Route path="/" element={<Researcher onAnalyze={handleStudyAnalysis} hasActiveAnalysis={Boolean(sessionId)} onResumeAnalysis={() => handleAdvanceStage(resumeStage)} />} />
          <Route path="/studies/new" element={<Researcher onAnalyze={handleStudyAnalysis} />} />
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
                ensureSession={ensureAnalysisSession}
                setDataset={setDataset}
                setLabels={setLabels}
                setVisualization={setVisualization}
                setClaudeData={setClaudeData}
                setSvmData={setSvmData}
                setResults={setResults}
                onAdvanceStage={() => handleAdvanceStage("preview")}
                projectMetadata={projectMetadata}
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
                ensureSession={ensureAnalysisSession}
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
                ensureSession={ensureAnalysisSession}
                visualization={visualization}
                labels={[...labels.filter(label => label.name !== 'Unclassified'), unclassifiedTheme]}
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
                ensureSession={ensureAnalysisSession}
                onAdvanceStage={() => analysisSource ? navigate(`/studies/${analysisSource.studyId}?section=analysis&version=${analysisSource.versionId}`) : handleAdvanceStage("start")}
                analysisSource={analysisSource}
                dataset={dataset}
              />
            </ResearcherGate> : <Navigate to={sessionId && dataset && claudeData ? "/review" : sessionId && dataset ? "/code" : sessionId ? "/upload" : "/"} replace />}
          />
          <Route path="*" element={<NotFound />} />
          </Routes>}
          </Suspense>
        </ErrorBoundary></AnalysisContext.Provider>
      </div>
    </div>
  );
}

export default App;
