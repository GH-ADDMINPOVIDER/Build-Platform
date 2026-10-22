import { useCallback, useEffect, useState, type FormEvent } from "react";
import "./agent-fabric.css";
// GT Go does not need Codex or API credentials: this is WAVE human messaging.
type Item={seq:number;message_id:string;sender_principal:string;body:string;thread_id:string;task_id:string|null;ack_id:string|null;created_at:number};
type Reply={ok?:boolean;code?:string;principal_id?:string;csrf?:string;thread_id?:string;task_id?:string;ack_id?:string;message_id?:string;items?:Item[];enrollment_token?:string};
export default function AgentFabricInbox(){
 const [principal,setPrincipal]=useState(""),[csrf,setCsrf]=useState("");
 const [invite,setInvite]=useState(""),[recipientEmail,setRecipientEmail]=useState("");
 const [newInvite,setNewInvite]=useState(""),[threadId,setThreadId]=useState("");
 const [message,setMessage]=useState("PING GT"),[reply,setReply]=useState("PONG GS");
 const [items,setItems]=useState<Item[]>([]),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const call=useCallback(async(path:string,method="GET",body?:unknown,key?:string):Promise<Reply>=>{
   const headers:Record<string,string>={};
   if(body!==undefined)headers["Content-Type"]="application/json";
   if(method!=="GET"){if(csrf)headers["X-WAVE-CSRF"]=csrf;if(key)headers["Idempotency-Key"]=key}
   const r=await fetch("/api/agent-fabric"+path,{method,headers,credentials:"same-origin",cache:"no-store",
     body:body===undefined?undefined:JSON.stringify(body)});
   const data=await r.json().catch(()=>({code:"ACCESS_LOGIN_OR_JSON_REQUIRED"})) as Reply;
   if(!r.ok)throw new Error(data.code||"HTTP_"+r.status);
   return data;
 },[csrf]);
 const refresh=useCallback(async()=>{
   try{const me=await call("/auth/me");setPrincipal(me.principal_id||"");
       const inbox=await call("/inbox?limit=50");setItems(inbox.items||[])}
   catch(e){setNotice(e instanceof Error?e.message:"UNAVAILABLE")}
 },[call]);
 useEffect(()=>{void refresh();const t=window.setInterval(()=>{
   if(document.visibilityState==="visible")void refresh();
 },15000);return()=>clearInterval(t)},[refresh]);
 async function action(cb:()=>Promise<void>){setBusy(true);setNotice("");
   try{await cb()}catch(e){setNotice(e instanceof Error?e.message:"ERROR")}finally{setBusy(false)}}
 async function login(kind:"owner"|"access"){await action(async()=>{
   const r=await call(kind==="owner"?"/auth/owner-session":"/auth/access-exchange","POST",
     kind==="owner"?{}:{enrollment_token:invite});
   setPrincipal(r.principal_id||"");setCsrf(r.csrf||"");setInvite("");setNotice("Authenticated: "+r.principal_id);
 })}
 async function enroll(e:FormEvent){e.preventDefault();await action(async()=>{
   const r=await call("/principals/enrollments","POST",
     {principal_id:"human:gt",permitted_email:recipientEmail,display_name:"GT Human"});
   setNewInvite(r.enrollment_token||"");setNotice("Private one-time GT invitation created.");
 })}
 async function makeThread(){await action(async()=>{
   const r=await call("/threads","POST",
     {title:"GS ↔ GT Staging",recipient_principals:["human:gt"]},crypto.randomUUID());
   setThreadId(r.thread_id||"");setNotice("WAVE thread created; task not yet delivered.");
 })}
 async function send(e:FormEvent){e.preventDefault();await action(async()=>{
   const r=await call("/tasks","POST",{
     thread_id:threadId,assigned_principal:"human:gt",title:"GS → GT communication test",
     context:{text:"Acknowledge and reply through the WAVE Human Inbox."},
     initial_message:{text:message}
   },crypto.randomUUID());
   setNotice("D1 Task created: "+r.task_id+" — GT ACK still pending");
 })}
 async function ack(m:Item){await action(async()=>{
   const r=await call("/messages/"+encodeURIComponent(m.message_id)+"/ack","POST",{},
     "ack_"+m.message_id.slice(0,40));
   setNotice("Explicit ACK: "+r.ack_id);await refresh();
 })}
 async function answer(m:Item,e:FormEvent){e.preventDefault();await action(async()=>{
   const r=await call("/messages/"+encodeURIComponent(m.message_id)+"/reply","POST",
     {body:{text:reply}},crypto.randomUUID());
   setNotice("PONG saved as "+r.message_id);await refresh();
 })}
 const allowed=principal==="human:owner"||principal==="human:gs";
 return <main className="afPage">
   <header><small>WAVE / OGENIC · STAGING</small><h1>Agent Fabric Inbox</h1>
     <p>GS ↔ GT messaging · no model call · GT ChatGPT Go compatible</p>
     <strong>Authenticated principal: {principal||"NONE"}</strong></header>
   <section className="afPanel"><h2>Sign in</h2>
     <p>Owner: use existing signed WAVE 1LSS. GT: Cloudflare Access email OTP and one-time enrollment. Never use ChatGPT cookies.</p>
     <div className="afButtons">
       <button disabled={busy} onClick={()=>void login("owner")}>Owner session</button>
       <button disabled={busy} onClick={()=>void login("access")}>GT / GS Access sign-in</button>
     </div>
     <label htmlFor="af-invite">Enrollment token (first GT login only)</label>
     <input id="af-invite" type="password" autoComplete="off" value={invite}
       onChange={e=>setInvite(e.target.value)} placeholder="Private single-use enrollment token"/>
     <small>Cloudflare Access must protect the login route. Unconfigured Access fails closed.</small>
   </section>
   {allowed&&<section className="afPanel"><h2>GS → GT</h2>
     <form onSubmit={enroll} className="afForm">
       <label htmlFor="af-email">GT approved email</label>
       <input id="af-email" type="email" required value={recipientEmail} onChange={e=>setRecipientEmail(e.target.value)}/>
       <button disabled={busy||principal!=="human:owner"}>Create GT enrollment (Owner)</button>
     </form>
     {newInvite&&<div className="afSecret"><strong>Send only to GT in a private channel</strong><code>{newInvite}</code>
       <button type="button" onClick={()=>{void navigator.clipboard.writeText(newInvite);setNewInvite("")}}>Copy and hide</button></div>}
     <div className="afButtons"><button onClick={()=>void makeThread()} disabled={busy}>Create GT thread</button></div>
     <form onSubmit={send} className="afForm">
       <label htmlFor="af-thread">Thread</label>
       <input id="af-thread" required value={threadId} onChange={e=>setThreadId(e.target.value)}/>
       <label htmlFor="af-message">Task message</label>
       <textarea id="af-message" required maxLength={16000} rows={3} value={message} onChange={e=>setMessage(e.target.value)}/>
       <button disabled={busy||!threadId}>Send Task + Message to GT</button>
     </form>
   </section>}
   <section className="afPanel"><h2>Inbox — {principal||"sign in required"}</h2>
     <button onClick={()=>void refresh()} disabled={busy}>Refresh</button>
     <p>AVAILABLE ≠ READ ≠ ACK ≠ COMPLETED.</p>
     {items.map(m=><article key={m.message_id} className="afMessage">
       <small>{m.sender_principal} · {new Date(m.created_at).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</small>
       <p>{m.body}</p><small>{m.message_id} — {m.ack_id?"ACK "+m.ack_id:"ACK PENDING"}</small>
       {!m.ack_id&&<button disabled={busy} onClick={()=>void ack(m)}>Explicit ACK</button>}
       <form className="afForm" onSubmit={e=>void answer(m,e)}>
         <label>Reply<input value={reply} required onChange={e=>setReply(e.target.value)}/></label>
         <button disabled={busy}>Send Reply</button>
       </form>
     </article>)}
     {!items.length&&<p>No messages for this authenticated principal.</p>}
   </section>
   {notice&&<p className="afNotice" role="status">{notice}</p>}
   <footer>No Codex or model API is invoked in Human Inbox. GT receipt E2E requires real GT login.</footer>
 </main>;
}
