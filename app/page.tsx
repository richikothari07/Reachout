'use client'
import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { ArrowUpRight, BriefcaseBusiness, Check, ChevronRight, Clock3, FileUp, Flame, MessageSquare, Search, Sparkles, Users, X, SlidersHorizontal } from 'lucide-react'

type Connection={first:string;last:string;url:string;company:string;position:string;connected:string}
type Message={from:string;sender:string;to:string;recipient:string;date:string;content:string;folder:string}
type Ranked=Connection & {score:number; reasons:string[]; action:'Reach out'|'Follow up'|'Keep warm'; lastOutgoing?:string; lastIncoming?:string; outgoingCount:number; incomingCount:number}

const ROLE_SYNONYMS:Record<string,string[]>={
  'product manager':['product','product manager','product management','pm','platform','growth','product strategy','product lead','product head','chief product','cpo'],
  'product':['product','product manager','product management','pm','platform','growth','product strategy','product lead','product head','chief product','cpo'],
  'software engineer':['engineer','engineering','software','developer','technology','tech lead','cto','technical'],
  'designer':['design','designer','ux','ui','product design','creative'],
  'marketing':['marketing','growth','brand','demand','communications','content','cmo'],
  'finance':['finance','financial','investment','investing','treasury','cfo','fp&a'],
}
const HIRING_TITLES=['founder','co-founder','ceo','chief executive','cpo','chief product','vp product','vice president product','head of product','product head','director product','head of talent','talent','recruiter','recruiting','human resources','hr','people','hiring manager','founding team','owner']
const LEADERSHIP=['founder','co-founder','ceo','cpo','cto','cfo','chief','vp ','vice president','head of','director','partner','owner','managing director']

function norm(s=''){return s.toLowerCase().replace(/[^a-z0-9+ ]/g,' ').replace(/\s+/g,' ').trim()}
function termsFor(target:string){const t=norm(target); for(const k of Object.keys(ROLE_SYNONYMS)) if(t.includes(k)) return ROLE_SYNONYMS[k]; return t.split(' ').filter(x=>x.length>2).concat(['product','pm'])}
function parseDate(s=''){const d=Date.parse(s.replace(' UTC','Z')); return Number.isFinite(d)?d:0}
function daysAgo(s=''){const d=parseDate(s); return d?Math.max(0,Math.floor((Date.now()-d)/86400000)):9999}
function isSelf(m:Message){return norm(m.from)==='richi kothari' || norm(m.sender).includes('richi-kothari')}
function matchesPerson(m:Message,c:Connection){const u=norm(c.url); return (u && (norm(m.sender)===u || norm(m.recipient)===u)) || norm(m.to)===norm(`${c.first} ${c.last}`) || norm(m.from)===norm(`${c.first} ${c.last}`)}
function rank(c:Connection,msgs:Message[],target:string):Ranked{
 const pos=norm(c.position), company=norm(c.company); const terms=termsFor(target)
 const roleHits=terms.filter(t=>pos.includes(t)).length
 const roleMatch=roleHits>0
 const hiring=HIRING_TITLES.some(t=>pos.includes(t))
 const leadership=LEADERSHIP.some(t=>pos.includes(t))
 const relevant=roleMatch || hiring || leadership
 const pm=msgs.filter(m=>matchesPerson(m,c)).sort((a,b)=>parseDate(b.date)-parseDate(a.date))
 const outgoing=pm.filter(isSelf), incoming=pm.filter(m=>!isSelf(m))
 const lastOut=outgoing[0]?.date, lastIn=incoming[0]?.date
 const awaiting=!!lastOut && (!lastIn || parseDate(lastOut)>parseDate(lastIn))
 const follow=awaiting && daysAgo(lastOut!)>=7
 let score=25, reasons:string[]=[]
 if(roleMatch){score+=32; reasons.push(`Profile matches ${target}`)}
 if(hiring){score+=28; reasons.push('Likely able to hire for this role')}
 else if(leadership){score+=18; reasons.push('Senior decision-maker at the company')}
 if(company) {score+=5; reasons.push(`Works at ${c.company}`)}
 if(!pm.length){score+=10; reasons.push('No previous conversation — fresh outreach')}
 if(follow){score+=12; reasons.push(`You messaged ${daysAgo(lastOut!)} days ago with no reply`)}
 if(pm.length && !follow && lastIn){reasons.push('Has replied to you before')}
 if(!relevant){score-=15; reasons.push('Lower relevance to target role')}
 let action:Ranked['action']=follow?'Follow up':relevant?'Reach out':'Keep warm'
 return {...c,score:Math.max(1,Math.min(99,score)),reasons,lastOutgoing:lastOut,lastIncoming:lastIn,outgoingCount:outgoing.length,incomingCount:incoming.length,action}
}

function readConnections(file:File,done:(x:Connection[])=>void){Papa.parse(file,{header:true,skipEmptyLines:true,complete:r=>done((r.data as any[]).map(x=>({first:x['First Name']||'',last:x['Last Name']||'',url:x.URL||'',company:x.Company||'',position:x.Position||'',connected:x['Connected On']||''})).filter(x=>x.first||x.last))})}
function readMessages(file:File,done:(x:Message[])=>void){Papa.parse(file,{header:true,skipEmptyLines:true,complete:r=>done((r.data as any[]).map(x=>({from:x.FROM||'',sender:x['SENDER PROFILE URL']||'',to:x.TO||'',recipient:x['RECIPIENT PROFILE URLS']||'',date:x.DATE||'',content:x.CONTENT||'',folder:x.FOLDER||''})).filter(x=>x.to||x.from))})}

export default function Home(){
 const [connections,setConnections]=useState<Connection[]>([]); const [messages,setMessages]=useState<Message[]>([])
 const [target,setTarget]=useState('Product Manager'); const [tab,setTab]=useState('Overview'); const [query,setQuery]=useState(''); const [selected,setSelected]=useState<Ranked|null>(null); const [notice,setNotice]=useState(''); const [days,setDays]=useState(7)
 const load=(kind:'connections'|'messages',file?:File)=>{if(!file)return; if(kind==='connections')readConnections(file,x=>{setConnections(x); flash(`${x.length.toLocaleString()} connections loaded`)});else readMessages(file,x=>{setMessages(x);flash(`${x.length.toLocaleString()} messages loaded`)})}
 const flash=(s:string)=>{setNotice(s);setTimeout(()=>setNotice(''),2500)}
 const ranked=useMemo(()=>connections.map(c=>rank(c,messages,target)).sort((a,b)=>b.score-a.score),[connections,messages,target])
 const followups=ranked.filter(x=>x.action==='Follow up' && daysAgo(x.lastOutgoing)>=days)
 const recommended=ranked.filter(x=>x.action==='Reach out').slice(0,6)
 const people=ranked.filter(c=>`${c.first} ${c.last} ${c.company} ${c.position}`.toLowerCase().includes(query.toLowerCase()))
 const companies=new Set(connections.map(c=>c.company).filter(Boolean)).size
 const contacted=new Set(messages.filter(isSelf).map(m=>m.recipient||m.to)).size
 const fresh=ranked.filter(x=>x.action==='Reach out').length
 return <main>
  <aside className="sidebar"><div className="brand"><div className="brandmark">R</div><div><b>ReachOut</b><span>network copilot</span></div></div>
   <nav>{['Overview','People','Follow-ups'].map(x=><button key={x} className={tab===x?'nav active':'nav'} onClick={()=>setTab(x)}>{x==='Overview'?<Sparkles size={17}/>:x==='People'?<Users size={17}/>:<Clock3 size={17}/>} {x}</button>)}</nav>
   <div className="sidebarBottom"><div className="miniTitle">WHAT ARE YOU LOOKING FOR?</div><label className="fieldLabel">Target role</label><input value={target} onChange={e=>setTarget(e.target.value)} placeholder="e.g. Product Manager"/><div className="helper">We'll match both people with similar profiles and people who can hire for this role.</div>
    <div className="miniTitle">YOUR DATA</div>
    <label className="upload"><FileUp size={16}/> {connections.length?'Replace connections':'Upload Connections.csv'}<input type="file" accept=".csv" onChange={e=>load('connections',e.target.files?.[0])}/></label>
    <label className="upload"><FileUp size={16}/> {messages.length?'Replace messages':'Upload messages.csv'}<input type="file" accept=".csv" onChange={e=>load('messages',e.target.files?.[0])}/></label>
   </div>
  </aside>
  <section className="content"><header><div><div className="eyebrow">REACHOUT</div><h1>Know who to reach out to next.</h1><p>We turn your LinkedIn connections and message history into a prioritized outreach list.</p></div><div className="headerActions"><button className="ghost" onClick={()=>setTab('People')}><SlidersHorizontal size={15}/> All people</button><label className="primary"><FileUp size={15}/> Import data<input className="hidden" type="file" accept=".csv" multiple onChange={e=>{Array.from(e.target.files||[]).forEach(f=>f.name.toLowerCase().includes('message')?load('messages',f):load('connections',f))}}/></label></div></header>
   {notice&&<div className="toast"><Check size={15}/>{notice}</div>}
   {tab==='Overview'&&<>
    <div className="targetBar"><div><span className="targetLabel">TARGET</span><strong>{target||'Add a target role'}</strong><small>Recommendations update as you type.</small></div><div className="targetPills"><span>Profile match</span><span>Potential hiring manager</span><span>Follow-up timing</span></div></div>
    <div className="stats"><Stat icon={<Users/>} n={connections.length||'—'} label="connections analyzed"/><Stat icon={<MessageSquare/>} n={messages.length||'—'} label="messages analyzed"/><Stat icon={<Flame/>} n={fresh||'—'} label="people to reach out to"/><Stat icon={<Clock3/>} n={followups.length||'—'} label="follow-ups due"/></div>
    <div className="sectionHead"><div><h2>Top people to reach out to</h2><span>Best matches for <b>{target}</b> — including people who can hire.</span></div><button className="textBtn" onClick={()=>setTab('People')}>View all {ranked.length} <ChevronRight size={15}/></button></div>
    {!connections.length?<EmptyState onConnections={()=>document.querySelector<HTMLInputElement>('.sidebar input[type=file]')?.click()}/>:<div className="cards">{recommended.length?recommended.map(c=><PersonCard key={c.url||c.first+c.last} c={c} onClick={()=>setSelected(c)}/>):<div className="wideEmpty">No strong matches yet. Try a broader target role.</div>}</div>}
    <div className="sectionHead lower"><div><h2>Follow up</h2><span>People you already messaged and should consider nudging again.</span></div><button className="textBtn" onClick={()=>setTab('Follow-ups')}>See follow-ups <ChevronRight size={15}/></button></div>
    <div className="followStrip">{followups.slice(0,4).map(c=><button key={c.url||c.first} onClick={()=>setSelected(c)}><div className="avatar">{c.first[0]}</div><div><b>{c.first} {c.last}</b><span>{c.company||'—'} · {daysAgo(c.lastOutgoing!)}d since your message</span></div><ChevronRight size={15}/></button>)}{!followups.length&&<div className="wideEmpty">No follow-ups due right now. ReachOut waits until your last message is old enough and there hasn't been a reply.</div>}</div>
   </>}
   {tab==='People'&&<PeopleTab people={people} query={query} setQuery={setQuery} onSelect={setSelected} target={target}/>} 
   {tab==='Follow-ups'&&<FollowupsTab people={followups} days={days} setDays={setDays} onSelect={setSelected}/>} 
  </section>
  {selected&&<Drawer c={selected} target={target} messages={messages} onClose={()=>setSelected(null)} onFlash={flash}/>} 
 </main>
}
function Stat({icon,n,label}:{icon:any,n:any,label:string}){return <div className="stat"><div className="statIcon">{icon}</div><div><strong>{n}</strong><span>{label}</span></div></div>}
function PersonCard({c,onClick}:{c:Ranked,onClick:()=>void}){return <button className="personCard" onClick={onClick}><div className="cardTop"><div className="avatar">{c.first?.[0]||'?'}</div><div className="identity"><b>{c.first} {c.last}</b><span>{c.position||'Role not listed'}</span><small>{c.company||'Company not listed'}</small></div><div className="score"><strong>{c.score}</strong><span>match</span></div></div><div className="reason"><Flame size={15}/><span>{c.reasons[0]}</span></div><div className="reasonList">{c.reasons.slice(1,3).map((r,i)=><span key={i}>✓ {r}</span>)}</div><div className="cardAction">{c.action}<ArrowUpRight size={15}/></div></button>}
function PeopleTab({people,query,setQuery,onSelect,target}:{people:Ranked[],query:string,setQuery:(x:string)=>void,onSelect:(c:Ranked)=>void,target:string}){return <><div className="sectionHead"><div><h2>People</h2><span>Every connection ranked against <b>{target}</b> and your conversation history.</span></div></div><div className="search"><Search size={17}/><input placeholder="Search people, companies or roles..." value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="table"><div className="tr th"><span>PERSON</span><span>COMPANY</span><span>ROLE</span><span>ACTION</span><span>SCORE</span></div>{people.map(c=><button className="tr row" key={c.url||c.first+c.last} onClick={()=>onSelect(c)}><span><b>{c.first} {c.last}</b><small>{c.connected?`Connected ${c.connected}`:''}</small></span><span>{c.company||'—'}</span><span>{c.position||'—'}</span><span><em className={`action ${c.action==='Follow up'?'follow':c.action==='Reach out'?'reach':'warm'}`}>{c.action}</em></span><span><strong className={c.score>=75?'hot':'warmScore'}>{c.score}</strong></span></button>)}</div></>}
function FollowupsTab({people,days,setDays,onSelect}:{people:Ranked[],days:number,setDays:(n:number)=>void,onSelect:(c:Ranked)=>void}){return <><div className="sectionHead"><div><h2>Follow-ups</h2><span>ReachOut looks for messages where you spoke last and enough time has passed.</span></div><div className="cadence">Remind me after <select value={days} onChange={e=>setDays(Number(e.target.value))}><option value="5">5 days</option><option value="7">7 days</option><option value="10">10 days</option><option value="14">14 days</option><option value="21">21 days</option></select></div></div>{!people.length?<div className="emptyPage"><Clock3 size={25}/><h3>No follow-ups due</h3><p>Once you upload messages, we'll flag people you messaged when they haven't replied and your chosen follow-up window has passed.</p></div>:<div className="followList">{people.map(c=><button className="followRow" key={c.url||c.first+c.last} onClick={()=>onSelect(c)}><div className="avatar">{c.first[0]}</div><div className="followInfo"><b>{c.first} {c.last}</b><span>{c.position||'—'} · {c.company||'—'}</span><small>Your last message was {daysAgo(c.lastOutgoing!)} days ago</small></div><div className="followReason">{c.reasons.find(r=>r.includes('messaged'))||'No reply since your last message'}</div><ChevronRight size={16}/></button>)}</div>}</>}
function Drawer({c,target,messages,onClose,onFlash}:{c:Ranked,target:string,messages:Message[],onClose:()=>void,onFlash:(s:string)=>void}){const convo=messages.filter(m=>matchesPerson(m,c)).sort((a,b)=>parseDate(a.date)-parseDate(b.date)); const [draft,setDraft]=useState(''); const generate=()=>{const name=c.first||'there'; setDraft(c.action==='Follow up'?`Hi ${name}, just wanted to follow up on my earlier note. I’m still very interested in exploring ${target} opportunities and would love to chat if there’s a relevant fit at ${c.company||'your company'}.`:`Hi ${name}, I’m currently exploring ${target} opportunities and came across your profile. Given your role at ${c.company||'the company'}, I thought it would be great to connect and learn if there might be a relevant opportunity or someone you’d recommend speaking with.`)};return <div className="overlay" onClick={onClose}><div className="drawer" onClick={e=>e.stopPropagation()}><button className="close" onClick={onClose}><X/></button><div className="profileAvatar">{c.first[0]}</div><h2>{c.first} {c.last}</h2><p className="role">{c.position||'Professional'} · {c.company||'Company not listed'}</p><div className="scoreBox"><div><small>REACHOUT SCORE</small><strong>{c.score}</strong></div><span>{c.action}</span></div><div className="why"><h3>Why ReachOut picked them</h3>{c.reasons.map((r,i)=><div key={i}>✓ {r}</div>)}</div><button className="primary full" onClick={generate}><Sparkles size={16}/> {c.action==='Follow up'?'Draft follow-up':'Draft message'}</button>{draft&&<div className="draft"><div className="draftHead"><b>Suggested message</b><button onClick={()=>{navigator.clipboard?.writeText(draft);onFlash('Message copied')}}>Copy</button></div><p>{draft}</p></div>}<div className="history"><h3>Conversation history</h3>{convo.length?convo.map((m,i)=><div className={`message ${isSelf(m)?'mine':''}`} key={i}><small>{m.date} · {isSelf(m)?'You':m.from}</small><p>{m.content||'No message content'}</p></div>):<p className="muted">No conversation found.</p>}</div></div></div>}
function EmptyState({onConnections}:{onConnections:()=>void}){return <div className="emptyPage"><div className="emptyIcon"><Users/></div><h3>Import your LinkedIn data</h3><p>Upload your Connections.csv and messages.csv. ReachOut will analyze your network, identify likely hiring contacts and surface people worth reaching out to.</p><button className="primary" onClick={onConnections}><FileUp size={15}/> Upload connections</button></div>}
