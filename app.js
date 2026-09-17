// AY GYM PT Online
// 1) Put your Supabase Project URL and Publishable/Anon key below.
// 2) Run supabase-schema.sql in Supabase SQL Editor.
// Never put a Supabase service_role key in this browser app.

const RAW_SUPABASE_URL = "https://qymgxhmvpqgxgxzmldvf.supabase.co/rest/v1/";
const SUPABASE_URL = RAW_SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const SUPABASE_KEY = "sb_publishable_ffkRM6BV_Iso1s0ZbbPX0w_dOSEdiy5";

const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PASTE_") && !SUPABASE_KEY.includes("PASTE_");
const sb = (configured && typeof window !== "undefined" && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

const $ = id => document.getElementById(id);
let authMode = "login", currentUser = null, currentProfile = null;
let clients = [], sessions = [], exercises = [], users = [];

function toast(msg, type=""){ const el=$("toast"); el.textContent=msg; el.className="toast show "+type; setTimeout(()=>el.className="toast",2600); }
function today(){ return new Date().toISOString().slice(0,10); }
function esc(v){ return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }

function setAuthAlert(html, type="error"){
  const el = $("authAlert");
  if(!el) return;
  if(!html){
    el.className = "auth-alert hidden";
    el.innerHTML = "";
    return;
  }
  el.className = `auth-alert ${type}`;
  el.innerHTML = html;
}

document.querySelectorAll("[data-auth]").forEach(b=>b.onclick=()=>{
  authMode=b.dataset.auth;
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
  $("authSubmit").textContent=authMode==="login"?"Masuk":"Daftar";
  $("nameField").classList.toggle("hidden",authMode==="login");
  $("authHint").textContent=authMode==="login"
    ?"Gunakan akun yang sudah dibuat di Supabase."
    :"Setelah mendaftar, akun dapat diatur role-nya oleh Admin (Admin / Trainer / Klien).";
  setAuthAlert("");
});

$("authForm").onsubmit=async e=>{
  e.preventDefault();
  setAuthAlert("");
  if(!sb){
    setAuthAlert("Supabase belum terhubung. Periksa konfigurasi di app.js.", "error");
    toast("Supabase belum terhubung.","error");
    return;
  }
  const email=$("authEmail").value.trim(), password=$("authPassword").value;
  const name=$("authName") ? $("authName").value.trim() : "";
  const submitBtn=$("authSubmit");
  const origBtnText=submitBtn.textContent;
  submitBtn.disabled=true;
  submitBtn.textContent="Memproses...";

  try {
    if(authMode==="login"){
      const {data, error}=await sb.auth.signInWithPassword({email,password});
      if(error){
        let msg = error.message;
        if(error.message.includes("Email not confirmed")){
          msg = `<strong>⚠️ Email belum diverifikasi!</strong><br>` +
            `Supabase mewajibkan konfirmasi email. Buka email <u>${esc(email)}</u> (cek juga folder Spam) dan klik link konfirmasi.<br><br>` +
            `<small>💡 <b>Untuk Pemilik Supabase:</b> Jika ingin user langsung bisa masuk tanpa verifikasi email, buka <b>Supabase Dashboard &rarr; Authentication &rarr; Providers &rarr; Email</b> lalu matikan (disable) <b>Confirm email</b>.</small>`;
        } else if(error.message.includes("Invalid login credentials")){
          msg = "Email atau password salah. Pastikan akun sudah didaftarkan dengan benar.";
        }
        setAuthAlert(msg, "error");
        toast(error.message.includes("Email not confirmed") ? "Email belum dikonfirmasi" : "Login gagal", "error");
        return;
      }
      toast("Berhasil masuk.");
      if(data?.user) await loadUser(data.user);
    } else {
      const {data, error}=await sb.auth.signUp({
        email,
        password,
        options:{data:{full_name:name}}
      });

      if(error){
        let msg = error.message;
        if(error.message.toLowerCase().includes("rate limit")){
          msg = `<strong>⚠️ Kuota Email Supabase Terlampaui (Rate Limit)!</strong><br>` +
            `Layanan email gratis Supabase membatasi pengiriman email konfirmasi per jam.<br><br>` +
            `<strong>Solusi Terbaik & Instan:</strong><br>` +
            `1. Buka <a href="https://supabase.com/dashboard" target="_blank" style="color:var(--accent);text-decoration:underline;">Supabase Dashboard</a> proyek Anda.<br>` +
            `2. Masuk ke menu <b>Authentication &rarr; Providers &rarr; Email</b>.<br>` +
            `3. Matikan (toggle OFF) opsi <b>"Confirm email"</b> lalu klik <b>Save</b>.<br>` +
            `4. Coba daftar lagi — pendaftaran akan langsung berhasil tanpa kirim email!`;
        } else if(error.message.includes("invalid") && error.message.includes("Email")){
          msg = `Format atau domain email <u>${esc(email)}</u> tidak valid atau ditolak oleh server. Harap gunakan alamat email aktif asli (misal: <i>@gmail.com</i>).`;
        } else if(error.message.includes("User already registered")){
          msg = `Email <u>${esc(email)}</u> sudah pernah terdaftar! Silakan pindah ke tab <b>Masuk</b> untuk login.`;
        } else if(error.message.includes("Password should be at least")){
          msg = "Password minimal harus 6 karakter.";
        }
        setAuthAlert(msg, "error");
        toast("Pendaftaran gagal: " + error.message, "error");
        return;
      }

      // If Supabase has email confirmation disabled, a full session is returned immediately!
      if(data?.session){
        toast("Pendaftaran berhasil! Mengalihkan ke dashboard...", "ok");
        if(data?.user) await loadUser(data.user);
        return;
      }

      // Check if user already exists (Supabase obfuscation)
      if(data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0){
        setAuthAlert(`Email <u>${esc(email)}</u> sudah terdaftar sebelumnya. Silakan klik tab <b>Masuk</b>.`, "info");
        toast("Email sudah terdaftar. Silakan masuk.", "error");
        document.querySelector('[data-auth="login"]').click();
        return;
      }

      // Email confirmation is required by Supabase
      toast("Akun dibuat. Cek email konfirmasi.");
      document.querySelector('[data-auth="login"]').click();
      setAuthAlert(
        `<strong>✅ Pendaftaran Berhasil!</strong><br>` +
        `Link konfirmasi akun telah dikirim ke <u>${esc(email)}</u>.<br>` +
        `Silakan buka email Anda (periksa juga folder <i>Spam</i>) dan klik link verifikasi sebelum Masuk.<br><br>` +
        `<small>💡 <b>Info Admin:</b> Jika ingin pendaftaran langsung aktif tanpa cek email, buka <b>Supabase Dashboard &rarr; Authentication &rarr; Providers &rarr; Email</b> lalu nonaktifkan <b>Confirm email</b>.</small>`,
        "info"
      );
    }
  } catch(err){
    console.error("Auth error:", err);
    setAuthAlert("Terjadi kendala jaringan atau server: " + (err.message || err), "error");
    toast("Terjadi kesalahan", "error");
  } finally {
    submitBtn.disabled=false;
    submitBtn.textContent=origBtnText;
  }
};

$("logoutBtn").onclick=()=>sb?.auth.signOut();

document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
document.querySelectorAll("[data-page-jump]").forEach(b=>b.onclick=()=>showPage(b.dataset.pageJump));
$("newClientBtn").onclick=()=>openClientModal();
$("closeClient").onclick=()=>$("clientModal").classList.add("hidden");
$("clientSearch").oninput=renderClients;

async function boot(){
  if(!sb){ $("authHint").innerHTML="Belum terhubung ke Supabase. Isi konfigurasi di <b>app.js</b>."; return; }
  try {
    const {data:{session}}=await sb.auth.getSession();
    if(session) await loadUser(session.user);
    sb.auth.onAuthStateChange(async (_event,session)=>{ if(session) await loadUser(session.user); else showAuth(); });
  } catch(err) {
    console.warn("Supabase boot error:", err);
    showAuth();
  }
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
    if(c){
      const {data:s}=await sb.from("sessions").select("*").eq("client_id",c.id).order("session_date",{ascending:false});
      sessions=s||[];
      const {data:ex}=await sb.from("exercises").select("*").eq("client_id",c.id).order("created_at",{ascending:true});
      exercises=ex||[];
    } else {
      sessions=[]; exercises=[];
    }
    renderClientProgress(); renderDashboard();
  }else{
    const {data:c}=await sb.from("clients").select("*").order("created_at",{ascending:false});
    clients=c||[];
    const {data:s}=await sb.from("sessions").select("*").order("session_date",{ascending:false}).limit(150);
    sessions=s||[];
    const {data:ex}=await sb.from("exercises").select("*").order("created_at",{ascending:true}).limit(600);
    exercises=ex||[];
    renderClients(); populateClientSelect(); populateExerciseSessionSelect(); renderDashboard();
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
    const exCount=exercises.filter(x=>x.session_id===s.id).length;
    return `
      <div class="list-item" style="cursor:pointer;" onclick="viewSessionDetail('${s.id}')">
        <div class="row-between">
          <b>Pertemuan #${esc(s.session_number||"-")} — ${esc(c?.full_name||"Klien")}</b>
          <span class="tag tag-blue">${exCount} Gerakan</span>
        </div>
        <div class="small muted" style="margin-top:4px;">
          📅 ${esc(s.session_date)} • 🎯 <b>Materi:</b> ${esc(s.focus||"Latihan Rutin")}
        </div>
      </div>`;
  }).join("")||'<div class="muted small">Belum ada sesi.</div>';
}

function renderClients(){
  const q=($("clientSearch")?.value||"").toLowerCase();
  $("clientsBody").innerHTML=clients.filter(c=>c.full_name.toLowerCase().includes(q)).map(c=>{
    const clientSessions=sessions.filter(s=>s.client_id===c.id);
    const used=clientSessions.length, total=c.total_sessions||0;
    const latest=clientSessions[0];
    return `
      <tr>
        <td>
          <b>${esc(c.full_name)}</b>
          <br><span class="small muted">${esc(c.phone||"-")}</span>
          ${latest ? `<br><small class="muted">Sesi terakhir: ${esc(latest.session_date)} (${esc(latest.focus||"Latihan")})</small>` : ''}
        </td>
        <td>${esc(c.package_name||"-")}</td>
        <td><b>${used}</b> / ${total}</td>
        <td>${Math.min(100,total?Math.round(used/total*100):0)}%</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="ghost" style="padding:6px 10px;font-size:12px;" onclick="startForClient('${c.id}')">+ Catat Sesi</button>
            ${used > 0 ? `<button class="secondary" style="padding:6px 10px;font-size:12px;" onclick="viewSessionDetail('${latest.id}')">Materi Terakhir</button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join("")||'<tr><td colspan="5" class="muted">Belum ada klien.</td></tr>';
}

window.startForClient=id=>{
  $("sessionClient").value=id;
  showPage("session");
  toast("Form sesi disiapkan untuk klien ini.");
};

function populateClientSelect(){
  $("sessionClient").innerHTML='<option value="">-- Pilih Klien --</option>'+clients.map(c=>`<option value="${c.id}">${esc(c.full_name)}</option>`).join("");
  $("clientUser").innerHTML='<option value="">Tidak dihubungkan</option>'+users.map(u=>`<option value="${u.id}">${esc(u.full_name||u.email)} — ${esc(u.email)}</option>`).join("");
}

function populateExerciseSessionSelect(){
  const sel=$("exerciseSessionId");
  if(!sel) return;
  const currentVal=sel.value;
  if(!sessions.length){
    sel.innerHTML='<option value="">-- Belum ada sesi, simpan sesi dulu --</option>';
    renderActiveSessionExercises("");
    return;
  }
  sel.innerHTML='<option value="">-- Pilih Sesi untuk Mengisi Gerakan --</option>'+sessions.map(s=>{
    const c=clients.find(x=>x.id===s.client_id);
    return `<option value="${s.id}">Pertemuan #${s.session_number} - ${esc(c?.full_name||"Klien")} (${s.session_date}) - ${esc(s.focus||"Latihan")}</option>`;
  }).join("");

  if(currentVal && sessions.some(s=>s.id===currentVal)){
    sel.value=currentVal;
  } else if(sessions.length){
    sel.value=sessions[0].id;
  }
  renderActiveSessionExercises(sel.value);
}

if($("exerciseSessionId")){
  $("exerciseSessionId").onchange=function(){
    renderActiveSessionExercises(this.value);
  };
}

function renderActiveSessionExercises(sessionId){
  const container=$("exerciseList");
  const badge=$("activeSessionBadge");
  if(!container) return;
  if(!sessionId){
    container.innerHTML='<p class="small muted">Pilih atau simpan sesi pertemuan terlebih dahulu untuk mencatat gerakan.</p>';
    if(badge) badge.textContent="Pilih sesi yang sedang aktif untuk mencatat gerakan:";
    return;
  }
  const s=sessions.find(x=>x.id===sessionId);
  const c=s?clients.find(x=>x.id===s.client_id):null;
  if(badge && s){
    badge.innerHTML=`<b>Sesi Aktif:</b> Pertemuan #${s.session_number} — ${esc(c?.full_name||"Klien")} (📅 ${s.session_date} • 🎯 ${esc(s.focus||"-")})`;
  }
  const list=exercises.filter(ex=>ex.session_id===sessionId);
  if(!list.length){
    container.innerHTML='<p class="small muted">Belum ada gerakan di sesi ini. Isi formulir di atas untuk menambahkan gerakan.</p>';
    return;
  }
  container.innerHTML=list.map(ex=>`
    <div class="ex-log-row">
      <div>
        <div style="font-weight:700;font-size:14px;color:#fff;">
          ${esc(ex.exercise_name)}
          ${ex.muscle_group ? `<span class="tag tag-blue" style="margin-left:6px;">${esc(ex.muscle_group)}</span>` : ''}
        </div>
        <div class="small muted" style="margin-top:2px;">
          <b>${esc(ex.sets||0)} Set × ${esc(ex.reps||0)} Reps</b>
          ${ex.weight_kg ? `• ⚖️ ${esc(ex.weight_kg)} kg` : ''}
          ${ex.rpe ? `• 🔥 RPE ${esc(ex.rpe)}` : ''}
          ${ex.rest_seconds ? `• ⏱️ ${esc(ex.rest_seconds)}s rest` : ''}
        </div>
        ${ex.notes ? `<div class="small" style="color:#8ec0ff;margin-top:3px;">📝 <i>${esc(ex.notes)}</i></div>` : ''}
      </div>
      <button class="ghost" style="color:#ff8d8a;border-color:#5c2227;padding:5px 9px;font-size:12px;" onclick="deleteExercise('${ex.id}')">Hapus</button>
    </div>
  `).join("");
}

window.deleteExercise=async id=>{
  if(!confirm("Hapus gerakan ini dari sesi?")) return;
  const {error}=await sb.from("exercises").delete().eq("id",id);
  if(error) return toast(error.message,"error");
  exercises=exercises.filter(x=>x.id!==id);
  renderActiveSessionExercises($("exerciseSessionId").value);
  toast("Gerakan dihapus.");
};

$("sessionDate").value=today();
$("sessionForm").onsubmit=async e=>{
  e.preventDefault();
  const client_id=$("sessionClient").value;
  if(!client_id) return toast("Pilih klien terlebih dahulu.","error");
  const count=sessions.filter(s=>s.client_id===client_id).length+1;
  const focusVal=$("focus").value.trim();
  if(!focusVal) return toast("Isi materi / fokus yang dipelajari hari ini.","error");

  const payload={
    client_id,
    trainer_id:currentProfile.id,
    session_number:count,
    session_date:$("sessionDate").value,
    duration_minutes:+$("duration").value||60,
    weight_kg:+$("weight").value||null,
    waist_cm:+$("waist").value||null,
    body_fat_pct:+$("bodyfat").value||null,
    focus:focusVal,
    energy:$("energy").value,
    notes:$("sessionNotes").value.trim()
  };

  const {data,error}=await sb.from("sessions").insert(payload).select().single();
  if(error) return toast(error.message,"error");
  sessions.unshift(data);
  populateExerciseSessionSelect();
  $("exerciseSessionId").value=data.id;
  renderActiveSessionExercises(data.id);
  toast("✅ Sesi pertemuan disimpan! Sekarang silakan catat gerakan latihan di sebelah kanan.");
  $("sessionForm").reset();
  $("sessionDate").value=today();
  renderDashboard();
  renderClients();
  $("exerciseName")?.focus();
};

$("exerciseForm").onsubmit=async e=>{
  e.preventDefault();
  const session_id=$("exerciseSessionId").value;
  if(!session_id) return toast("Pilih sesi pertemuan terlebih dahulu.","error");
  const s=sessions.find(x=>x.id===session_id);
  if(!s) return toast("Sesi tidak ditemukan.","error");

  const payload={
    session_id,
    client_id:s.client_id,
    trainer_id:currentProfile.id,
    exercise_name:$("exerciseName").value.trim(),
    muscle_group:$("muscle").value.trim(),
    weight_kg:+$("exWeight").value||null,
    sets:+$("sets").value||null,
    reps:+$("reps").value||null,
    rest_seconds:+$("rest").value||null,
    rpe:+$("rpe").value||null,
    notes:$("exerciseNotes").value.trim()
  };

  const {data,error}=await sb.from("exercises").insert(payload).select().single();
  if(error) return toast(error.message,"error");
  exercises.push(data);
  toast("✅ Gerakan tersimpan.");
  $("exerciseForm").reset();
  $("exerciseSessionId").value=session_id;
  renderActiveSessionExercises(session_id);
  $("exerciseName")?.focus();
};

$("clientForm").onsubmit=async e=>{
  e.preventDefault();
  const trainerId = currentProfile?.id || currentUser?.id;
  const payload={
    full_name:$("clientName").value.trim(),
    phone:$("clientPhone").value.trim(),
    goal:$("clientGoal").value.trim(),
    start_date:$("clientStart").value,
    total_sessions:+$("totalSessions").value || 10,
    package_name:$("packageName").value.trim(),
    user_id:$("clientUser").value || null,
    notes:$("clientNotes").value.trim(),
    trainer_id:trainerId
  };
  const {data,error}=await sb.from("clients").insert(payload).select().single();
  if(error){
    console.error("Insert client error:", error);
    if(error.message && error.message.includes("row-level security")){
      toast("Izin ditolak: Akun Anda masih berstatus Klien. Role harus Trainer atau Admin untuk menambah klien.", "error");
    } else {
      toast(error.message, "error");
    }
    return;
  }
  clients.unshift(data);
  $("clientModal").classList.add("hidden");
  $("clientForm").reset();
  toast("Klien ditambahkan.");
  renderClients();
  populateClientSelect();
  renderDashboard();
};

function openClientModal(){
  $("clientModal").classList.remove("hidden");
  $("clientStart").value=today();
  populateClientSelect();
}

function renderClientProgress(){
  const c=clients[0];
  const container=$("todayLearningContainer");
  if(!c){
    $("clientSummary").innerHTML="<p class='muted'>Akun ini belum dihubungkan ke data klien oleh Admin/Trainer.</p>";
    $("mySessionsBody").innerHTML="";
    if(container) container.innerHTML="";
    return;
  }

  // Summary
  $("clientSummary").innerHTML=`
    <div class="stats">
      <div class="stat"><span>Nama Klien</span><b>${esc(c.full_name)}</b></div>
      <div class="stat"><span>Paket PT</span><b>${esc(c.package_name||"-")}</b></div>
      <div class="stat"><span>Sesi Selesai</span><b>${sessions.length} / ${c.total_sessions||0}</b></div>
      <div class="stat"><span>Target / Goal</span><b>${esc(c.goal||"-")}</b></div>
    </div>`;

  // Sorotan: Yang Dipelajari Hari Ini / Sesi Terakhir
  if(sessions.length && container){
    const latest=sessions[0];
    const latestExercises=exercises.filter(ex=>ex.session_id===latest.id);
    const isToday = latest.session_date === today();

    container.innerHTML=`
      <div class="learning-hero">
        <div class="learning-head">
          <div class="learning-title">
            <span>📘 Yang Dipelajari ${isToday ? '<span class="tag tag-today">HARI INI</span>' : '<span class="tag tag-blue">SESI TERAKHIR</span>'}</span>
          </div>
          <div class="small muted">
            Pertemuan #${esc(latest.session_number)} • 📅 ${esc(latest.session_date)} • ⏱️ ${esc(latest.duration_minutes || 60)} Menit
          </div>
        </div>

        <div style="margin-bottom:14px;">
          <div class="small muted" style="text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">🎯 Topik & Fokus Materi:</div>
          <div style="font-size:20px;font-weight:800;color:#fff;margin-top:4px;">${esc(latest.focus || "Latihan Terpadu")}</div>
        </div>

        ${latest.notes ? `
          <div class="cue-box">
            <h4>💡 Catatan & Materi Evaluasi dari PT:</h4>
            <p>${esc(latest.notes)}</p>
          </div>
        ` : `
          <div class="cue-box" style="border-left-color:#334255;">
            <h4>💡 Catatan Evaluasi PT:</h4>
            <p class="muted">Sesi berlangsung lancar. Trainer tidak meninggalkan catatan khusus.</p>
          </div>
        `}

        <div style="margin-top:18px;">
          <div class="row-between" style="margin-bottom:10px;">
            <div class="small muted" style="text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">
              🏋️ Gerakan yang Dilatih Hari Ini (${latestExercises.length} Gerakan):
            </div>
          </div>
          ${latestExercises.length ? `
            <div class="exercise-grid">
              ${latestExercises.map(ex=>`
                <div class="exercise-card">
                  <div class="row-between">
                    <h4>${esc(ex.exercise_name)}</h4>
                    ${ex.muscle_group ? `<span class="tag tag-blue">${esc(ex.muscle_group)}</span>` : ''}
                  </div>
                  <div class="ex-specs">
                    <span class="spec-badge">${esc(ex.sets||0)} Set × ${esc(ex.reps||0)} Reps</span>
                    ${ex.weight_kg ? `<span class="spec-badge">⚖️ ${esc(ex.weight_kg)} kg</span>` : ''}
                    ${ex.rpe ? `<span class="spec-badge">🔥 RPE ${esc(ex.rpe)}</span>` : ''}
                    ${ex.rest_seconds ? `<span class="spec-badge">⏱️ Rest ${esc(ex.rest_seconds)}s</span>` : ''}
                  </div>
                  ${ex.notes ? `<div class="ex-note"><b>Catatan Teknik:</b> ${esc(ex.notes)}</div>` : ''}
                </div>
              `).join("")}
            </div>
          ` : `
            <p class="small muted" style="margin-top:8px;">Belum ada rincian gerakan latihan yang dimasukkan untuk sesi ini.</p>
          `}
        </div>

        <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--line);display:flex;gap:15px;flex-wrap:wrap;font-size:13px;color:var(--muted);">
          ${latest.weight_kg ? `<span>⚖️ Berat: <b>${esc(latest.weight_kg)} kg</b></span>` : ''}
          ${latest.waist_cm ? `<span>📏 Pinggang: <b>${esc(latest.waist_cm)} cm</b></span>` : ''}
          ${latest.body_fat_pct ? `<span>📊 Body Fat: <b>${esc(latest.body_fat_pct)}%</b></span>` : ''}
          ${latest.energy ? `<span>⚡ Energi: <b>${esc(latest.energy)}</b></span>` : ''}
        </div>
      </div>
    `;
  } else if(container) {
    container.innerHTML='<div class="card" style="margin-bottom:16px;"><p class="muted">Belum ada sesi latihan yang tercatat. Sesi yang dicatat oleh Trainer akan muncul di sini.</p></div>';
  }

  // Riwayat seluruh pertemuan
  $("mySessionsBody").innerHTML=sessions.map(s=>{
    const sExercises=exercises.filter(ex=>ex.session_id===s.id);
    return `
      <tr>
        <td><b>#${esc(s.session_number)}</b></td>
        <td>${esc(s.session_date)}</td>
        <td>${s.weight_kg ? esc(s.weight_kg)+" kg" : "-"}</td>
        <td>
          <b>${esc(s.focus||"-")}</b>
          ${s.notes ? `<br><small class="muted">${esc(s.notes.length > 50 ? s.notes.slice(0,50)+'...' : s.notes)}</small>` : ''}
        </td>
        <td><span class="tag tag-blue">${sExercises.length} Gerakan</span></td>
        <td>
          <button class="primary" style="padding:6px 12px;font-size:12px;" onclick="viewSessionDetail('${s.id}')">Lihat Rincian</button>
        </td>
      </tr>`;
  }).join("")||'<tr><td colspan="6" class="muted">Belum ada sesi.</td></tr>';
}

window.viewSessionDetail=sessionId=>{
  const s=sessions.find(x=>x.id===sessionId);
  if(!s) return toast("Sesi tidak ditemukan.","error");
  const c=clients.find(x=>x.id===s.client_id)||clients[0];
  const sExercises=exercises.filter(ex=>ex.session_id===s.id);
  const modal=$("sessionDetailModal");
  const title=$("detailModalTitle");
  const content=$("detailModalContent");

  title.textContent=`Pertemuan #${s.session_number} — ${c?.full_name||"Klien"} (${s.session_date})`;
  content.innerHTML=`
    <div style="margin-bottom:16px;">
      <div class="small muted" style="text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">🎯 Materi & Fokus Pembelajaran:</div>
      <div style="font-size:18px;font-weight:800;color:#fff;margin-top:4px;">${esc(s.focus||"Latihan Rutin")}</div>
    </div>

    ${s.notes ? `
      <div class="cue-box">
        <h4>💡 Catatan & Evaluasi Materi dari Trainer:</h4>
        <p>${esc(s.notes)}</p>
      </div>
    ` : ''}

    <div style="margin:16px 0;">
      <h3 style="font-size:15px;margin:0 0 10px;color:#9ec8ff;">🏋️ Gerakan yang Dipelajari (${sExercises.length} Gerakan):</h3>
      ${sExercises.length ? `
        <div class="exercise-grid">
          ${sExercises.map(ex=>`
            <div class="exercise-card">
              <div class="row-between">
                <h4>${esc(ex.exercise_name)}</h4>
                ${ex.muscle_group ? `<span class="tag tag-blue">${esc(ex.muscle_group)}</span>` : ''}
              </div>
              <div class="ex-specs">
                <span class="spec-badge">${esc(ex.sets||0)} Set × ${esc(ex.reps||0)} Reps</span>
                ${ex.weight_kg ? `<span class="spec-badge">⚖️ ${esc(ex.weight_kg)} kg</span>` : ''}
                ${ex.rpe ? `<span class="spec-badge">🔥 RPE ${esc(ex.rpe)}</span>` : ''}
                ${ex.rest_seconds ? `<span class="spec-badge">⏱️ Rest ${esc(ex.rest_seconds)}s</span>` : ''}
              </div>
              ${ex.notes ? `<div class="ex-note"><b>Catatan Teknik:</b> ${esc(ex.notes)}</div>` : ''}
            </div>
          `).join("")}
        </div>
      ` : `
        <p class="small muted">Tidak ada rincian gerakan latihan yang dicatat untuk sesi ini.</p>
      `}
    </div>

    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">
      <div class="stat" style="padding:10px;"><span>Durasi</span><b>${esc(s.duration_minutes||60)} mnt</b></div>
      <div class="stat" style="padding:10px;"><span>Kondisi/Energi</span><b>${esc(s.energy||"-")}</b></div>
      <div class="stat" style="padding:10px;"><span>Berat Badan</span><b>${s.weight_kg ? esc(s.weight_kg)+" kg" : "-"}</b></div>
      <div class="stat" style="padding:10px;"><span>Lingkar Pinggang</span><b>${s.waist_cm ? esc(s.waist_cm)+" cm" : "-"}</b></div>
    </div>
  `;

  modal.classList.remove("hidden");
};

if($("closeDetailModal")){
  $("closeDetailModal").onclick=()=>$("sessionDetailModal").classList.add("hidden");
}
window.addEventListener("click",e=>{
  if(e.target===$("sessionDetailModal")) $("sessionDetailModal").classList.add("hidden");
});

async function loadUsers(){
  const {data,error}=await sb.from("profiles").select("*").order("created_at",{ascending:false});
  if(error){toast(error.message,"error");return;} users=data||[];
  $("usersBody").innerHTML=users.map(u=>`<tr><td>${esc(u.full_name||"-")}</td><td>${esc(u.email||"-")}</td><td><select onchange="changeRole('${u.id}',this.value)">${["admin","trainer","client"].map(r=>`<option ${u.role===r?"selected":""}>${r}</option>`).join("")}</select></td><td><span class="pill">${esc(u.role)}</span></td></tr>`).join("");
  populateClientSelect();
}
window.changeRole=async(id,role)=>{
  const {error}=await sb.from("profiles").update({role}).eq("id",id);
  if(error) toast(error.message,"error"); else {toast("Role diperbarui.");loadUsers();}
};
boot();
