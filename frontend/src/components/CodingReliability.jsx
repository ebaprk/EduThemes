import React, { useState } from 'react';
import { codingReliability, codingReliabilityPairs } from '../utils/collaborativeCoding';
import { Label } from "@eduthemes/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@eduthemes/ui/components/table";
export default function CodingReliability({
  context
}) {
  const pairs = codingReliabilityPairs(context),
    [selected, setSelected] = useState('');
  const pair = pairs.find(ids => JSON.stringify(ids) === selected) || pairs[0];
  const result = codingReliability(context, pair);
  if (!result) return <section className="coding-reliability"><h3>Cohen’s kappa</h3><p>Two submitted coders are needed. Compare their independent choices on shared responses before resolving disagreements.</p></section>;
  return <section className="coding-reliability" aria-labelledby="coding-reliability-heading">
    <h3 id="coding-reliability-heading">Cohen’s kappa by theme</h3>
    <p>Compare two human coders on the same responses. These coefficients use their original submitted choices before adjudication.</p>
    <div className="study-field"><Label htmlFor="reliability-pair">Coder pair</Label><NativeSelect id="reliability-pair" value={JSON.stringify(pair)} onChange={event => setSelected(event.target.value)}>{pairs.map(ids => <NativeSelectOption key={JSON.stringify(ids)} value={JSON.stringify(ids)}>{ids.map(id => `Coder ${context.assignments.findIndex(a => a.coder_id === id) + 1}: ${context.assignments.find(a => a.coder_id === id)?.label || 'Team member'}`).join(' and ')}</NativeSelectOption>)}</NativeSelect></div>
    <p><strong>{result.shared} shared responses</strong>. Missing coding is excluded; an explicit no-match choice counts as excluding every theme.</p>
    {result.shared ? <div className="coding-reliability-table"><Table containerClassName="contents"><TableCaption>Original coding agreement and theme inclusion frequencies</TableCaption><TableHeader><TableRow><TableHead scope="col">Theme</TableHead><TableHead scope="col">Kappa</TableHead><TableHead scope="col">Observed agreement</TableHead>{result.coders.map(c => <TableHead scope="col" key={c.id}>{c.label} includes</TableHead>)}</TableRow></TableHeader><TableBody>{result.themes.map(t => <TableRow key={t.name}><TableHead scope="row">{t.name}</TableHead><TableCell>{t.kappa === null ? <span>Not calculated<small>{t.unavailable}</small></span> : t.kappa.toFixed(3)}</TableCell><TableCell>{t.matches}/{t.n} ({(100 * t.observed).toFixed(1)}%)</TableCell><TableCell>{t.firstIncluded}/{t.n}</TableCell><TableCell>{t.secondIncluded}/{t.n}</TableCell></TableRow>)}</TableBody></Table></div> : <p>No shared responses are available for this pair. Assign overlapping responses in a new independent coding round to measure reliability.</p>}
    <details><summary>How to interpret this comparison</summary><p>Each theme is treated as an include/exclude decision. Kappa adjusts observed agreement using both coders’ theme frequencies. A constant identical decision makes kappa undefined; it is not reported as zero or one. With more than two coders, each pair stays separate.</p><p>These scores describe coding consistency, not the accuracy of AI or the quality of every qualitative interpretation. A reliability workflow should match the study’s stated method. The downloadable report includes every eligible pair.</p></details>
  </section>;
}
