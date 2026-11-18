import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import React, { useState, useEffect, useRef } from 'react';
import LabelModal from './LabelModal';
import axios from 'axios';
import { FaArrowRight, FaTags } from 'react-icons/fa';
import { LuChevronDown, LuX } from 'react-icons/lu';
import { API_URL, getApiErrorMessage } from '../api';
import WorkflowHeader from './WorkflowHeader';
import WorkflowAlert from './WorkflowAlert';
import useAnalysisJob from '../hooks/useAnalysisJob';
import { codingExamples, isCodingExample, addExampleTheme, removeExampleTheme, setNoMatchExample } from '../utils/codingExamples';
import { ContextHelp, Notice, WorkbenchColumn, WorkbenchRow } from "@eduthemes/ui/workbench";
import { Card, CardContent, CardFooter, CardHeader } from "@eduthemes/ui/components/card";
import { Button } from "@eduthemes/ui/components/button";
import { Input } from "@eduthemes/ui/components/input";
import { Label } from "@eduthemes/ui/components/label";
import { Checkbox } from "@eduthemes/ui/components/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@eduthemes/ui/components/table";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuItem } from "@eduthemes/ui/components/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@eduthemes/ui/components/dialog";
const Preview = ({
  sessionId,
  ensureSession,
  analysisSource,
  importSaveAction,
  beforeJob,
  dataset,
  setDataset,
  labels,
  setLabels,
  claudeData,
  svmData,
  setClaudeData,
  setSvmData,
  onAdvanceStage,
  projectMetadata,
  uploadSummary
}) => {
  const [query, setQuery] = useState('');
  const [uncodedOnly, setUncodedOnly] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const codingScroll = useRef(null);
  const searchField = useRef(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [requestLoading, setIsLoading] = useState(false);
  const job = useAnalysisJob(analysisSource, 'classify', saved => {
    setDataset(saved.payload.dataset);
    setLabels(saved.payload.labels);
    setClaudeData(saved.result.claude_data);
    setSvmData(saved.result.svm_data || {});
    onAdvanceStage();
  }, beforeJob);
  const isLoading = requestLoading || job.busy;
  useEffect(() => { if (isLoading) setEditingIndex(null); }, [isLoading]);
  const [suggestedThemes, setSuggestedThemes] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError] = useState(null);
  const [suggestionError, setSuggestionError] = useState(null);
  const getRandomItem = arr => {
    // Generate a random floating-point number between 0 (inclusive) and 1 (exclusive)
    const randomIndex = Math.random();

    // Multiply by the array's length to get a number between 0 and array.length (exclusive)
    const scaledIndex = randomIndex * arr.length;

    // Use Math.floor to round down to the nearest whole number, giving a valid array index
    const floorIndex = Math.floor(scaledIndex);

    // Return the item at the randomly generated index
    return arr[floorIndex];
  };
  const updateTheme = (index, theme, checked) => setDataset(previous => previous.map((entry, position) => position === index ? checked ? addExampleTheme(entry, theme) : removeExampleTheme(entry, theme.name) : entry));
  const focusPicker = index => requestAnimationFrame(() => {
    const triggers = [...(codingScroll.current?.querySelectorAll('.coding-theme-trigger') || [])];
    const next = triggers.find(trigger => Number(trigger.dataset.responseIndex) >= index) || triggers[0] || searchField.current;
    next?.focus();
  });
  const finishEditing = index => {
    setEditingIndex(null);
    if (uncodedOnly && isCodingExample(dataset?.[index])) focusPicker(index);
  };
  const removeTheme = (name, index) => { updateTheme(index, {name}, false); focusPicker(index); };
  const updateNoMatch = (index, checked) => setDataset(previous => previous.map((entry, position) => position === index ? setNoMatchExample(entry, checked) : entry));
  const handleGetSuggestedThemes = async () => {
    if (loadingSuggestions) return;
    setLoadingSuggestions(true);
    setSuggestionError(null);
    try {
      const activeSession = ensureSession ? await ensureSession() : sessionId;
      const response = await axios.post(`${API_URL}/session/${activeSession}/suggest-themes`, {
        labels: labels,
        apiKey: projectMetadata.apiKey
      });
      if (!active.current) return;
      if (Array.isArray(response.data?.suggested_themes)) {
        setSuggestedThemes(response.data.suggested_themes);
      } else {
        setSuggestionError("We couldn't generate theme suggestions. Try again.");
      }
    } catch (error) {
      console.error("Error getting suggested themes:", error.response?.data || error.message);
      if (!active.current) return;
      setSuggestionError(getApiErrorMessage(error, "We couldn't generate theme suggestions."));
    } finally {
      if (active.current) setLoadingSuggestions(false);
    }
  };
  const handleAddSuggestedTheme = theme => {
    const themeExists = labels.some(label => label.name === theme.name);
    if (!themeExists) {
      const COLORS = ['#176b52', '#ff7856', '#d0a72d', '#7a5c99', '#3f7d9d', '#8a6a2f', '#556b5d', '#9a4f61'];
      const color = getRandomItem(COLORS); //Math.floor(Math.random()*16777215).toString(16);

      const newTheme = {
        name: theme.name,
        description: theme.description,
        color: color
      };
      setLabels([...labels, newTheme]);
    }
  };
  const handleReview = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const payload = { dataset, labels, ...projectMetadata };
      if (job.canStart(payload)) {
        await job.start(payload);
        return;
      }
      await beforeJob?.();
      const manualCodings = codingExamples(dataset);
      const activeSession = ensureSession ? await ensureSession() : sessionId;
      const response = await axios.post(`${API_URL}/session/${activeSession}/submit-manual-coding`, {
        labels,
        manual_codings: manualCodings,
        apiKey: projectMetadata.apiKey
      });
      if (!active.current) return;
      setClaudeData(response.data.claude_data);
      setSvmData(response.data.svm_data);
      onAdvanceStage();
    } catch (error) {
      console.error("Error submitting manual coding:", error.response?.data || error.message);
      setError(getApiErrorMessage(error, "We couldn't submit your manual coding."));
    } finally {
      setIsLoading(false);
    }
  };
  const codedCount = codingExamples(dataset).length;
  const totalResponses = dataset?.length || 0;
  const visibleResponses = (dataset || []).map((entry,index) => ({entry,index})).filter(({entry,index}) => String(entry.original || '').toLowerCase().includes(query.trim().toLowerCase()) && (!uncodedOnly || !isCodingExample(entry) || editingIndex === index));
  return <main className="workflow-page workflow-page--wide preview-page">
            <WorkflowHeader currentStep={2} eyebrow="Step 2 · Manual coding" title="Code responses" question={projectMetadata?.researchQuestion} description="Define themes and code examples to begin." actions={importSaveAction} />

            <WorkflowAlert message={error} onClose={() => setError(null)} />

            {uploadSummary && <div className="dataset-summary" role="status" aria-label="Uploaded dataset summary">
                    <strong>{uploadSummary.response_count} {uploadSummary.response_count === 1 ? 'response' : 'responses'} ready</strong>
                    {uploadSummary.response_column && <span>Response column: {uploadSummary.response_column}</span>}
                    {uploadSummary.theme_column && <span>Theme column: {uploadSummary.theme_column}</span>}
                    {uploadSummary.blank_rows_skipped > 0 && <span>{uploadSummary.blank_rows_skipped} blank rows skipped</span>}
                </div>}

            {job.panel}
            {requestLoading && !job.busy && <LoadingSkeleton variant="inline" label="Classifying responses…" />}
            {<fieldset disabled={isLoading} className="study-unframed-fieldset"><WorkbenchRow className="g-4 items-stretch">
                <WorkbenchColumn lg={4} xl={3} className="preview-sidebar">


                    <Card>
                        <CardContent className="card-body">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="mb-0">Define your themes</h2>
                            </div>
                            <p className="study-help">Add themes and definitions, then use them to code example responses.</p><div className="theme-list mt-3">
                            {labels.length > 0 ? <>
                                    {labels.map((label, index) => <div key={index} className="theme-list__item">
                                            <div className="theme-list__dot" style={{
                      backgroundColor: label.color
                    }}></div>
                                            <div>
                                                <div>{label.name.length > 24 ? label.name.substring(0, 24) + '...' : label.name}</div>
                                                {/* {label.description && (
                                                    <small className="text-muted">{label.description.length > 50 ?
                                                        label.description.substring(0, 50) + '...' :
                                                        label.description}
                                                    </small>
                                                 )} */}
                                            </div>
                                        </div>)}
                                </> : <p className="text-muted-foreground small mb-0">Start with “Add themes”, or review AI suggestions before adding them.</p>}
                            </div>
                            <div className="codebook-actions">                                <LabelModal labels={labels || []} setLabels={setLabels} onUpdateLabel={(name, label) => setDataset(previous => previous.map(entry => ({
                  ...entry,
                  themes: (entry.themes || []).map(theme => theme.name === name ? label : theme)
                })))} onDeleteLabel={themeName => setDataset(previous => previous.map(entry => entry.themes?.some(t => t.name === themeName) ? removeExampleTheme(entry, themeName) : entry))} />
                                <Button variant="outline" onClick={() => {
                  setShowSuggestions(true);
                  handleGetSuggestedThemes();
                }} disabled={loadingSuggestions} aria-busy={loadingSuggestions}>
                                    {loadingSuggestions && <Skeleton className="edu-skeleton--button" />}
                                    <FaTags className="mr-2" aria-hidden="true" />
                                    Suggest themes
                                </Button>
              </div>
                        </CardContent>
                    </Card>

                </WorkbenchColumn>

                <WorkbenchColumn lg={8} xl={9} className="preview-main">
                    <Card className="workflow-panel">
                        <CardHeader className="card-header coding-examples-heading"><h2>Code example responses</h2><ContextHelp className="coding-table-help" title="Coding help"><p>Select one or more themes for each example. Choose “No matching theme” when none apply; that is an intentional example, not an uncoded response. Your examples stay fixed when AI codes the remaining responses.</p></ContextHelp></CardHeader>
                        <CardContent id="given_chart" className="card-body">
                            {totalResponses > 0 ? <>
                                <div className="coding-response-toolbar"><Input ref={searchField} aria-label="Search responses" type="search" placeholder="Search responses" value={query} onChange={event => setQuery(event.target.value)} /><Label className="coding-uncoded-filter"><Checkbox checked={uncodedOnly} onChange={event => setUncodedOnly(event.target.checked)} />Uncoded only</Label>{(query || uncodedOnly) && <span className="coding-filter-count" role="status">{visibleResponses.length} of {totalResponses} shown</span>}</div>
                                {visibleResponses.length > 0 ? <div ref={codingScroll} className="coding-response-scroll"><Table className="preview-table coding-response-table" containerClassName="contents">
                                    <TableHeader><TableRow><TableHead className="coding-index-cell"><span className="sr-only">Response number</span><span aria-hidden="true">#</span></TableHead><TableHead>Response</TableHead><TableHead className="coding-themes-heading">Themes</TableHead></TableRow></TableHeader>
                                    <TableBody>{visibleResponses.map(({entry,index}) => {
                                        const themes = entry.themes || [];
                                        const noMatch = entry.coding_complete === true && themes.length === 0;
                                        const actionLabel = isCodingExample(entry) ? 'Edit themes' : 'Assign themes';
                                        return <TableRow key={index}>
                                            <TableCell className="coding-index-cell"><span className="coding-number-prefix">Response </span>{index + 1}</TableCell>
                                            <TableCell className="coding-response-cell"><p>{entry.original}</p>{entry.cleaned?.trim() && entry.cleaned !== entry.original && <details className="coding-processed-text"><summary>Processed text</summary><p>{entry.cleaned}</p></details>}</TableCell>
                                            <TableCell className="coding-theme-cell"><div className="coding-theme-controls">
                                                {themes.map(theme => <Button key={theme.name} type="button" className="coding-theme-tag" style={{'--theme-color':theme.color || 'var(--primary)'}} aria-label={`Remove ${theme.name} from response ${index + 1}`} title={`Remove ${theme.name}`} onClick={() => removeTheme(theme.name,index)} variant="secondary" size="auto"><span className="coding-theme-dot" aria-hidden="true" />{theme.name}<LuX aria-hidden="true" /></Button>)}
                                                {noMatch && <Button type="button" className="coding-theme-tag coding-no-match" aria-label={`Clear no-match coding for response ${index + 1}`} onClick={() => {updateNoMatch(index,false);focusPicker(index);}} variant="secondary" size="auto">No matching theme<LuX aria-hidden="true" /></Button>}
                                                <DropdownMenu open={editingIndex === index && !isLoading} onOpenChange={open => setEditingIndex(open ? index : null)}><DropdownMenuTrigger asChild><Button type="button" className="coding-theme-trigger" data-response-index={index} aria-label={`${actionLabel} for response ${index + 1}`} disabled={isLoading} variant="outline" size="auto">{actionLabel}<LuChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" sideOffset={8} collisionPadding={12} className="coding-theme-menu" onEscapeKeyDown={() => finishEditing(index)}>
                                                        <DropdownMenuLabel>Select one or more themes</DropdownMenuLabel>
                                                        {labels.length ? labels.map(theme => <DropdownMenuCheckboxItem key={theme.name} checked={themes.some(assigned => assigned.name === theme.name)} disabled={isLoading} title={theme.description} textValue={theme.name} onSelect={event => event.preventDefault()} onCheckedChange={checked => updateTheme(index,theme,checked)}><span className="coding-theme-dot" style={{'--theme-color':theme.color || 'var(--primary)'}} aria-hidden="true" />{theme.name}</DropdownMenuCheckboxItem>) : <DropdownMenuLabel className="text-muted-foreground">Add themes in the codebook first.</DropdownMenuLabel>}
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuCheckboxItem checked={noMatch} disabled={isLoading} onSelect={event => event.preventDefault()} onCheckedChange={checked => updateNoMatch(index,checked)}>No matching theme</DropdownMenuCheckboxItem>
                                                        <DropdownMenuSeparator /><DropdownMenuItem className="coding-picker-done" onSelect={() => finishEditing(index)}>Done</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div></TableCell>
                                        </TableRow>;
                                    })}</TableBody>
                                </Table></div> : <div className="coding-filter-empty"><p>{uncodedOnly && codedCount === totalResponses ? 'All responses are coded.' : 'No responses match these filters.'}</p><Button type="button" variant="outline" size="auto" onClick={() => {setQuery('');setUncodedOnly(false);}}>Show all responses</Button></div>}
                            </> : <p className="workflow-empty">No responses available. Import a file or return to the study’s responses.</p>}
                        </CardContent>
                        <CardFooter className="workflow-action-bar card-footer"><div><strong>{codedCount} of {totalResponses} {totalResponses === 1 ? 'response' : 'responses'} coded as examples</strong><p id="coding-next-step" className="study-help">{!labels.length ? 'Add at least one theme to begin.' : !codedCount ? 'Assign themes or choose “No matching theme” for an example.' : codedCount === totalResponses ? 'All responses are coded. Continue to review your assignments.' : 'AI codes the remaining responses. Your examples stay fixed.'}</p></div><div className="workflow-action-bar__action"><Button onClick={handleReview} aria-busy={isLoading} disabled={labels.length === 0 || codedCount === 0 || !sessionId || isLoading} aria-describedby="coding-next-step">
                            {isLoading ? <><Skeleton className="edu-skeleton--button" />Preparing review…</> : <>{codedCount === totalResponses ? 'Review coded responses' : 'Classify responses'}<FaArrowRight aria-hidden="true" /></>}
                        </Button></div></CardFooter>
                    </Card>
                </WorkbenchColumn>
            </WorkbenchRow></fieldset>}

            <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}><DialogContent className="theme-suggestions-dialog" overlayClassName="theme-suggestions-overlay">
                <DialogHeader>
                    <DialogTitle>Theme suggestions</DialogTitle>
                </DialogHeader>
                <div className="theme-suggestions-body">
                    {suggestionError && <Notice variant="danger" role="alert" className="theme-suggestions-error">
                            {suggestionError}
                        </Notice>}
                    {loadingSuggestions && (suggestedThemes.length > 0
                        ? <LoadingSkeleton variant="inline" label="Generating new suggestions…" />
                        : <LoadingSkeleton variant="suggestions" rows={2} className="theme-suggestions-loading" label="Generating theme suggestions…" />)}
                    {suggestedThemes.length > 0 ? <>
                        <p className="theme-suggestions-summary">{suggestedThemes.length} {suggestedThemes.length === 1 ? 'suggestion' : 'suggestions'} · Add the themes you want to use.</p>
                        <ul className="theme-suggestions-list" aria-label="Suggested themes">
                            {suggestedThemes.map((theme, index) => {
              const alreadyAdded = labels.some(l => l.name === theme.name);
              return <li key={index} className="theme-suggestion-row">
                                        <div>
                                            <h3>{theme.name}</h3>
                                            {theme.description && <p>{theme.description}</p>}
                                        </div>
                                        <Button variant="outline" size="auto" aria-label={alreadyAdded ? `${theme.name} added` : `Add ${theme.name} to codebook`} onClick={() => handleAddSuggestedTheme(theme)} disabled={alreadyAdded}>
                                            {alreadyAdded ? 'Added' : 'Add theme'}
                                        </Button>
                                    </li>;
            })}
                        </ul></> : !loadingSuggestions && <div className="theme-suggestions-empty">
                            {!suggestionError && <p>No suggestions found. Try again or add themes in the codebook.</p>}
                            <Button size="auto" onClick={handleGetSuggestedThemes} disabled={!sessionId || dataset?.length === 0}>Try again</Button>
                        </div>}
                </div>
                {suggestedThemes.length > 0 && <DialogFooter className="theme-suggestions-actions">
                    <Button variant="outline" size="auto" onClick={handleGetSuggestedThemes} disabled={loadingSuggestions || !sessionId || dataset?.length === 0} aria-busy={loadingSuggestions}>
                        {loadingSuggestions ? <><Skeleton className="edu-skeleton--button" />Generating…</> : suggestionError ? 'Try again' : 'Generate again'}
                    </Button>
                    <Button size="auto" onClick={() => setShowSuggestions(false)}>Done</Button>
                </DialogFooter>}
            </DialogContent></Dialog>
        </main>;
};
export default Preview;
