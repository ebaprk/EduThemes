import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./Analyze.css";
import ReactMarkdown from 'react-markdown';
import { LuArrowRight, LuChevronDown, LuDownload } from 'react-icons/lu';
import { API_URL, getApiErrorMessage } from '../api';
import { csvCell } from '../utils/participantData';
import StudyEvidence from './StudyEvidence';
import ThemeFrequencyChart from './ThemeFrequencyChart';
import WorkflowHeader from './WorkflowHeader';
import WorkflowAlert from './WorkflowAlert';
import LoadingSkeleton from './LoadingSkeleton';
import RunReview from './RunReview';
import FileResearchBrief from './FileResearchBrief';
import FileStudyTransfer from './FileStudyTransfer';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { findingsTabUrl } from '../utils/analysisWorkflow';
import { Button } from "@eduthemes/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@eduthemes/ui/components/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@eduthemes/ui/components/tabs";
import { Card, CardContent } from "@eduthemes/ui/components/card";

const summaryHeadings = { h1: 'h3', h2: 'h3', h3: 'h4' };
const findingsViews = [['summary', 'Summary'], ['themes', 'Evidence'], ['visualization', 'Charts'], ['report', 'Report']];

const Analyze = ({
  labels,
  results,
  onAdvanceStage,
  sessionId,
  uploadSummary,
  responseCount = 0,
  analysisSource,
  dataset = [],
  classifications,
  beforeSave,
  projectMetadata
}) => {
  const [summary, setSummary] = useState(results?.summary || "");
  const [error, setError] = useState(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tabList = useRef(null);
  const requestedTab = params.get('tab');
  const activeTab = findingsViews.some(([tab]) => tab === requestedTab) ? requestedTab : 'summary';
  const setActiveTab = tab => {
    if (tab === activeTab) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    navigate(findingsTabUrl(analysisSource, params, tab), { replace: true });
  };
  const continueTo = tab => {
    setActiveTab(tab);
    requestAnimationFrame(() => tabList.current?.querySelector(`[data-view="${tab}"]`)?.focus({ preventScroll: true }));
  };
  const [isSummaryLoading, setIsSummaryLoading] = useState(!results?.summary);
  useEffect(() => {
    if (results && results.summary) {
      setSummary(results.summary);
      setIsSummaryLoading(false);
    } else if (sessionId?.startsWith('study:')) {
      setSummary('');
      setIsSummaryLoading(false);
    } else {
      const fetchSummary = async () => {
        setIsSummaryLoading(true);
        try {
          const response = await axios.get(`${API_URL}/session/${sessionId}/download-final-dataset`);
          if (response.data && response.data.summary) {
            setSummary(response.data.summary);
          }
        } catch (error) {
          console.error("Error fetching summary:", error);
          setError(getApiErrorMessage(error, "We couldn't load the analysis summary."));
        } finally {
          setIsSummaryLoading(false);
        }
      };
      fetchSummary();
    }
  }, [results, sessionId]);
  const download = (content, name, type) => {
    const url = URL.createObjectURL(new Blob([content], {
      type
    }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleDownloadJSON = () => download(JSON.stringify({
    study: analysisSource?.title,
    question: analysisSource?.prompt,
    version: analysisSource?.versionId,
    results,
    labels,
    responses: dataset
  }, null, 2), 'coded-responses.json', 'application/json');
  const downloadCsv = () => {
    const quote = csvCell;
    download(['Response,Themes', ...dataset.map(entry => [entry.original, entry.themes?.map(t => t.name).join('; ')].map(quote).join(','))].join('\n'), 'coded-responses.csv', 'text/csv');
  };
  const handleDownloadSummary = () => {
    if (summary) {
      const blob = new Blob([summary], {
        type: "text/plain"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "qualitative_analysis_summary.txt";
      link.click();
      URL.revokeObjectURL(url);
    }
  };
  const themeData = Array.isArray(results) ? results : results?.themes || [];
  const themeCount = themeData.filter(theme => theme.name !== 'Unclassified').length;
  const unclassifiedCount = Number(themeData.find(item => item.name === 'Unclassified')?.frequency || 0);
  const nextView = activeTab === 'summary' ? ['themes', 'Review evidence']
    : activeTab === 'themes' ? ['report', 'Prepare report'] : null;
  const importedStudy = analysisSource?.studySnapshot?.source_type === 'file';
  return <main className="workflow-page analysis-page">
      <WorkflowHeader currentStep={4} title="Findings" readOnly={analysisSource?.readOnly} question={projectMetadata?.researchQuestion} compact
        actions={<DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline"><LuDownload aria-hidden="true" />Download data<LuChevronDown aria-hidden="true" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" collisionPadding={12}>
            <DropdownMenuItem onSelect={downloadCsv}>Coded responses (.csv)</DropdownMenuItem>
            <DropdownMenuItem onSelect={handleDownloadJSON}>Full analysis (.json)</DropdownMenuItem>
            <DropdownMenuItem onSelect={handleDownloadSummary} disabled={!summary || isSummaryLoading}>Summary (.txt)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}>
        <ul className="findings-run-totals" role="list" aria-label="Analysis totals">
          <li><strong>{responseCount}</strong> {responseCount === 1 ? 'response' : 'responses'} analyzed</li>
          <li><strong>{themeCount}</strong> {themeCount === 1 ? 'theme' : 'themes'}</li>
          <li><strong>{unclassifiedCount}</strong> unclassified</li>
        </ul>
      </WorkflowHeader>

      <WorkflowAlert message={error} onClose={() => setError(null)} />

      <Tabs id="findings-tabs" className="analysis-tabs" value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line" aria-label="Findings views" ref={tabList}>
          {findingsViews.map(([tab, label]) => <TabsTrigger key={tab} value={tab} data-view={tab}>{label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="summary" forceMount>
          <Card as="article" className="workflow-panel analysis-panel findings-summary">
            <CardContent className="card-body">
              <h2 className="findings-summary-title">Analysis summary</h2>
              <div className="summary-content">
                {isSummaryLoading ? <LoadingSkeleton label="Loading your analysis summary…" rows={8} /> : summary
                  ? <ReactMarkdown components={summaryHeadings}>{summary}</ReactMarkdown>
                  : !error && <p className="study-help">No summary was saved for this run.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="themes" forceMount>
          <StudyEvidence dataset={dataset} labels={labels} themes={themeData}
            sourceBase={analysisSource ? `/studies/${analysisSource.studyId}?section=collect&version=${analysisSource.versionId}` : null}
            selectedTheme={activeTab === 'themes' ? params.get('theme') : null} />
        </TabsContent>
        <TabsContent value="visualization" forceMount>
          <ThemeFrequencyChart themes={themeData} responseCount={responseCount} evidenceHref={theme => findingsTabUrl(analysisSource, params, 'themes', theme)} />
        </TabsContent>
        <TabsContent value="report" forceMount>
      {analysisSource && <RunReview key={`${analysisSource.runId}:${analysisSource.viewRun}`} source={analysisSource} beforeSave={beforeSave} snapshot={analysisSource.studySnapshot || {
          title: analysisSource.title,
          version_number: analysisSource.versionNumber
        }} question={{
          prompt: analysisSource.prompt
        }} run={{
          labels,
          coded_responses: dataset,
          response_count: responseCount,
          results: {
            ...results,
            _run_id: results?._run_id || analysisSource.savedRunKey || analysisSource.runId
          }
        }} />}
      {!analysisSource && <FileResearchBrief key={sessionId} sessionId={sessionId} metadata={projectMetadata} dataset={dataset} labels={labels} results={{
          ...results,
          summary
        }} loading={isSummaryLoading} />}
        </TabsContent>
      </Tabs>

      {(nextView || !analysisSource?.readOnly || importedStudy) && <div className="findings-actions">
        {!analysisSource?.readOnly && <Button variant="link" onClick={onAdvanceStage}>{analysisSource ? 'Back to study analysis' : 'Import another dataset'}</Button>}
        {!analysisSource && <FileStudyTransfer importId={uploadSummary?.importId || sessionId} metadata={projectMetadata} dataset={dataset} labels={labels}
          results={{ ...results, summary }} classifications={classifications} uploadSummary={uploadSummary} loading={isSummaryLoading} />}
        {importedStudy && <Button asChild variant="outline"><Link to={`/studies/${analysisSource.studyId}?section=team-coding&version=${analysisSource.versionId}`}>Compare independent coding</Link></Button>}
        {nextView && <Button className="findings-continue" onClick={() => continueTo(nextView[0])}>{nextView[1]}<LuArrowRight aria-hidden="true" /></Button>}
      </div>}
    </main>;
};
export default Analyze;
