import { supabase } from '../supabase';

export function fileStudyTitle(filename) {
  return String(filename || '').replace(/\.(csv|xlsx?)$/i, '').trim().slice(0, 160) || 'Imported responses';
}

export async function saveFileStudy({ importId, title, metadata, dataset, labels, stage, classifications, results, uploadSummary }) {
  const { data, error } = await supabase.rpc('save_file_study', {
    p_import_id: importId,
    p_title: title,
    p_question: metadata.researchQuestion,
    p_description: metadata.projectDescription || '',
    p_context: metadata.additionalContext || '',
    p_analysis: {
      coded_responses: dataset,
      labels,
      stage,
      classifications,
      results,
      import_metadata: uploadSummary
    }
  });
  if (error) throw error;
  if (!data) throw new Error('The imported study could not be saved.');
  return data;
}
