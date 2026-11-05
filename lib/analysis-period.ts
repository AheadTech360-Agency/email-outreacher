export function localDate(value=new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`
}
export function analysisPeriod(preset:string,from:string,to:string,now=new Date()) {
  let start = new Date(now.getFullYear(),now.getMonth(),now.getDate()), end = new Date(now)
  if (preset==="24h") start=new Date(now.getTime()-86400000)
  else if (preset==="yesterday") {end=new Date(start);start.setDate(start.getDate()-1)}
  else if (preset==="7") start.setDate(start.getDate()-6)
  else if (preset==="30") start.setDate(start.getDate()-29)
  else if (preset==="month") start=new Date(now.getFullYear(),now.getMonth(),1)
  else if (preset==="last_month") {end=new Date(now.getFullYear(),now.getMonth(),1);start=new Date(now.getFullYear(),now.getMonth()-1,1)}
  else if (preset==="custom") {start=new Date(`${from}T00:00:00`);end=new Date(`${to}T00:00:00`);end.setDate(end.getDate()+1)}
  const valid = (preset!=="custom" || to<=localDate(now)) && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && start<end && start<now && end.getTime()-start.getTime()<=366*86400000
  const key=preset==="month"?`month:${localDate(start)}`:preset==="24h"?`24h:${localDate(now)}`:preset==="custom"?`custom:${from}:${to}`:`${preset}:${localDate(start)}:${preset==="last_month"?localDate(end):localDate(now)}`
  return {valid,start:valid?start.toISOString():"",end:valid?end.toISOString():"",key,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}
}
