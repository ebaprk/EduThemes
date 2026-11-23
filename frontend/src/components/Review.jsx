import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import React, { useState, useEffect, useRef } from 'react';
import { FaCheck, FaTimes, FaUndo } from 'react-icons/fa';
import axios, { all } from 'axios';
import LabelCreationWindow from './LabelCreationWindow';
import { API_URL, getApiErrorMessage } from '../api';
import WorkflowHeader from './WorkflowHeader';
import WorkflowAlert from './WorkflowAlert';
import useAnalysisJob from '../hooks/useAnalysisJob';
import { addThemeAssignment, classificationsFromDataset, rejectThemeAssignments, reviewedDataset, reviewResponseThemes } from '../utils/themeAssignments';
import { recordReviewDecision } from '../utils/reviewDecisions';
//import ReviewModal from './ReviewModal';
import { Notice, WorkbenchColumn, WorkbenchRow } from "@eduthemes/ui/workbench";
import { Card, CardContent, CardFooter, CardHeader } from "@eduthemes/ui/components/card";
import { Label } from "@eduthemes/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Button } from "@eduthemes/ui/components/button";
import { Progress } from "@eduthemes/ui/components/progress";
import { Checkbox } from "@eduthemes/ui/components/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@eduthemes/ui/components/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@eduthemes/ui/components/tabs";
const getReadableTextColor = (color = '#000000') => {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#ffffff';
  const [red, green, blue] = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? '#172b4d' : '#ffffff';
};
const Review = ({
  sessionId,
  ensureSession,
  analysisSource,
  importSaveAction,
  beforeJob,
  labels,
  setLabels,
  setResults,
  dataset,
  setDataset,
  claudeData,
  setClaudeData,
  onAdvanceStage,
  projectMetadata
}) => {
  const [currentThemeIndex, setCurrentThemeIndex] = useState(() => Math.min(Number(sessionStorage.getItem(`review-position:${sessionId}`)) || 0, Math.max(labels.length - 1, 0)));
  useEffect(() => {
    sessionStorage.setItem(`review-position:${sessionId}`, String(currentThemeIndex));
  }, [currentThemeIndex, sessionId]);
  const responseList = useRef(null);
  const themeHeading = useRef(null);
  const editorTrigger = useRef(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [requestLoading, setIsLoading] = useState(false);
  const openFindings = (finalDataset, finalLabels, findings) => {
    setDataset(finalDataset);
    setLabels(finalLabels);
    setClaudeData(classificationsFromDataset(finalDataset, finalLabels));
    setResults(findings);
    onAdvanceStage();
  };
  const job = useAnalysisJob(analysisSource, 'findings', saved => {
    openFindings(saved.payload.dataset, saved.payload.labels, saved.result);
  }, beforeJob);
  const isLoading = requestLoading || job.busy;
  const [error, setError] = useState(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [rejectedEntries, setRejectedEntries] = useState([]);
  const [showEditLabels, setShowEditLabels] = useState(false);
  const [unclassifiedSelections, setUnclassifiedSelections] = useState({});
  const [suggestedThemes, setSuggestedThemes] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState(null);
  const [tempUncCat, setTempUncCat] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [allThemes, setAllThemes] = useState([...labels]);
  const [editingResponse, setEditingResponse] = useState(null);
  const [selectedThemes, setSelectedThemes] = useState([]);
  const unclassifiedTheme = {
    name: "Unclassified",
    description: "Responses that don't fit any other theme",
    color: "#cccccc"
  };
  const hasUnclassifiedTheme = labels.some(label => label.name === "Unclassified");
  //let allThemes = hasUnclassifiedTheme ? labels : [...labels];
  const currentTheme = allThemes[currentThemeIndex] || {
    name: "None",
    color: "#cccccc"
  };
  const themeResponses = claudeData?.[currentTheme.name] || [];
  const currentActions = themeResponses.map(index => dataset[index]?.review_decisions?.[currentTheme.name]?.action || null);
  useEffect(() => {
    //console.log(dataset)

    if (!hasUnclassifiedTheme && claudeData && !claudeData["Unclassified"]) {
      setClaudeData(previous => ({
        ...previous,
        Unclassified: []
      }));
    }
  }, [claudeData, hasUnclassifiedTheme, setClaudeData]);
  const setReviewDecision = (responseIndices, action) => {
    setDataset(previous => recordReviewDecision(previous, responseIndices, currentTheme.name, action));
  };
  const handleNextTheme = () => {
    const rejectedIndices = themeResponses.filter((_, index) => currentActions[index] === 'deny');
    if (rejectedIndices.length > 0) {
      const updated = rejectThemeAssignments({
        classifications: claudeData,
        dataset,
        rejectedIndices,
        themeName: currentTheme.name,
        unclassifiedTheme
      });
      setClaudeData(updated.classifications);
      setDataset(updated.dataset);
      if (currentThemeIndex < allThemes.length - 1) setCurrentThemeIndex(currentThemeIndex + 1);else handleSubmitFinalDataset(updated.classifications, updated.dataset);
    } else if (currentThemeIndex < allThemes.length - 1) {
      setCurrentThemeIndex(currentThemeIndex + 1);
      //testing
      //if (allThemes[currentThemeIndex] == "Unclassified"){

      //}
      //testing
    } else {
      handleSubmitFinalDataset();
    }
  };
  const handleGetSuggestedThemes = async () => {
    setLoadingSuggestions(true);
    setSuggestionError(null);
    try {
      const responses = themeResponses.map(idx => dataset[idx]?.original || "Response not found").join('\n');
      const activeSession = ensureSession ? await ensureSession() : sessionId;
      const response = await axios.post(`${API_URL}/session/${activeSession}/suggest-themes`, {
        response: responses,
        specBool: 'true',
        apiKey: projectMetadata.apiKey
      });
      if (!active.current) return;
      if (response.data && response.data.suggested_themes) {
        setSuggestedThemes(response.data.suggested_themes);
        if (!showSuggestions) {
          setShowSuggestions(true);
        }
      } else {
        setSuggestionError("No themes were generated. Try again or add one manually.");
      }
    } catch (error) {
      console.error("Error getting suggested themes:", error.response?.data || error.message);
      setSuggestionError(getApiErrorMessage(error, "We couldn't generate theme suggestions."));
    } finally {
      setLoadingSuggestions(false);
    }
  };
  const handleFinishReassignment = () => {
    const {
      classifications: updatedClassifications,
      dataset: reassignedDataset
    } = rejectThemeAssignments({
      classifications: claudeData,
      dataset,
      rejectedIndices: rejectedEntries,
      themeName: currentTheme.name,
      unclassifiedTheme
    });
    setClaudeData(updatedClassifications);
    setDataset(reassignedDataset);
    setShowReassignModal(false);
    if (currentThemeIndex >= allThemes.length - 1) {
      handleSubmitFinalDataset(updatedClassifications, reassignedDataset);
    } else {
      setCurrentThemeIndex(currentThemeIndex + 1);
    }
  };
  const queryAI = async () => {
    let sent = themeResponses.map((responseIndex, idx) => {
      return dataset[responseIndex]?.original;
    });
    setAiLoading(true);
    setError(null);
    try {
      const activeSession = ensureSession ? await ensureSession() : sessionId;
      const response = await axios.post(`${API_URL}/session/${activeSession}/submit-manual-coding`, {
        labels: allThemes,
        response: sent,
        specBool: 'true',
        apiKey: projectMetadata.apiKey
      });
      if (!active.current) return;
      const dataReturned = response.data.claude_data;
      let updated = {
        classifications: claudeData,
        dataset
      };
      Object.keys(dataReturned).forEach(key => {
        for (var x = 0; x < dataReturned[key].length; x++) {
          const selectedTheme = allThemes.find(theme => theme.name === key);
          if (selectedTheme) {
            updated = addThemeAssignment({
              ...updated,
              theme: selectedTheme,
              responseIndex: themeResponses[dataReturned[key][x]]
            });
          }
        }
      });
      setClaudeData(updated.classifications);
      setDataset(updated.dataset);
    } catch (error) {
      console.error("Error querying AI:", error.response?.data || error.message);
      setError(getApiErrorMessage(error, "We couldn't classify these responses."));
    } finally {
      setAiLoading(false);
    }
  };
  const addTheme = theme => {
    if (!theme?.name || allThemes.some(item => item.name.toLowerCase() === theme.name.toLowerCase())) return;
    if (allThemes.filter(item => item.name !== 'Unclassified').length >= 10) {
      setSuggestionError('You can create up to 10 themes.');
      return;
    }
    setAllThemes(previous => [...previous, theme]);
    setLabels(previous => [...previous.filter(item => item.name !== 'Unclassified'), theme]);
    setClaudeData(previous => ({
      ...previous,
      [theme.name]: previous[theme.name] || []
    }));

    // Update dataset entries to include the new theme structure if needed
    setDataset(prevDataset => prevDataset.map(entry => ({
      ...entry,
      themes: entry.themes || [] // Ensure themes array exists
    })));
  };
  const handleSubmitFinalDataset = async (classificationsOverride = claudeData, datasetOverride = dataset) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedDataset = reviewedDataset({
        classifications: classificationsOverride,
        dataset: datasetOverride,
        labels: allThemes,
      });
      const payload = { dataset: updatedDataset, labels: allThemes, ...projectMetadata };
      if (job.canStart(payload)) {
        await job.start(payload);
        return;
      }
      await beforeJob?.();
      const activeSession = ensureSession ? await ensureSession() : sessionId;
      const response = await axios.post(`${API_URL}/session/${activeSession}/submit-final-dataset`, {
        dataset: updatedDataset,
        labels: allThemes,
        apiKey: projectMetadata.apiKey
      });
      if (!active.current) return;
      if (response.status === 200) {
        openFindings(updatedDataset, allThemes, {
          themes: response.data.themes || [],
          summary: response.data.summary || ''
        });
      } else {
        setError('Error submitting final dataset: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      setError(getApiErrorMessage(error, "We couldn't submit the final dataset."));
    } finally {
      setIsLoading(false);
    }
  };
  const allActionsCompleted = currentTheme.name === "Unclassified" || currentActions.every(action => action !== null);
  const totalThemes = allThemes.length;
  const totalAssignments = Object.entries(claudeData || {}).filter(([name]) => name !== 'Unclassified').reduce((n, [, indices]) => n + indices.length, 0);
  const reviewedAssignments = Object.entries(claudeData || {}).filter(([name]) => name !== 'Unclassified').reduce((n, [name, indices]) => n + indices.filter(i => dataset[i]?.review_decisions?.[name]?.action).length, 0);
  const progressPercentage = totalAssignments ? reviewedAssignments / totalAssignments * 100 : 0;
  const formattedThemeName = `${currentTheme.name} (${themeResponses.length} ${themeResponses.length === 1 ? 'response' : 'responses'})`;
  const pendingCount = currentTheme.name === "Unclassified" ? 0 : currentActions.filter(action => action === null).length;
  const assignableThemes = allThemes.filter(theme => theme.name !== 'Unclassified');
  const openResponseEditor = (responseIndex, trigger) => {
    editorTrigger.current = trigger;
    setSelectedThemes(assignableThemes.filter(theme =>
      claudeData?.[theme.name]?.includes(responseIndex) && dataset[responseIndex]?.review_decisions?.[theme.name]?.action !== 'deny'
    ).map(theme => theme.name));
    setEditingResponse(responseIndex);
  };
  const saveResponseThemes = () => {
    const updated = reviewResponseThemes({
      classifications: claudeData, dataset, labels: [...assignableThemes, unclassifiedTheme],
      responseIndex: editingResponse, selectedNames: selectedThemes,
    });
    setClaudeData(updated.classifications);
    setDataset(updated.dataset);
    setEditingResponse(null);
  };
  return <main className="workflow-page workflow-page--wide review-page">
            <WorkflowHeader currentStep={3} eyebrow="Step 3 · Quality review" title="Review classifications" question={projectMetadata?.researchQuestion} description="Check each theme assignment, then continue." actions={importSaveAction} />

            <WorkflowAlert message={error} onClose={() => setError(null)} />

            {job.panel}
            {requestLoading && !job.busy && <LoadingSkeleton variant="inline" label="Preparing findings…" />}
            {<fieldset disabled={isLoading || aiLoading} className="study-unframed-fieldset"><WorkbenchRow className="g-4 items-stretch">
                <WorkbenchColumn lg={4} xl={3} className="review-sidebar">
                    <Card>
                        <CardContent className="card-body">
                            <Label className="review-theme-select">Review theme · {currentThemeIndex + 1} of {totalThemes}<NativeSelect aria-label="Review theme" value={currentThemeIndex} onChange={event => setCurrentThemeIndex(Number(event.target.value))}>{allThemes.map((theme, index) => <NativeSelectOption value={index} key={theme.name}>{theme.name}</NativeSelectOption>)}</NativeSelect></Label>
                            <span className="sidebar-card__label">Current theme</span>
                            <div className="current-theme">
                                <span className="current-theme__dot" style={{ backgroundColor: currentTheme.color }} aria-hidden="true" />
                                <h2>{currentTheme.name}</h2>
                            </div>
                            <p className="current-theme__description">{currentTheme.description || "No description available"}</p>

                            <div className="review-theme-navigation">
                            <span className="sidebar-card__label">Theme · {currentThemeIndex + 1} of {totalThemes}</span>
                            <div className="review-theme-list">
                                {allThemes.map((label, index) => {
                                    const assignments = claudeData?.[label.name] || [];
                                    const isComplete = label.name !== 'Unclassified' && assignments.length > 0 &&
                                        assignments.every(row => dataset[row]?.review_decisions?.[label.name]?.action);
                                    return <Button type="button" onClick={() => setCurrentThemeIndex(index)} aria-current={index === currentThemeIndex ? 'step' : undefined} key={label.name} className={`review-theme-list__item${index === currentThemeIndex ? ' is-current' : ''}`} variant="ghost" size="auto">
                                        <span className="review-theme-swatch" style={{ backgroundColor: label.color }} aria-hidden="true" />
                                        <span className="review-theme-list__name">{label.name}</span>
                                        {isComplete && <>
                                            <FaCheck className="review-theme-list__check" aria-hidden="true" />
                                            <span className="sr-only">(Reviewed)</span>
                                        </>}
                                    </Button>;
                                })}
                            </div>
                            </div>
                        </CardContent>
                    </Card>
                </WorkbenchColumn>

                <WorkbenchColumn lg={8} xl={9} className="review-main">
                    <Card className="workflow-panel">
                        <CardHeader className="card-header">
                            <div className="workflow-toolbar">
                                <h5 ref={themeHeading} tabIndex={-1} className="mb-0">
                                    {formattedThemeName}
                                </h5>
                                <div className="workflow-toolbar__group">
                                {currentTheme.name === "Unclassified" && <Button variant="outline" onClick={() => queryAI()} disabled={aiLoading || themeResponses.length === 0} aria-busy={aiLoading}>

                                    {aiLoading ? <>
                                            <Skeleton className="edu-skeleton--button" />
                                            &nbsp;&nbsp;Reassigning...
                                        </> : 'Reassign responses'}

                                </Button>}
                                <Button variant="outline" onClick={() => setShowEditLabels(true)}>

                                    Edit themes

                                </Button>

                                </div>
                            </div>
                        </CardHeader>

                        <div className="review-progress-strip">
                            <div className="review-progress-track">
                                <span>
                                    {currentTheme.name === "Unclassified" ? `${reviewedAssignments} of ${totalAssignments} assignments reviewed · ${themeResponses.length} unclassified` : `${pendingCount} ${pendingCount === 1 ? 'response' : 'responses'} left to review`}
                                </span>
                                <Progress className="mb-0" value={progressPercentage} />
                            </div>
                            {currentTheme.name !== "Unclassified" && <div className="review-bulk-actions">
                                <Button variant="default" size="sm" onClick={() => setReviewDecision(themeResponses, 'approve')}>
                                    Accept all
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => setReviewDecision(themeResponses, 'deny')}>
                                    Reject all
                                </Button>
                            </div>}
                        </div>
                        <CardContent className="card-body">
                            {aiLoading && <LoadingSkeleton variant="inline" label="Reassigning responses to your themes…" />}
                            <div className="review-response-list" ref={responseList}>

                                {themeResponses.length > 0 ? themeResponses.map((responseIndex, idx) => {
                  const responseText = responseIndex < dataset.length ? dataset[responseIndex].original : "Response not found";
                  {/*border-bottom*/}
                  return <div key={`${currentTheme.name}-${responseIndex}`} className={`review-response-card${currentActions[idx] === 'approve' ? ' is-approved' : ''}${currentActions[idx] === 'deny' ? ' is-rejected' : ''}`}>
                                                <span>
                                                    {responseText}
                                                </span>
                                                <div className="review-response-actions">
                                                    {currentActions[idx] === null && currentTheme.name !== "Unclassified" && <>
                                                            <Button variant="default" className="flex items-center" size="sm" onClick={() => setReviewDecision([responseIndex], 'approve')} aria-label={`Accept response ${responseIndex + 1}`} title="Accept response">
                                                                <FaCheck />
                                                            </Button>
                                                            <Button variant="destructive" className="flex items-center" size="sm" onClick={() => setReviewDecision([responseIndex], 'deny')} aria-label={`Reject response ${responseIndex + 1}`} title="Reject response">
                                                                <FaTimes />
                                                            </Button>
                                                        </>}
                                                    {currentActions[idx] !== null && currentTheme.name !== "Unclassified" && <>
                                                            <span className={`review-response-status ${currentActions[idx] === 'approve' ? 'is-approved' : 'is-rejected'}`}>
                                                                {currentActions[idx] === 'approve' ? 'Accepted' : 'Rejected'}
                                                            </span>
                                                            <Button variant="outline" className="flex items-center" size="sm" onClick={() => setReviewDecision([responseIndex], null)} aria-label={`Undo decision for response ${responseIndex + 1}`} title="Undo decision">
                                                                <FaUndo />
                                                            </Button>
                                                        </>}
                                                    <Button type="button" variant="outline" data-review-theme-trigger="" disabled={isLoading || !assignableThemes.length} aria-label={`Edit themes for response ${responseIndex + 1}`} onClick={event => openResponseEditor(responseIndex, event.currentTarget)}>
                                                        Edit themes
                                                    </Button>
                                                </div>
                                            </div>;
                }) : <p className="workflow-empty mb-0">
                                        No responses were classified with this theme.
                                    </p>}
                            </div>

                        </CardContent>
                        <CardFooter className="workflow-action-bar card-footer"><div><strong>Theme {currentThemeIndex + 1} of {allThemes.length}</strong><p className="study-help" id="review-next-step">{!allActionsCompleted ? `Accept or reject the ${pendingCount} remaining assignments in this theme.` : currentThemeIndex >= allThemes.length - 1 && reviewedAssignments < totalAssignments ? 'Review the remaining theme assignments before generating findings.' : currentThemeIndex >= allThemes.length - 1 ? themeResponses.length && currentTheme.name === 'Unclassified' ? `${themeResponses.length} responses will remain unclassified. You can assign them above or keep them in the final dataset.` : 'Coding review is complete. Generate findings from the reviewed dataset.' : 'This theme is reviewed. Continue to the next theme.'}</p></div><div className="workflow-action-bar__action">                                <Button variant="default" onClick={handleNextTheme} aria-busy={isLoading} aria-describedby="review-next-step" disabled={!allActionsCompleted || isLoading || currentThemeIndex >= allThemes.length - 1 && reviewedAssignments < totalAssignments}>
                                    {isLoading ? <>
                                            <Skeleton className="edu-skeleton--button" />
                                            {job.busyLabel || 'Preparing findings…'}
                                        </> : currentThemeIndex >= allThemes.length - 1 ? themeResponses.length && currentTheme.name === 'Unclassified' ? 'Keep unclassified & generate findings' : 'Generate findings' : 'Next theme'}
                                </Button></div></CardFooter>
                    </Card>
                </WorkbenchColumn>
            </WorkbenchRow></fieldset>}

            <Dialog open={editingResponse !== null} onOpenChange={open => { if (!open) setEditingResponse(null); }}>
                <DialogContent className="modal-content ui-workbench-dialog review-response-editor" aria-describedby="review-response-editor-description" onCloseAutoFocus={event => {
                  event.preventDefault();
                  const target = editorTrigger.current?.isConnected ? editorTrigger.current : responseList.current?.querySelector('[data-review-theme-trigger]') || themeHeading.current;
                  target?.focus();
                }}>
                    <DialogHeader>
                        <DialogTitle>Edit themes for response {editingResponse === null ? '' : editingResponse + 1}</DialogTitle>
                        <DialogDescription id="review-response-editor-description">Select every theme supported by the original response. Saving accepts the selected themes. Clear all themes to leave the response unclassified.</DialogDescription>
                    </DialogHeader>
                    <div className="modal-body review-editor-body">
                    <blockquote className="review-editor-response">{dataset[editingResponse]?.original}</blockquote>
                    <fieldset className="study-unframed-fieldset review-editor-choices" disabled={isLoading || aiLoading}>
                        <legend className="sr-only">Reviewed themes</legend>
                        {assignableThemes.map(theme => <Label key={theme.name} className="study-check-choice review-editor-choice">
                            <Checkbox checked={selectedThemes.includes(theme.name)} onChange={event => setSelectedThemes(previous => event.target.checked ? [...new Set([...previous, theme.name])] : previous.filter(name => name !== theme.name))} />
                            <span><strong>{theme.name}</strong>{theme.description && <span className="study-help review-editor-definition">{theme.description}</span>}{theme.include_when && <span className="study-help review-editor-definition">Include when: {theme.include_when}</span>}{theme.exclude_when && <span className="study-help review-editor-definition">Exclude when: {theme.exclude_when}</span>}</span>
                        </Label>)}
                    </fieldset>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setEditingResponse(null)}>Cancel</Button>
                        <Button type="button" variant="default" disabled={isLoading || aiLoading} onClick={saveResponseThemes}>Save reviewed themes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showReassignModal} onOpenChange={open => {
      if (!open) (() => setShowReassignModal(false))();
    }}><DialogContent className="modal-content ui-workbench-dialog">
                <DialogHeader className="modal-header">
                    <DialogTitle>Rejected Classifications</DialogTitle>
                </DialogHeader>
                <div className="modal-body">
                    <p>
                        You've rejected {rejectedEntries.length} {rejectedEntries.length === 1 ? 'classification' : 'classifications'} for the theme "{currentTheme.name}".
                        Rejected items will move to the "Unclassified" category if they have no other assignments.
                    </p>
                    <p>
                        Continue to {currentThemeIndex >= allThemes.length - 1 ? 'finish the review' : 'the next theme'}?
                    </p>
                </div>
                <DialogFooter className="modal-footer">
                    <Button variant="outline" onClick={() => setShowReassignModal(false)}>
                        Go Back
                    </Button>
                    <Button variant="default" onClick={handleFinishReassignment}>
                        {currentThemeIndex >= allThemes.length - 1 ? 'Finish Review' : 'Next Theme'}
                    </Button>
                </DialogFooter>
            </DialogContent></Dialog>
            {/*EDIT LABELS*/}
            <Dialog open={showEditLabels} onOpenChange={open => {
      if (!open) (() => setShowEditLabels(false))();
    }}><DialogContent className="modal-content ui-workbench-dialog ui-dialog-lg">
                <DialogHeader className="modal-header">
                <DialogTitle>Edit themes</DialogTitle>
                </DialogHeader>

                <div className="modal-body">
                    {suggestionError && <Notice variant="danger" role="alert" dismissible onClose={() => setSuggestionError(null)}>
                            {suggestionError}
                        </Notice>}
                    <WorkbenchRow>
                    <Tabs id="left-tabs-example" defaultValue="first" className="workbench-codebook-tabs">


                        <TabsList className="review-theme-tabs  workbench-codebook-tab-list">
                            <div>
                            <TabsTrigger value="first">Current themes</TabsTrigger>
                            </div>
                            <div>
                            <TabsTrigger value="second">Add theme</TabsTrigger>
                            </div>
                            <div>
                            <TabsTrigger value="third">AI suggestions</TabsTrigger>
                            </div>
                        </TabsList>


                        <div>
                            <TabsContent value="first" forceMount>
                                {allThemes.map((label, index) => {
                    return <div key={index} className=" items-center mb-2" style={{
                      opacity: index === currentThemeIndex ? 1 : 0.7
                    }}>
                                            <div></div>
                                            <span style={{
                        borderRadius: '10px',
                        padding: '5px',
                        color: getReadableTextColor(label.color),
                        backgroundColor: label.color
                      }}>
                                                {label.name}
                                            </span>
                                            <p style={{
                        marginTop: '5px',
                        marginLeft: '15px'
                      }}>{label.description}</p>
                                        </div>;
                  })}

                            </TabsContent>
                            <TabsContent value="second" forceMount>
                                <LabelCreationWindow labels={allThemes.filter(theme => theme.name !== 'Unclassified')} setLabels={addTheme} addOnly />
                            </TabsContent>
                            <TabsContent value="third" forceMount>

                                <div className="suggestions-toolbar">
                                <span>
                                    {suggestedThemes.length > 0 ? `Found ${suggestedThemes.length} theme suggestions` : "Generate themes"}
                                </span>
                                <Button variant="outline" size="sm" onClick={handleGetSuggestedThemes} disabled={loadingSuggestions || !sessionId || dataset?.length === 0} aria-busy={loadingSuggestions}>
                                    {loadingSuggestions ? <>
                                            <Skeleton className="edu-skeleton--button" />
                                            &nbsp;&nbsp;Refreshing...
                                        </> : 'Refresh Suggestions'}
                                </Button>
                            </div>

                            {loadingSuggestions && <LoadingSkeleton variant="suggestions" label="Generating theme suggestions…" />}
                            {suggestedThemes.length > 0 ? <div className="workbench-list">
                                    {suggestedThemes.map((theme, index) => {
                      const alreadyAdded = allThemes.some(l => l.name === theme.name);
                      return <div key={index} className={`suggestion-item ${alreadyAdded ? 'bg-light' : ''}` + " list-group-item"}>
                                                <div>
                                                    <h5>{theme.name} {alreadyAdded}</h5>
                                                    <p className="text-muted-foreground mb-0">{theme.description}</p>
                                                </div>
                                                <Button variant="outline" onClick={() => {
                          addTheme(theme);
                        }} disabled={alreadyAdded} className="suggestion-item__action">
                                                    {alreadyAdded ? 'Added' : 'Add Theme'}
                                                </Button>
                                            </div>;
                    })}
                                </div> : !loadingSuggestions && <p className="text-center text-muted-foreground">Click "Refresh Suggestions" to generate new themes.</p>}

                            </TabsContent>
                        </div>


                    </Tabs>

                </WorkbenchRow>
                </div>

                <DialogFooter className="modal-footer">
                <Button variant="outline" onClick={() => setShowEditLabels(false)}>Close</Button>
                </DialogFooter>
            </DialogContent></Dialog>
        </main>;
};
export default Review;
