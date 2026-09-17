// AY GYM PT Online
// 1) Put your Supabase Project URL and Publishable/Anon key below.
// 2) Run supabase-schema.sql in Supabase SQL Editor.
// Never put a Supabase service_role key in this browser app.

const SUPABASE_URL = "https://qymgxhmvpqgxgxzmldvf.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_ffkRM6BV_Iso1s0ZbbPX0w_dOSEdiy5";

const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PASTE_") && !SUPABASE_KEY.includes("PASTE_");
const sb = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

const $ = id => document.getElementById(id);
let authMode = "login", currentUser = null, currentProfile = null;
let clients = [], sessions = [], users = [];

function toast(msg, type=""){ const el=$("toast"); el.textContent=msg; el.className="toast show "+type; setTimeout(()=>el.className="toast",2600); }
function today(){ return new Date().toISOString().slice(0,10); }
function esc(v){ return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }

document.querySelectorAll("[data-auth]").forEach(b=>b.onclick=()=>{
  authMode=b.dataset.auth;
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
  $("authSubmit").textContent=authMode==="login"?"Masuk":"Daftar";
  $("nameField").classList.toggle("hidden",authMode==="login");
  $("authHint").textContent=authMode==="login"?"Gunakan akun yang sudah dibuat di Supabase.":"Setelah daftar, akun dapat diatur role-nya oleh Admin.";
});
$("authForm").onsubmit=async e=>{
  e.preventDefault();
  if(!sb){ toast("Isi SUPABASE_URL dan SUPABASE_KEY di app.js.","error"); return; }
  const email=$("authEmail").value.trim(), password=$("authPassword").value;
  let result;
  if(authMode==="login"){
    result=await sb.auth.signInWithPassword({email,password});
  }else{
    result=await sb.auth.signUp({email,password,options:{data:{full_name:$("authName").value.trim()}}});
  }
  if(result.error) return toast(result.error.message,"error");
  toast(authMode==="login"?"Berhasil masuk":"Akun dibuat. Silakan masuk.");
  if(authMode==="signup"){ authMode="login"; document.querySelector('[data-auth="login"]').click(); }
};

$("logoutBtn").onclick=()=>sb?.auth.signOut();

document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
document.querySelectorAll("[data-page-jump]").forEach(b=>b.onclick=()=>showPage(b.dataset.pageJump));
$("newClientBtn").onclick=()=>openClientModal();
$("closeClient").onclick=()=>$("clientModal").classList.add("hidden");
$("clientSearch").oninput=renderClients;

async function boot(){
  if(!sb){ $("authHint").innerHTML="Belum terhubung ke Supabase. Isi konfigurasi di <b>app.js</b>."; return; }
  const {data:{session}}=await sb.auth.getSession();
  if(session) await loadUser(session.user);
  sb.auth.onAuthStateChange(async (_event,session)=>{ if(session) await loadUser(session.user); else showAuth(); });
}
async function loadUser(user){
  currentUser=user;
  const {data,error}=await sb.from("profiles").select("*").eq("id",user.id).single();
  if(error){ toast("Profil belum tersedia. Jalankan SQL database.","error"); return; }
  currentProfile=data;
  $("authView").classList.add("hidden"); $("appView").classList.remove("hidden");
  $("userLabel").textContent=data.full_name||user.email;
  $("roleLabel").textContent=(data.role||"client").toUpperCase();
  $("statRole").textContent=(data.role||"client").toUpperCase();
  applyRole();
  await loadAll();
}
function showAuth(){ $("appView").classList.add("hidden"); $("authView").classList.remove("hidden"); }
function applyRole(){
  const role=currentProfile.role;
  document.querySelectorAll(".admin-only").forEach(e=>e.classList.toggle("hidden",role!=="admin"));
  document.querySelectorAll(".trainer-only").forEach(e=>e.classList.toggle("hidden",!(role==="admin"||role==="trainer")));
  document.querySelectorAll(".client-only").forEach(e=>e.classList.toggle("hidden",role!=="client"));
  if(role==="client") showPage("myprogress"); else showPage("dashboard");
}
function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  const el=$(page+"Page"); if(el) el.classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  $("pageTitle").textContent={dashboard:"Dashboard",clients:"Klien",session:"Catat Sesi",myprogress:"Progress Saya",users:"Pengguna"}[page]||"Dashboard";
}

async function loadAll(){
  const role=currentProfile.role;
  if(role==="client"){
    const {data:c}=await sb.from("clients").select("*").eq("user_id",currentUser.id).maybeSingle();
    clients=c?[c]:[];
    const {data:s}=await sb.from("sessions").select("*").eq("client_id",c?.id||"").order("session_date",{ascending:false});
    sessions=s||[];
    renderClientProgress(); renderDashboard();
  }else{
    const {data:c}=await sb.from("clients").select("*").order("created_at",{ascending:false});
    clients=c||[];
    const {data:s}=await sb.from("sessions").select("*").order("session_date",{ascending:false}).limit(100);
    sessions=s||[];
    renderClients(); populateClientSelect(); renderDashboard();
    if(role==="admin") loadUsers();
  }
}
function renderDashboard(){
  $("statClients").textContent=clients.length;
  $("statSessions").textContent=sessions.length;
  const month=new Date().toISOString().slice(0,7);
  $("statMonth").textContent=sessions.filter(s=>(s.session_date||"").startsWith(month)).length;
  $("recentSessions").innerHTML=sessions.slice(0,8).map(s=>{
    const c=clients.find(x=>x.id===s.client_id);
    return `<div class="list-item"><b>Pertemuan #${esc(s.session_number||"-")} — ${esc(c?.full_name||"Klien")}</b><div class="small muted">${esc(s.session_date)} • ${esc(s.focus||"Latihan")}</div></div>`;
  }).join("")||'<div class="muted small">Belum ada sesi.</div>';
}
function renderClients(){
  const q=($("clientSearch")?.value||"").toLowerCase();
  $("clientsBody").innerHTML=clients.filter(c=>c.full_name.toLowerCase().includes(q)).map(c=>{
    const used=sessions.filter(s=>s.client_id===c.id).length, total=c.total_sessions||0;
    return `<tr><td><b>${esc(c.full_name)}</b><br><span class="small muted">${esc(c.phone||"")}</span></td><td>${esc(c.package_name||"-")}</td><td>${used}/${total}</td><td>${Math.min(100,total?Math.round(used/total*100):0)}%</td><td><button class="ghost" onclick="startForClient('${c.id}')">Catat sesi</button></td></tr>`;
  }).join("")||'<tr><td colspan="5" class="muted">Belum ada klien.</td></tr>';
}
window.startForClient=id=>{ $("sessionClient").value=id; showPage("session"); };
function populateClientSelect(){
  $("sessionClient").innerHTML='<option value="">Pilih klien</option>'+clients.map(c=>`<option value="${c.id}">${esc(c.full_name)}</option>`).join("");
  $("clientUser").innerHTML='<option value="">Tidak dihubungkan</option>'+users.map(u=>`<option value="${u.id}">${esc(u.full_name||u.email)} — ${esc(u.email)}</option>`).join("");
}
$("sessionDate").value=today();
$("sessionForm").onsubmit=async e=>{
  e.preventDefault();
  const client_id=$("sessionClient").value;
  if(!client_id) return toast("Pilih klien.","error");
  const count=sessions.filter(s=>s.client_id===client_id).length+1;
  const payload={client_id,trainer_id:currentProfile.id,session_number:count,session_date:$("sessionDate").value,duration_minutes:+$("duration").value||60,weight_kg:+$("weight").value||null,waist_cm:+$("waist").value||null,body_fat_pct:+$("bodyfat").value||null,focus:$("focus").value,energy:$("energy").value,notes:$("sessionNotes").value};
  const {data,error}=await sb.from("sessions").insert(payload).select().single();
  if(error) return toast(error.message,"error");
  sessions.unshift(data); $("exerciseSessionId").value=data.id; toast("Pertemuan tersimpan.");
  $("sessionForm").reset(); $("sessionDate").value=today(); renderDashboard(); renderClients();
};
$("exerciseForm").onsubmit=async e=>{
  e.preventDefault();
  const session_id=$("exerciseSessionId").value;
  const s=sessions.find(x=>x.id===session_id);
  if(!s) return toast("Simpan sesi dulu lalu gunakan Session ID-nya.","error");
  const payload={session_id,client_id:s.client_id,trainer_id:currentProfile.id,exercise_name:$("exerciseName").value,muscle_group:$("muscle").value,weight_kg:+$("exWeight").value||null,sets:+$("sets").value||null,reps:+$("reps").value||null,rest_seconds:+$("rest").value||null,rpe:+$("rpe").value||null,notes:$("exerciseNotes").value};
  const {error}=await sb.from("exercises").insert(payload);
  if(error) return toast(error.message,"error");
  toast("Gerakan tersimpan."); $("exerciseForm").reset(); $("exerciseSessionId").value=session_id;
};
$("clientForm").onsubmit=async e=>{
  e.preventDefault();
  const payload={full_name:$("clientName").value,phone:$("clientPhone").value,goal:$("clientGoal").value,start_date:$("clientStart").value,total_sessions:+$("totalSessions").value,package_name:$("packageName").value,user_id:$("clientUser").value||null,notes:$("clientNotes").value,trainer_id:currentProfile.id};
  const {data,error}=await sb.from("clients").insert(payload).select().single();
  if(error) return toast(error.message,"error");
  clients.unshift(data); $("clientModal").classList.add("hidden"); $("clientForm").reset(); toast("Klien ditambahkan."); renderClients(); populateClientSelect(); renderDashboard();
};
function openClientModal(){ $("clientModal").classList.remove("hidden"); $("clientStart").value=today(); populateClientSelect(); }

function renderClientProgress(){
  const c=clients[0];
  if(!c){$("clientSummary").innerHTML="<p class='muted'>Akun ini belum dihubungkan ke data klien.</p>";$("mySessionsBody").innerHTML="";return;}
  $("clientSummary").innerHTML=`<div class="stats"><div class="stat"><span>Nama</span><b>${esc(c.full_name)}</b></div><div class="stat"><span>Paket</span><b>${esc(c.package_name||"-")}</b></div><div class="stat"><span>Sesi</span><b>${sessions.length}/${c.total_sessions||0}</b></div><div class="stat"><span>Goal</span><b>${esc(c.goal||"-")}</b></div></div>`;
  $("mySessionsBody").innerHTML=sessions.map(s=>`<tr><td>#${esc(s.session_number)}</td><td>${esc(s.session_date)}</td><td>${s.weight_kg?esc(s.weight_kg)+" kg":"-"}</td><td>${esc(s.focus||"-")}</td><td>${esc(s.notes||"-")}</td></tr>`).join("");
}
async function loadUsers(){
  const {data,error}=await sb.from("profiles").select("*").order("created_at",{ascending:false});
  if(error){toast(error.message,"error");return;} users=data||[];
  $("usersBody").innerHTML=users.map(u=>`<tr><td>${esc(u.full_name||"-")}</td><td>${esc(u.email||"-")}</td><td><select onchange="changeRole('${u.id}',this.value)">${["admin","trainer","client"].map(r=>`<option ${u.role===r?"selected":""}>${r}</option>`).join("")}</select></td><td><span class="pill">${esc(u.role)}</span></td></tr>`).join("");
  populateClientSelect();
}
window.changeRole=async(id,role=>{
  const {error}=await sb.from("profiles").update({role}).eq("id",id);
  if(error) toast(error.message,"error"); else {toast("Role diperbarui.");loadUsers();}
});
boot();
