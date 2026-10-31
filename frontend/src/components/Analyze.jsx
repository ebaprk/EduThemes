import React, { useState, useEffect } from "react";
import { Button, Container, OverlayTrigger, Card, Row, Col, Tab, Tabs, Tooltip } from "react-bootstrap";
import { Chart as ChartJS, ArcElement, Legend, Tooltip as ChartTooltip , CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Bar, Doughnut } from "react-chartjs-2";
import axios from "axios";
import "./Analyze.css";
import ReactMarkdown from 'react-markdown';
import { FaDownload, FaRedo } from 'react-icons/fa';
import { API_URL, getApiErrorMessage } from '../api';
import { csvCell } from '../utils/participantData';
import StudyEvidence from './StudyEvidence';
import WorkflowHeader from './WorkflowHeader';
import WorkflowAlert from './WorkflowAlert';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';

ChartJS.register(
  ChartTooltip,
  ArcElement,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

const Analyze = ({labels, results, onAdvanceStage, sessionId, responseCount = 0, analysisSource, dataset = [] }) => {
  const [summary, setSummary] = useState(results?.summary || "");
  const [error, setError] = useState(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(!results?.summary);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (results && results.summary) {
      setSummary(results.summary);
      setIsSummaryLoading(false);
    } else if (sessionId?.startsWith('study:')) { setSummary(''); setIsSummaryLoading(false); } else {
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

  const download = (content, name, type) => { const url=URL.createObjectURL(new Blob([content],{type})); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); };
  const handleDownloadJSON = () => download(JSON.stringify({study:analysisSource?.title,question:analysisSource?.prompt,version:analysisSource?.versionId,results,labels,responses:dataset},null,2),'coded-responses.json','application/json');
  const downloadCsv = () => { const quote = csvCell; download(['Response,Themes', ...dataset.map(entry => [entry.original,entry.themes?.map(t=>t.name).join('; ')].map(quote).join(','))].join('\n'),'coded-responses.csv','text/csv'); };
  const handleDownloadSummary = () => {
    if (summary) {
      const blob = new Blob([summary], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "qualitative_analysis_summary.txt";
      link.click();
      URL.revokeObjectURL(url);
    }
  };


  const labelMap = React.useMemo(() => {
    const map = {};
    if (labels && Array.isArray(labels)) {
      labels.forEach(label => {
        map[label.name] = label.definition || label.description || "No definition available.";
      });
    }
    return map;
  }, [labels]);

  const themeData = Array.isArray(results) ? results : results?.themes || [];
  const totalMentions = themeData.reduce((total, item) => total + Number(item.frequency || 0), 0);
  const leadingTheme = themeData.length > 0
    ? themeData.reduce((leading, item) => Number(item.frequency || 0) > Number(leading.frequency || 0) ? item : leading)
    : null;
  const unclassifiedCount = Number(themeData.find((item) => item.name === 'Unclassified')?.frequency || 0);

  return (
    <Container fluid className="workflow-page analysis-page">
      <WorkflowHeader
        currentStep={4}
        eyebrow="Step 4 · Analysis complete"
        title="Findings"
        readOnly={analysisSource?.readOnly}
        description=""
      />

      <WorkflowAlert message={error} onClose={() => setError(null)} />

      <div className="analysis-metrics">
        <div className="analysis-metric">
          <span>Themes discovered</span>
          <strong>{themeData.filter(t => t.name !== 'Unclassified').length}</strong>
        </div>
        <div className="analysis-metric">
          <span>Responses analyzed</span>
          <strong>{responseCount}</strong>
        </div>

        <div className="analysis-metric">
          <span>Still unclassified</span>
          <strong>{unclassifiedCount}</strong>
        </div>

      </div>

      <div className="study-actions findings-exports"><button className="study-secondary" onClick={handleDownloadSummary}>Download summary</button><button className="study-secondary" onClick={downloadCsv}>Download coded CSV</button><button className="study-secondary" onClick={handleDownloadJSON}>Download full analysis</button></div>
      <Tabs defaultActiveKey="summary" className="analysis-tabs">
        <Tab eventKey="summary" title="Summary">
          <Card className="workflow-panel analysis-panel">
            <Card.Body>

              <div className="summary-content">
                {isSummaryLoading ? <LoadingSkeleton label="Loading your analysis summary…" rows={8} /> : <ReactMarkdown>{summary || "No summary was saved for this run."}</ReactMarkdown>}
              </div>
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="visualization" title="Visualizations">
          <Row className="g-4">
            <Col md={6}>
              <Card className="analysis-chart-card h-100">
                <Card.Header>Theme Distribution</Card.Header>
                <Card.Body>
                  <div className="analysis-chart">
                    <Doughnut
                      data={{
                        labels: themeData.map((item) => item.name),
                        datasets: [
                          {
                            label: "Count",
                            data: themeData.map((item) => item.frequency),
                            backgroundColor: themeData.map((item) => item.color),
                            borderColor: themeData.map((item) => item.color),
                          },
                        ],
                      }}
                      options={{
                        plugins: {
                          legend: {
                            display: false,

                            position: "bottom",
                          },
                          title: {
                            display: false,
                            text: "Hover over to see which theme it is!",
                          },
                        },
                      }}
                    />
                  </div>
                </Card.Body>
              </Card>
            </Col>

            <Col md={6}>
              <Card className="analysis-chart-card h-100">
                <Card.Header>Theme Frequency</Card.Header>
                <Card.Body>
                <div className="analysis-chart">
                  <Bar

                    data={{
                      labels: themeData.map((item) => item.name),
                      datasets: [
                        {
                          label: "Response Count",
                          data: themeData.map((item) => item.frequency),
                          backgroundColor: themeData.map((item) => item.color),
                          borderColor: themeData.map((item) => item.color),
                          borderRadius: 5,
                        },
                      ],
                    }}
                    options={{
                      indexAxis: 'x',
                      plugins: {
                        legend: {
                          display: false,
                        },
                      },

                    }}
                  />
                  <table className="visually-hidden">
                    <caption>Theme frequencies</caption>
                    <thead><tr><th>Theme</th><th>Response count</th></tr></thead>
                    <tbody>
                      {themeData.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.frequency}</td></tr>)}
                    </tbody>
                  </table>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>

        <Tab eventKey="themes" title="Themes & evidence">
          <Card className="workflow-panel analysis-panel">
            <Card.Body>


              <div>
                {themeData && themeData.length > 0 ? (
                  <div className="analysis-theme-grid">
                    {themeData.map((item, index) => (
                      <OverlayTrigger
                        key={index}
                        delay={{ hide: 450, show: 300 }}
                        overlay={(props) => (
                          <Tooltip {...props} >
                            <div style={{ fontSize: '1.2em',  borderRadius: '5px' }}>
                              Definition - {labelMap[item.name] || "No description available"}
                            </div>
                          </Tooltip>
                        )}
                        placement="bottom"
                      >
                        <div
                          key={index}
                          className="analysis-theme-card"
                          style={{ '--theme-color': item.color || '#8d95a5' }}
                        >
                          <div className="analysis-theme-card__topline">
                            <span className="analysis-theme-card__dot" aria-hidden="true" />
                            <h3>{item.name}</h3>
                          </div>
                          <p>
                            <strong>{item.frequency}</strong> responses
                          </p>
                          <p className="analysis-theme-card__description">{labelMap[item.name] || 'No description available.'}</p>
                        </div>
                      </OverlayTrigger>
                    ))}
                  </div>
                ) : (
                  <p className="workflow-empty">No themes available.</p>
                )}
              </div>
            </Card.Body>
          </Card>
        </Tab>

      </Tabs>

      <StudyEvidence analysis={{coded_responses:dataset,labels}} responses={[]} sourceBase={analysisSource ? `/studies/${analysisSource.studyId}?section=collect&version=${analysisSource.versionId}` : null} questionId={analysisSource?.questionId} />
      <div className="analysis-new-action">
        <Button
          variant="primary"
          size="lg"
          onClick={() => onAdvanceStage()}
        >
          <FaRedo className="me-2" aria-hidden="true" />
          {analysisSource ? 'Back to study analysis' : 'Import another dataset'}
        </Button>
      </div>
    </Container>
  );
};

function isDarkColor(color) {
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance < 0.5;
}

export default Analyze;
