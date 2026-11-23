import { FeatureHelp } from '@eduthemes/ui/components/feature-help';
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@eduthemes/ui/components/tabs';
import { ContextHelp } from '@eduthemes/ui/workbench';
import StudyRecruitment from './StudyRecruitment';
import StudyOperations from './StudyOperations';

export default function StudyParticipants({ study, snapshot, role, onSelect }) {
  const [tab, setTab] = useState('applications');
  const [operationsRefresh, setOperationsRefresh] = useState(0);
  return <section className="study-participants" aria-labelledby="participants-heading">
    <div className="participants-page-title"><h2 id="participants-heading">Participants</h2><span>All published versions</span></div>
    <Tabs value={tab} onValueChange={setTab} className="participant-management-tabs">
      <TabsList aria-label="Participant management"><TabsTrigger value="applications">Applications</TabsTrigger><TabsTrigger value="enrollments">Enrollments</TabsTrigger></TabsList>
      <TabsContent value="applications" forceMount><FeatureHelp guide="screen-and-recruit#review-applicants" label="Help with applications and invitations" /><StudyRecruitment study={study} role={role}
        screeningEnabled={Boolean(snapshot?.recruitment?.enabled)} onOpenResponses={() => onSelect('collect')}
        onRefreshed={() => setOperationsRefresh(value => value + 1)} /></TabsContent>
      <TabsContent value="enrollments" forceMount><FeatureHelp guide="participant-operations" label="Help with enrollments and completion" /><StudyOperations study={study} role={role}
        refreshSignal={operationsRefresh} onOpenResponses={() => onSelect('collect')} /></TabsContent>
    </Tabs>
    <ContextHelp title="About participant records"><p>Applications and enrollments include published study versions. Each record keeps its original version.</p><p>Application stages count applications; enrollment totals count enrollments. Neither deduplicates people across studies. Invitations enable joining in the private study hub and do not send email.</p></ContextHelp>
  </section>;
}
