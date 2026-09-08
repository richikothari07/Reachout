export type Connection = { first_name:string; last_name:string; linkedin_url:string; company:string; position:string; connected_on:string }
export type MessageStats = { contact_url:string; contact_name:string; outgoing_count:number; incoming_count:number; last_outgoing:string|null; last_incoming:string|null }

const ROLE_SYNONYMS: Record<string,string[]> = {
  'product manager':['product','product manager','product management','pm','platform','growth','product strategy','product lead','product head','chief product','cpo'],
  'product':['product','product manager','product management','pm','platform','growth','product strategy','product lead','product head','chief product','cpo'],
  'software engineer':['engineer','engineering','software','developer','technology','tech lead','cto','technical'],
  'designer':['design','designer','ux','ui','product design','creative'],
  'marketing':['marketing','growth','brand','demand','communications','content','cmo'],
  'finance':['finance','financial','investment','investing','treasury','cfo','fp&a']
}
const HIRING = ['founder','co-founder','ceo','chief executive','cpo','chief product','vp product','vice president product','head of product','product head','director product','head of talent','talent','recruiter','recruiting','human resources','hr','people','hiring manager','founding team','owner']
const LEADERS = ['founder','co-founder','ceo','cpo','cto','cfo','chief','vp ','vice president','head of','director','partner','owner','managing director']
export function norm(s=''){ return s.toLowerCase().replace(/[^a-z0-9+ ]/g,' ').replace(/\s+/g,' ').trim() }
export function termsFor(target:string){
  const t=norm(target)
  const expanded:string[]=[]
  for(const k of Object.keys(ROLE_SYNONYMS)) if(t.includes(k)) expanded.push(...ROLE_SYNONYMS[k])
  const raw=t.split(' ').filter(x=>x.length>2)
  return Array.from(new Set([...(expanded.length?expanded:raw), ...raw]))
}
export function dateMs(s:string|null|undefined){ if(!s) return 0; const d=Date.parse(s.replace(' UTC','Z')); return Number.isFinite(d)?d:0 }
export function daysAgo(s:string|null|undefined){ const d=dateMs(s); return d ? Math.max(0, Math.floor((Date.now()-d)/86400000)) : 9999 }
export function classify(c:Connection,target:string,stats?:MessageStats){
  const pos=norm(c.position), company=norm(c.company), terms=termsFor(target), hits=terms.filter(t=>pos.includes(t)||company.includes(t)).length
  const roleMatch=hits>0, hiring=HIRING.some(t=>pos.includes(t)), leadership=LEADERS.some(t=>pos.includes(t))
  const outgoing=stats?.outgoing_count||0, incoming=stats?.incoming_count||0
  const lastOut=stats?.last_outgoing||null, lastIn=stats?.last_incoming||null
  const awaiting=outgoing>0 && (!lastIn || dateMs(lastOut)>dateMs(lastIn))
  let score=25; const reasons:string[]=[]
  if(roleMatch){score+=Math.min(35,20+Math.min(15,Math.max(0,hits-1)*5)); reasons.push(`Matches your target / keywords: ${target}`)}
  if(hiring){score+=28; reasons.push('Likely able to hire for this role')} else if(leadership){score+=18; reasons.push('Senior decision-maker at the company')}
  if(!outgoing && !incoming){score+=10; reasons.push('No previous conversation — good for first outreach')}
  if(awaiting && daysAgo(lastOut)>=7){score+=12; reasons.push(`You messaged ${daysAgo(lastOut)} days ago with no reply`)}
  if(incoming>0 && !awaiting) reasons.push('Has replied to you before')
  if(!roleMatch && !hiring && !leadership){score-=15; reasons.push('Lower relevance to your target')}
  return { ...c, score:Math.max(1,Math.min(99,score)), reasons, action: awaiting && daysAgo(lastOut)>=7 ? 'Follow up' : (roleMatch||hiring||leadership ? 'Reach out':'Keep warm'), lastOutgoing:lastOut, lastIncoming:lastIn, outgoingCount:outgoing, incomingCount:incoming }
}
