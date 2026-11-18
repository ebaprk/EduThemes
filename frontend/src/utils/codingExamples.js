export const isCodingExample = entry => Boolean(entry?.coding_complete || entry?.themes?.length);
export const codingExamples = dataset => (dataset || []).flatMap((entry,index) =>
  isCodingExample(entry) ? [{index,themes:(entry.themes || []).filter(theme=>theme.name!=='Unclassified')}] : []);
export const addExampleTheme = (entry,theme) => ({
  ...entry, coding_complete:true,
  themes:entry.themes?.some(item=>item.name===theme.name) ? entry.themes : [...(entry.themes || []).filter(item=>item.name!=='Unclassified'),theme],
});
export function removeExampleTheme(entry,name) {
  const themes=(entry.themes || []).filter(theme=>theme.name!==name);
  return {...entry,themes,coding_complete:themes.length>0};
}
export const setNoMatchExample = (entry,checked) => ({...entry,themes:[],coding_complete:checked});
