'use client'
import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { ArrowUpRight, BriefcaseBusiness, ChevronRight, CircleCheck, Clock3, FileUp, Flame, MessageSquare, Search, Sparkles, Users, X } from 'lucide-react'

type Connection={first:string;last:string;url:string;company:string;position:string;connected:string}
type Message={from:string;sender:string;to:string;recipient:string;date:string;content:string;folder:string}
type Job={company:string;title:string;location?:string;url?:string;posted?:string}
const sampleJobs:Job[]=[
 {company:'Stable Money',title:'Product Manager',location:'Bengaluru',posted:'2 days ago'},
 {company:'Zepto',title:'Product Manager — Growth',location:'Bengaluru',posted:'1 day ago'},
 {company:'Razorpay',title:'Associate Product Manager',location:'Bengaluru / Mumbai',posted:'4 days ago'},
]
const targetKeywords=['product','pm','product manager','associate product','growth','platform']
function score(c:Connection, msgs:Message[], jobs:Job[]){
 const companyJobs=jobs.filter(j=>j.company.toLowerCase()===c.company.toLowerCase())
 const relevant=companyJobs.filter(j=>targetKeywords.some(k=>j.title.toLowerCase().includes(k))).length
 const personMsgs=msgs.filter(m=>[m.to,m.recipient,m.sender].some(v=>(v||'').toLowerCase().includes(c.first.toLowerCase())) || (m.recipient||'').toLowerCase().includes(c.first.toLowerCase()))
 const latest=personMsgs.map(m=>Date.parse(m.date)).filter(Boolean).sort((a,b)=>b-a)[0]
 const days=latest?Math.floor((Date.now()-latest)/86400000):999
 return Math.min(99,40+relevant*25+(personMsgs.length?15:5)+(days>60?10:0))
}
export default function Home(){
 const [connections,setConnections]=useState<Connection[]>([]); const [messages,setMessages]=useState<Message[]>([]); const [jobs,setJobs]=useState<Job[]>(sampleJobs)
 const [target,setTarget]=useState('Product Manager'); const [tab,setTab]=useState('Overview'); const [query,setQuery]=useState(''); const [selected,setSelected]=useState<Connection|null>(null); const [notice,setNotice]=useState('')
 const parse=(file:File,type:'connections'|'messages'|'jobs')=>{
   Papa.parse(file,{header:true,skipEmptyLines:true,complete:(r:any)=>{
    if(type==='connections') setConnections((r.data as any[]).map(x=>({first:x['First Name']||'',last:x['Last Name']||'',url:x['URL']||'',company:x['Company']||'',position:x['Position']||'',connected:x['Connected On']||''})).filter(x=>x.first||x.last))
    if(type==='messages') setMessages((r.data as any[]).map(x=>({from:x['FROM']||'',sender:x['SENDER PROFILE URL']||'',to:x['TO']||'',recipient:x['RECIPIENT PROFILE URLS']||'',date:x['DATE']||'',content:x['CONTENT']||'',folder:x['FOLDER']||''})).filter(x=>x.to||x.from))
    if(type==='jobs') setJobs((r.data as any[]).map(x=>({company:x.company||x.Company||x['Company Name']||'',title:x.title||x.Title||x['Job Title']||x.position||'',location:x.location||x.Location||'',url:x.url||x.URL||'',posted:x.posted||x.Posted||''})).filter(x=>x.company&&x.title))
    setNotice(type==='connections'?'Connections loaded':type==='messages'?'Messages loaded':'Jobs loaded'); setTimeout(()=>setNotice(''),2200)
   }})
 }
 const ranked=useMemo(()=>connections.map(c=>({...c,s:score(c,messages,jobs)})).sort((a,b)=>b.s-a.s),[connections,messages,jobs])
 const filtered=ranked.filter(c=>`${c.first} ${c.last} ${c.company} ${c.position}`.toLowerCase().includes(query.toLowerCase()))
 const companies=new Set(connections.map(c=>c.company).filter(Boolean)).size
 const contacted=new Set(messages.map(m=>m.to||m.recipient)).size
 return <main>
  <aside className="sidebar"><div className="brand"><div className="brandmark">R</div><div><b>Reachout</b><span>job search CRM</span></div></div>
   <nav>{['Overview','People','Opportunities','Outreach'].map(x=><button key={x} className={tab===x?'nav active':'nav'} onClick={()=>setTab(x)}>{x==='Overview'?<Sparkles size={17}/>:x==='People'?<Users size={17}/>:x==='Opportunities'?<BriefcaseBusiness size={17}/>:<MessageSquare size={17}/>} {x}</button>)}</nav>
   <div className="sidebarBottom"><div className="miniTitle">TARGET ROLE</div><input value={target} onChange={e=>setTarget(e.target.value)} /><div className="miniTitle">IMPORT DATA</div>
    <label className="upload"><FileUp size={16}/> Connections.csv<input type="file" accept=".csv" onChange={e=>e.target.files&&parse(e.target.files[0],'connections')}/></label>
    <label className="upload"><FileUp size={16}/> Messages.csv<input type="file" accept=".csv" onChange={e=>e.target.files&&parse(e.target.files[0],'messages')}/></label>
    <label className="upload"><FileUp size={16}/> Jobs.csv<input type="file" accept=".csv" onChange={e=>e.target.files&&parse(e.target.files[0],'jobs')}/></label>
   </div>
  </aside>
  <section className="content"><header><div><div className="eyebrow">COMMAND CENTER</div><h1>Your network, working for your job search.</h1><p>Prioritize who to contact based on your relationships, hiring activity and target role.</p></div><div className="headerActions"><button className="ghost">Settings</button><button className="primary" onClick={()=>document.querySelector<HTMLInputElement>('input[type=file]')?.click()}><FileUp size={16}/> Import</button></div></header>
   {notice&&<div className="toast"><CircleCheck size={16}/>{notice}</div>}
   {tab==='Overview'&&<><div className="stats"><Stat icon={<Users/>} n={connections.length||'—'} label="connections"/><Stat icon={<MessageSquare/>} n={messages.length||'—'} label="messages"/><Stat icon={<BriefcaseBusiness/>} n={jobs.length} label="relevant openings"/><Stat icon={<Flame/>} n={ranked.filter(x=>x.s>=75).length||'—'} label="high-priority people"/></div>
   <div className="sectionHead"><div><h2>Recommended actions</h2><span>Ranked for <b>{target}</b></span></div><button className="textBtn" onClick={()=>setTab('People')}>View all <ChevronRight size={15}/></button></div>
   <div className="cards">{(ranked.length?ranked.slice(0,5):demo()).map((c:any)=><PersonCard key={c.first+c.last} c={c} jobs={jobs} onClick={()=>setSelected(c)}/>)}</div>
   <div className="sectionHead lower"><div><h2>Companies hiring</h2><span>Connect the dots between openings and your network.</span></div><button className="textBtn" onClick={()=>setTab('Opportunities')}>Explore <ChevronRight size={15}/></button></div>
   <div className="companyGrid">{jobs.slice(0,4).map((j,i)=><div className="companyCard" key={i}><div className="companyLogo">{j.company[0]}</div><div><b>{j.company}</b><span>{j.title}</span><small>{j.location||'India'} · {j.posted||'recently'}</small></div><ArrowUpRight size={16}/></div>)}</div></>}
   {tab==='People'&&<><div className="sectionHead"><div><h2>People</h2><span>{connections.length} connections in your workspace.</span></div></div><div className="search"><Search size={17}/><input placeholder="Search people, companies or roles..." value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="table"><div className="tr th"><span>PERSON</span><span>COMPANY</span><span>ROLE</span><span>SCORE</span><span></span></div>{filtered.map(c=><div className="tr" key={c.url||c.first+c.last} onClick={()=>setSelected(c)}><span><b>{c.first} {c.last}</b><small>{c.connected?`Connected ${c.connected}`:''}</small></span><span>{c.company||'—'}</span><span>{c.position||'—'}</span><span><strong className={c.s>=75?'hot':'warm'}>{c.s}</strong></span><span><ChevronRight size={16}/></span></div>)}</div></>}
   {tab==='Opportunities'&&<><div className="sectionHead"><div><h2>Opportunities</h2><span>Jobs matched to your target role and network.</span></div></div><div className="opps">{jobs.map((j,i)=>{const people=connections.filter(c=>c.company.toLowerCase()===j.company.toLowerCase());return <div className="opp" key={i}><div className="oppTop"><div className="companyLogo">{j.company[0]}</div><div><h3>{j.title}</h3><span>{j.company} · {j.location||'India'}</span></div><span className="match">{people.length?`${people.length} connection${people.length>1?'s':''}`:'No direct connection'}</span></div><div className="oppBottom"><span>{j.posted||'Recently posted'}</span>{people.slice(0,3).map(p=><button className="personPill" key={p.url} onClick={()=>setSelected(p)}>{p.first} {p.last}</button>)}</div></div>})}</div></>}
   {tab==='Outreach'&&<><div className="sectionHead"><div><h2>Outreach</h2><span>Keep track of what happens after the recommendation.</span></div></div><div className="pipeline"><Pipe title="To contact" count={ranked.filter(x=>x.s>=75).length} icon={<Flame/>}/><Pipe title="Waiting" count={Math.max(0,contacted-2)} icon={<Clock3/>}/><Pipe title="Replied" count="—" icon={<MessageSquare/>}/><Pipe title="Interview" count="—" icon={<CircleCheck/>}/></div></>}
  </section>
  {selected&&<div className="overlay" onClick={()=>setSelected(null)}><div className="drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}><X/></button><div className="profileAvatar">{selected.first[0]}</div><h2>{selected.first} {selected.last}</h2><p className="role">{selected.position||'Professional'} · {selected.company||'Company not listed'}</p><div className="scoreBox"><div><small>OUTREACH SCORE</small><strong>{score(selected,messages,jobs)}</strong></div><span>Why now?</span></div><ul className="why"><li>Relevant {target} opportunity detected</li><li>{messages.some(m=>(m.to||'').toLowerCase().includes(selected.first.toLowerCase()))?'You have an existing conversation':'You have not messaged this person yet'}</li><li>{selected.company?'Connected to '+selected.company:''}</li></ul><button className="primary full"><Sparkles size={16}/> Draft personalized message</button><div className="history"><h3>Conversation</h3>{messages.filter(m=>(m.to||'').toLowerCase().includes(selected.first.toLowerCase())||(m.from||'').toLowerCase().includes(selected.first.toLowerCase())).slice(0,4).map((m,i)=><div className="message" key={i}><small>{m.date}</small><p>{m.content||'No message content'}</p></div>)}</div></div></div>}
 </main>
}
function Stat({icon,n,label}:{icon:any,n:any,label:string}){return <div className="stat"><div className="statIcon">{icon}</div><div><strong>{n}</strong><span>{label}</span></div></div>}
function PersonCard({c,jobs,onClick}:{c:any,jobs:Job[],onClick:()=>void}){const js=jobs.filter(j=>j.company.toLowerCase()===c.company.toLowerCase());return <button className="personCard" onClick={onClick}><div className="cardTop"><div className="avatar">{c.first[0]}</div><div className="identity"><b>{c.first} {c.last}</b><span>{c.position||'Professional'}</span><small>{c.company||'Company not listed'}</small></div><div className="score"><strong>{c.s}</strong><span>score</span></div></div><div className="reason"><Flame size={15}/><span>{js.length?`${js.length} relevant opening${js.length>1?'s':''} at ${c.company}`:c.company?`Strong network connection at ${c.company}`:'Potential network contact'}</span></div><div className="cardAction">{js.length?'Message now':'View profile'} <ArrowUpRight size={15}/></div></button>}
function Pipe({title,count,icon}:{title:string,count:any,icon:any}){return <div className="pipe"><div className="pipeHead"><span>{icon}{title}</span><b>{count}</b></div><div className="empty">No tracked actions yet</div></div>}
function demo(){return [{first:'Your first contact',last:'',company:'Upload your data',position:'Connections will appear here',s:96,url:'demo1'},{first:'Your next contact',last:'',company:'Add jobs to unlock',position:'Opportunity matching',s:88,url:'demo2'},{first:'Follow-up candidate',last:'',company:'Import messages',position:'Conversation history',s:81,url:'demo3'}]}
