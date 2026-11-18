import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LuArrowRight, LuDownload, LuFileText } from 'react-icons/lu';
import { researchBrief } from '../utils/researchQuality';
import { supabase } from '../supabase';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { findingsEntries, findingsUrl } from '../utils/studyWorkflow';
import { Button } from "@eduthemes/ui/components/button";
import { Card } from "@eduthemes/ui/components/card";
import { Label } from "@eduthemes/ui/components/label";
import { Checkbox } from "@eduthemes/ui/components/checkbox";
import { Badge } from "@eduthemes/ui/components/badge";

const savedDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function StudyFindings({
  study,
  snapshot,
  view,
  work,
  refreshing,
  onSelect
}) {
  const [history, setHistory] = useState(false);
  const [reviews, setReviews] = useState({});
  const [refreshingReviews, setRefreshingReviews] = useState(false);
  const all = findingsEntries(work);
  const signature = all.map(({ question, key }) => `${question.id}:${key}`).join('|');
  useEffect(() => {
    if (refreshing) return;
    let active = true;
    setRefreshingReviews(true);
    (async () => {
      const records = await Promise.all(all.map(async ({ question, key }) => {
        let review;
        try {
          const { data, error } = await supabase.rpc('get_study_run_review', {
            p_study_id: study.id,
            p_version_id: view,
            p_question_id: question.id,
            p_run_key: key
          });
          review = error || !data ? { error: true } : data;
        } catch {
          review = { error: true };
        }
        return [`${question.id}:${key}`, review];
      }));
      if (active) {
        setReviews(Object.fromEntries(records));
        setRefreshingReviews(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [study.id, view, signature, refreshing]);
  const latest = all.filter(entry => entry.index === 0);
  const entries = history ? all : latest;
  const checkingReviews = refreshing || refreshingReviews || entries.some(({ question, key }) => !reviews[`${question.id}:${key}`]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([[`# ${snapshot.title} — research report`, entries.every(({
      question,
      key
    }) => reviews[`${question.id}:${key}`]?.current && reviews[`${question.id}:${key}`]?.review?.status === 'approved') ? 'All included runs reviewed.' : 'DRAFT — one or more included runs require review.', ...entries.map(({
      question,
      run,
      key
    }) => researchBrief(snapshot, question, run, reviews[`${question.id}:${key}`]))].join('\n\n---\n\n')], {
      type: 'text/markdown;charset=utf-8'
    }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${study.share_code}-v${snapshot.version_number || 'draft'}-findings.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return <section className="study-findings-library" aria-labelledby="study-findings-heading">
    <div className="findings-library-header">
      <h2 id="study-findings-heading">Saved findings</h2>
      {all.length > latest.length && <Label className="study-check-choice">
        <Checkbox checked={history} onCheckedChange={setHistory} />Include earlier runs
      </Label>}
    </div>
    {!all.length && refreshing ? <LoadingSkeleton variant="results" label="Checking saved findings for this study version…" /> : !all.length ? <Card className="study-panel study-flow-empty" as="div"><span className="study-stage-icon"><LuFileText aria-hidden="true" /></span><h3>Your findings will live here</h3><p>Finish an analysis to save findings here.</p><Button className="study-primary" onClick={() => onSelect(work.some(item => item.count) ? 'analysis' : snapshot.isDraft ? 'design' : 'collect')} variant="default" size="auto">{work.some(item => item.count) ? 'Open analysis' : snapshot.isDraft ? 'Continue study design' : 'Open collection'}<LuArrowRight aria-hidden="true" /></Button></Card> : <>
      <ul className="findings-run-list" role="list" aria-label="Saved analysis runs">
        {entries.map(({ question, run, index, key }) => {
          const review = reviews[`${question.id}:${key}`];
          const reviewed = review?.current && review.review?.status === 'approved';
          const status = review?.error ? 'Review unavailable' : reviewed ? 'Reviewed' : 'Review required';
          const responseCount = run.response_count || 0;
          const updatedAt = run.updated_at ? new Date(run.updated_at) : null;
          return <li className="findings-run-row" key={`${question.id}:${key}`}>
            <div className="findings-run-info">
              <h3>{question.prompt}</h3>
              <div className="findings-run-meta">
                {index > 0 && <span>Earlier run</span>}
                <span>{responseCount} {responseCount === 1 ? 'response' : 'responses'}</span>
                {updatedAt && !Number.isNaN(updatedAt.getTime()) && <time dateTime={updatedAt.toISOString()}>{savedDate.format(updatedAt)}</time>}
              </div>
            </div>
            <div className="findings-run-actions">
              {review ? <Badge variant="outline" data-reviewed={reviewed || undefined}>{status}</Badge>
                : <LoadingSkeleton variant="count" label="Checking review status" />}
              <Button asChild variant="outline" size="sm">
                <Link to={findingsUrl(study.id, view, question.id, key)} aria-label={`Open findings for ${question.prompt}${index > 0 ? `, earlier run ${index}` : ''}`}>Open findings</Link>
              </Button>
            </div>
          </li>;
        })}
      </ul>
      <div className="findings-library-export">
        <Button type="button" disabled={checkingReviews} aria-busy={checkingReviews} onClick={download} variant="ghost" size="auto">
          {checkingReviews ? <Skeleton className="edu-skeleton--button" /> : <LuDownload aria-hidden="true" />}
          Download findings report
        </Button>
      </div>
    </>}
  </section>;
}
