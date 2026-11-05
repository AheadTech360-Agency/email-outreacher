"use client"
import Link from "next/link"
import {useState} from "react"
import {BarChart3,History,Loader2,RefreshCw,Sparkles} from "lucide-react"
import {toast} from "sonner"
import {WorkspaceGate,BackendError} from "@/components/companies/backend-state"
import {ManagerOnly} from "@/components/manager-only"
import {PageHeader} from "@/components/page-header"
import {EmptyState} from "@/components/empty-state"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select"
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs"
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from "@/components/ui/table"
import {fetchAnalysisReports,fetchAnalysisReport,refreshAnalysis,useApi,type AnalysisReport,type AnalysisMeta} from "@/lib/api"
import {analysisPeriod,localDate} from "@/lib/analysis-period"
import {useStore} from "@/lib/store"

const dateTime=(value:string,timezone?:string)=>{
  try{return new Date(value).toLocaleString(undefined,timezone?{timeZone:timezone}:undefined)}
  catch{return new Date(value).toLocaleString()}
}
const rangeLabel=(report:AnalysisMeta)=>`${dateTime(report.start,report.filters.timezone)} - ${dateTime(report.end,report.filters.timezone)}`
const percent=(value:number|null)=>value===null?"Not available":`${value.toFixed(1)}%`
export function AnalysisView(){return <><PageHeader title="Analysis" description="Smart analysis of email copy, hooks and sources, backed by recorded outcomes and saved snapshots."/><div className="space-y-4 px-4 pb-10 md:px-8"><WorkspaceGate>{(workspaceId)=><Analysis key={workspaceId} workspaceId={workspaceId}/>}</WorkspaceGate></div></>}
function Analysis({workspaceId}:{workspaceId:string}){
  const {icps}=useStore()
  const [preset,setPreset]=useState("month"),[from,setFrom]=useState(localDate()),[to,setTo]=useState(localDate()),[icpId,setIcpId]=useState("all")
  const [offset,setOffset]=useState(0),[tab,setTab]=useState("smart"),[selectedId,setSelectedId]=useState("")
  const [fresh,setFresh]=useState<AnalysisReport|null>(null),[running,setRunning]=useState(false),[progress,setProgress]=useState("")
  const history=useApi(()=>fetchAnalysisReports(workspaceId,offset),[workspaceId,offset])
  const period=analysisPeriod(preset,from,to)
  const matching=(history.data?.items??[]).find((report)=>report.filters.periodKey===period.key && report.filters.icpId===(icpId==="all"?null:icpId))
  const reportId=selectedId || matching?.id || ""
  const changeFilters=()=>{setSelectedId("");setFresh(null)}
  const run=async()=>{
    if(!period.valid || running)return
    setRunning(true);setProgress("Starting smart analysis...")
    try{
      const report=await refreshAnalysis(workspaceId,{start:period.start,end:period.end,periodKey:period.key,timezone:period.timezone,icpId:icpId==="all"?null:icpId},(job)=>setProgress(job.step||job.label))
      setFresh(report);setSelectedId(report.id);setOffset(0);history.reload();setTab("smart")
      toast.success(report.status==="complete"?"Analysis saved":"Metrics snapshot saved")
    }catch(e){toast.error("Could not refresh analysis",{description:e instanceof Error?e.message:undefined})}
    finally{setRunning(false);setProgress("")}
  }
  return <div className="space-y-4">
    <section className="space-y-3 rounded-lg border p-4"><fieldset disabled={running} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1"><Label>Period</Label><Select value={preset} onValueChange={(value)=>{setPreset(value);changeFilters()}}><SelectTrigger aria-label="Analysis period" className="w-44"><SelectValue/></SelectTrigger><SelectContent>{[["today","Today"],["24h","Last 24 hours"],["yesterday","Yesterday"],["7","Last 7 days"],["30","Last 30 days"],["month","This month"],["last_month","Last month"],["custom","Custom dates"]].map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      {preset==="custom" && <><div className="space-y-1"><Label htmlFor="analysis-from">From</Label><Input id="analysis-from" type="date" value={from} max={localDate()} onChange={(e)=>{setFrom(e.target.value);changeFilters()}}/></div><div className="space-y-1"><Label htmlFor="analysis-to">Through</Label><Input id="analysis-to" type="date" value={to} max={localDate()} onChange={(e)=>{setTo(e.target.value);changeFilters()}}/></div></>}
      <div className="space-y-1"><Label>ICP</Label><Select value={icpId} onValueChange={(value)=>{setIcpId(value);changeFilters()}}><SelectTrigger aria-label="Analysis ICP" className="w-52"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All ICPs</SelectItem>{icps.map((icp)=><SelectItem key={icp.id} value={icp.id}>{icp.name}</SelectItem>)}</SelectContent></Select></div>
      <ManagerOnly><Button type="button" disabled={running||!period.valid} onClick={()=>void run()}>{running?<Loader2 className="animate-spin"/>:<RefreshCw/>} Refresh analysis</Button></ManagerOnly>
    </fieldset><p className="text-xs text-muted-foreground">Dates use <span suppressHydrationWarning>{period.timezone}</span>. Refresh creates a new database snapshot and may incur AI usage. Opening reports or changing filters does not call AI. Management/admins can refresh; workspace members can read saved reports.</p>
      {!period.valid && <p role="alert" className="text-sm text-destructive">Choose a valid period of up to 366 days ending today or earlier.</p>}
      {running && <p role="status" className="text-sm">{progress}</p>}
    </section>
    <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="smart"><Sparkles className="mr-1 size-4"/>Smart analysis</TabsTrigger><TabsTrigger value="history"><History className="mr-1 size-4"/>Saved reports</TabsTrigger></TabsList>
      <TabsContent value="smart" className="space-y-4 pt-3">
        {reportId?<Report key={reportId} workspaceId={workspaceId} id={reportId} initial={fresh?.id===reportId?fresh:null}/>:history.loading?<p className="text-sm text-muted-foreground">Loading saved reports...</p>:history.error?<BackendError message={history.error} onRetry={history.reload}/>:<EmptyState icon={BarChart3} title="No saved analysis for these filters" description="Refresh analysis to create a report, or choose an older snapshot from Saved reports. No AI runs automatically."/>}
      </TabsContent>
      <TabsContent value="history" className="space-y-3 pt-3"><div className="flex items-center gap-2"><p className="mr-auto text-sm text-muted-foreground">{history.data?.total??0} snapshots in this workspace</p><Button variant="outline" size="sm" onClick={history.reload}>Reload history</Button></div>
        {history.error && <BackendError message={history.error} onRetry={history.reload}/>}
        {(history.data?.items??[]).map((report)=><button key={report.id} className="block w-full space-y-1 rounded-lg border p-4 text-left hover:bg-muted/40" onClick={()=>{setSelectedId(report.id);setTab("smart")}}><p className="text-sm font-medium">{rangeLabel(report)}</p><p className="text-xs text-muted-foreground">Saved {dateTime(report.createdAt)} | {report.filters.icpId?icps.find((i)=>i.id===report.filters.icpId)?.name??"ICP":"All ICPs"} | {report.status==="complete"?"AI report":"Metrics snapshot"}</p><p className="line-clamp-2 text-sm">{report.summary}</p></button>)}
        {!history.loading && !history.data?.total && !history.error && <p className="text-sm text-muted-foreground">No reports saved yet.</p>}
        <div className="flex items-center justify-end gap-2"><Button size="sm" variant="outline" disabled={!offset||history.loading} onClick={()=>setOffset(Math.max(0,offset-50))}>Newer</Button><span className="text-xs">Page {Math.floor(offset/50)+1}</span><Button size="sm" variant="outline" disabled={history.loading||offset+50>=(history.data?.total??0)} onClick={()=>setOffset(offset+50)}>Older</Button></div>
      </TabsContent>
    </Tabs>
  </div>
}
function Report({workspaceId,id,initial}:{workspaceId:string;id:string;initial:AnalysisReport|null}){
  const {icps}=useStore()
  const loaded=useApi(()=>fetchAnalysisReport(workspaceId,id),[workspaceId,id])
  const report=loaded.data??initial
  const [dimension,setDimension]=useState("sources")
  const [examplesOpen,setExamplesOpen]=useState(false)
  if(!report)return loaded.error?<BackendError message={loaded.error} onRetry={loaded.reload}/>:<p className="text-sm text-muted-foreground">Loading snapshot...</p>
  const data=report.payload,metrics=data.metrics,previous=data.previous
  const points=metrics.replyRate!==null&&previous.replyRate!==null?metrics.replyRate-previous.replyRate:null
  return <div className="space-y-5">
    <section className="space-y-2 rounded-lg border bg-muted/20 p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="mr-auto font-semibold">Saved analysis snapshot</h2>{data.prompt && <Link className="text-xs underline" href={`/prompts/${data.prompt.id}`} target="_blank" rel="noreferrer">Analyst prompt v{data.prompt.version}</Link>}</div><p className="text-sm">{rangeLabel(report)}</p><p className="text-xs text-muted-foreground">Generated {dateTime(report.createdAt)} | Date selection: {report.filters.timezone} | AI cost ${data.costUsd.toFixed(4)}. The filters above create a new report; this snapshot retains its original dates.</p>{data.error && <p role="alert" className="text-sm text-destructive">{data.error}</p>}</section>
    {(data.coverage.currentCapped || data.coverage.previousCapped) && <p role="status" className="rounded border p-3 text-sm">This report reached the 10,000-record cohort limit. Metrics cover the earliest 10,000 first-email records per affected period. Choose a narrower period or ICP for full coverage.</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Sent recipients",metrics.recipients],["Recipients who replied",metrics.replied],["Sequence reply rate",percent(metrics.replyRate)],["Bounced / unsubscribed",`${metrics.bounced} / ${metrics.unsubscribed}`]].map(([label,value])=><section key={label} className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></section>)}</div>
    <WhatWorked report={report} icpName={(id)=>icps.find((icp)=>icp.id===id)?.name??id}/>
    <p className="text-xs text-muted-foreground">Previous equal-duration window ({dateTime(previous.start,report.filters.timezone)} - {dateTime(previous.end,report.filters.timezone)}): {previous.replied}/{previous.recipients} recipients replied ({percent(previous.replyRate)}). {points!==null?`Difference: ${points>=0?"+":""}${points.toFixed(1)} percentage points. This is observational, not proof of improvement.`:"Not enough data for a rate comparison."}</p>
    <section className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Senior analyst summary</h2><p className="whitespace-pre-wrap text-sm leading-6">{data.narrative.summary}</p></section>
    {data.narrative.findings.map((finding,index)=><section key={index} className="space-y-2 rounded-lg border p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto font-medium">{finding.title}</h3><span className="rounded bg-muted px-2 py-1 text-xs">{finding.category} | {finding.confidence} confidence</span></div><p className="text-sm">{finding.observation}</p><p className="text-sm text-muted-foreground"><strong>Evidence:</strong> {finding.evidence}</p><p className="text-sm"><strong>Next step:</strong> {finding.recommendation}</p><div className="flex flex-wrap gap-2">{finding.exampleEmailIds.map((emailId)=><a key={emailId} className="text-xs underline" href={`#analysis-example-${emailId}`} onClick={()=>setExamplesOpen(true)}>View supporting email</a>)}</div></section>)}
    <section className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-center gap-3"><h2 className="mr-auto font-semibold">Recorded performance breakdown</h2><Select value={dimension} onValueChange={setDimension}><SelectTrigger className="w-52" aria-label="Performance breakdown"><SelectValue/></SelectTrigger><SelectContent>{[["sources","Hook source"],["emailLength","Email length"],["subjectLength","Subject length"],["hooks","Hook coverage"],["icps","ICP"],["prompts","Email prompt version"]].filter(([value])=>data.groups[value]).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Group</TableHead><TableHead>Recipients</TableHead><TableHead>Replies</TableHead><TableHead>Reply rate</TableHead><TableHead>Bounces</TableHead><TableHead>Review good / bad</TableHead></TableRow></TableHeader><TableBody>{(data.groups[dimension]??[]).map((row)=><TableRow key={row.label}><TableCell><p>{dimension==="icps"?icps.find((icp)=>icp.id===row.label)?.name??row.label:row.label}</p>{row.recipients<20 && <span className="text-xs text-muted-foreground">Small sample</span>}</TableCell><TableCell>{row.recipients}</TableCell><TableCell>{row.replied}</TableCell><TableCell><p className="tabular-nums">{percent(row.replyRate)}</p><div className="mt-1 h-1.5 w-24 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{width:`${row.replyRate??0}%`}}/></div></TableCell><TableCell>{row.bounced}</TableCell><TableCell>{row.ratedGood} / {row.ratedBad}</TableCell></TableRow>)}</TableBody></Table></div>
      {!metrics.recipients && <p className="text-sm text-muted-foreground">No recorded sent-recipient cohort in this range.</p>}
    </section>
    {!!data.narrative.experiments.length && <section className="space-y-2 rounded-lg border p-4"><h2 className="font-semibold">Recommended experiments</h2><ul className="list-disc space-y-2 pl-5 text-sm">{data.narrative.experiments.map((value,index)=><li key={index}>{value}</li>)}</ul></section>}
    <details open={examplesOpen} onToggle={(e)=>setExamplesOpen(e.currentTarget.open)} className="space-y-3 rounded-lg border p-4"><summary className="cursor-pointer font-medium">Emails analysed ({data.examples.length})</summary><p className="text-xs text-muted-foreground">Every sent first email in the period (up to 400), replies first. Bodies are shortened. A reply is a sequence outcome, not proof this copy or hook caused it.</p>{data.examples.map((example)=><article id={`analysis-example-${example.emailId}`} key={example.emailId} className="scroll-mt-6 space-y-2 rounded border p-3"><h3 className="text-sm font-medium">{example.subject}</h3><p className="text-xs text-muted-foreground">{example.source} | {example.replied?"Sequence reply recorded":"No reply recorded by cutoff"} | {example.prompt}</p>{example.hook && <p className="text-sm"><strong>Hook:</strong> {example.hook}</p>}<p className="whitespace-pre-wrap text-sm">{example.body}</p></article>)}</details>
    <details className="space-y-2 rounded-lg border p-4"><summary className="cursor-pointer font-medium">Method, coverage and limitations</summary><p className="text-sm">{data.method}</p><p className="text-sm">Separate creation activity: {data.activity.drafted} first emails drafted; {data.activity.approved} approved and {data.activity.queued} queued by cutoff. {data.activity.awaiting_review} are awaiting review now. These are not the sent-recipient denominator.</p><ul className="list-disc space-y-2 pl-5 text-sm">{[...data.limitations,...data.narrative.limitations].map((value,index)=><li key={index}>{value}</li>)}</ul></details>
  </div>
}

// Plain answers first: the group that got the most replies in each breakdown, and which email the replies came
// after. Counted from the saved snapshot, no AI. A group needs 5 sent emails to count, so one lucky reply isn't a winner.
const WINNER_DIMENSIONS: [string, string][] = [["sources", "Hook from"], ["emailLength", "Email length"], ["subjectLength", "Subject"], ["prompts", "Email prompt"], ["icps", "ICP"]]
const MIN_SENT = 5
function WhatWorked({report,icpName}:{report:AnalysisReport;icpName:(id:string)=>string}){
  const data=report.payload
  const replies=(data as {repliesByEmail?:{label:string;replies:number}[]}).repliesByEmail??[]
  const totalReplies=replies.reduce((sum,r)=>sum+r.replies,0)
  const winners=WINNER_DIMENSIONS.flatMap(([key,label])=>{
    const rows=(data.groups[key]??[]).filter((r)=>r.recipients>=MIN_SENT&&r.replyRate!==null)
    if(rows.length<2)return []
    const best=[...rows].sort((a,b)=>(b.replyRate??0)-(a.replyRate??0))[0]
    if(!best.replied)return []
    return [{label,value:key==="icps"?icpName(best.label):best.label,detail:`${best.replied} of ${best.recipients} replied (${percent(best.replyRate)})`}]
  })
  if(!data.metrics.recipients)return <section className="rounded-lg border p-4"><h2 className="font-semibold">What worked</h2><p className="mt-1 text-sm text-muted-foreground">Nothing has been sent in this period yet, so there are no replies to learn from. Once emails go out, this shows which hooks, email styles and follow-ups get replies.</p></section>
  return <section className="space-y-3 rounded-lg border p-4">
    <h2 className="font-semibold">What worked</h2>
    {winners.length?<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{winners.map((w)=><li key={w.label} className="rounded-md bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{w.label}</p><p className="font-medium">{w.value}</p><p className="text-xs text-muted-foreground tabular-nums">{w.detail}</p></li>)}</ul>
      :<p className="text-sm text-muted-foreground">Not enough replies yet to compare: each group needs at least {MIN_SENT} sent emails and a reply.</p>}
    {totalReplies>0&&<div className="space-y-1.5"><p className="text-xs text-muted-foreground">Which email got the reply</p><div className="flex flex-wrap gap-2">{replies.map((r)=><span key={r.label} className="rounded-md border px-2.5 py-1 text-sm tabular-nums">{r.label}: <strong>{r.replies}</strong></span>)}</div></div>}
    <p className="text-xs text-muted-foreground">Replies only: CheapSequencer doesn&apos;t track opens. The AI findings below explain why these worked and what to try next.</p>
  </section>
}
