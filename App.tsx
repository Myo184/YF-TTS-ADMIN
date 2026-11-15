import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity, AudioWaveform, Bell, Check, ChevronDown, CircleHelp, Crown,
  ExternalLink, Image as ImageIcon, LayoutDashboard, LogOut, Menu, Pencil,
  Plus, RefreshCw, Search, Settings, ShieldCheck, Trash2, Upload, Users,
  X, Zap
} from 'lucide-react'
import { configReady, supabase } from './supabase'

type Section = 'Dashboard' | 'Users' | 'Slider Manager' | 'VIP' | 'App Settings'
type Slider = {
  id: string; title: string; description: string; image_path: string;
  target_url: string; is_active: boolean; sort_order: number
}
type Profile = {
  id: string; email?: string | null; display_name?: string | null;
  plan?: string | null; account_status?: string | null; created_at?: string | null;
  vip_expires_at?: string | null
}
const nav = [
  { name: 'Dashboard' as const, icon: LayoutDashboard },
  { name: 'Users' as const, icon: Users },
  { name: 'Slider Manager' as const, icon: ImageIcon },
  { name: 'VIP' as const, icon: Crown },
  { name: 'App Settings' as const, icon: Settings },
]
const bucket = 'yf-admin-media'

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [admin, setAdmin] = useState(false)
  const [checking, setChecking] = useState(true)
  const [section, setSection] = useState<Section>('Dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sliders, setSliders] = useState<Slider[]>([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Slider | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({title:'', description:'', target_url:'', is_active:true, sort_order:0})
  const [image, setImage] = useState<File | null>(null)
  const [settings, setSettings] = useState({announcementEnabled:false, announcementTitle:'', announcementMessage:'', maintenanceEnabled:false, maintenanceMessage:'We will be back soon.'})

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({data}) => {
      if (alive) { setSession(data.session); setChecking(false) }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next); setAdmin(false)
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (session?.user) void checkAdmin()
    else { setAdmin(false); setChecking(false) }
  }, [session?.user?.id])

  async function checkAdmin() {
    setChecking(true); setError('')
    const {data, error: e} = await supabase.from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle()
    if (e) setError(`Admin access check failed: ${e.message}. Run supabase/setup.sql and add this account to admin_users.`)
    setAdmin(Boolean(data?.user_id)); setChecking(false)
  }

  async function login(e: FormEvent) {
    e.preventDefault(); setError('')
    const {error: e1} = await supabase.auth.signInWithPassword({email:email.trim(), password})
    if (e1) setError(e1.message)
  }
  async function logout() { await supabase.auth.signOut(); setProfiles([]); setSliders([]) }

  async function loadData() {
    if (!admin) return
    setRefreshing(true); setError('')
    const [p, s, a, m] = await Promise.all([
      supabase.from('profiles').select('id,email,display_name,plan,account_status,created_at,vip_expires_at').order('created_at',{ascending:false}).limit(500),
      supabase.from('app_sliders').select('*').order('sort_order',{ascending:true}),
      supabase.from('app_settings').select('setting_value').eq('setting_key','announcement').maybeSingle(),
      supabase.from('app_settings').select('setting_value').eq('setting_key','maintenance').maybeSingle()
    ])
    if (p.error) setError(`Users: ${p.error.message}`)
    else setProfiles((p.data || []) as Profile[])
    if (s.error) setError(`Sliders: ${s.error.message}`)
    else setSliders((s.data || []) as Slider[])
    const av = a.data?.setting_value as any
    const mv = m.data?.setting_value as any
    setSettings({
      announcementEnabled: Boolean(av?.enabled), announcementTitle: av?.title || '', announcementMessage: av?.message || '',
      maintenanceEnabled: Boolean(mv?.enabled), maintenanceMessage: mv?.message || 'We will be back soon.'
    })
    setRefreshing(false)
  }

  useEffect(() => { if (admin) void loadData() }, [admin])

  const filtered = useMemo(() => profiles.filter(p => `${p.email||''} ${p.display_name||''} ${p.id}`.toLowerCase().includes(search.toLowerCase())), [profiles, search])
  const vipCount = profiles.filter(p => (p.plan||'').toLowerCase()==='vip').length

  function openNew() {
    setEditing(null); setImage(null); setForm({title:'',description:'',target_url:'',is_active:true,sort_order:sliders.length}); setModal(true)
  }
  function openEdit(s: Slider) {
    setEditing(s); setImage(null); setForm({title:s.title,description:s.description,target_url:s.target_url,is_active:s.is_active,sort_order:s.sort_order}); setModal(true)
  }
  async function saveSlider(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      let imagePath = editing?.image_path || ''
      if (image) {
        const safe = image.name.toLowerCase().replace(/[^a-z0-9.-]/g,'-')
        imagePath = `${crypto.randomUUID()}-${safe}`
        const {error: uploadError} = await supabase.storage.from(bucket).upload(imagePath,image,{upsert:false,contentType:image.type})
        if (uploadError) throw uploadError
      }
      if (!imagePath) throw new Error('Please select a slider image.')
      const payload = {...form, image_path:imagePath, updated_at:new Date().toISOString()}
      const result = editing
        ? await supabase.from('app_sliders').update(payload).eq('id',editing.id)
        : await supabase.from('app_sliders').insert(payload)
      if (result.error) throw result.error
      setModal(false); setNotice('Slider saved.'); await loadData()
    } catch (e:any) { setError(e.message || 'Could not save slider.') }
    finally { setSaving(false) }
  }
  async function deleteSlider(s: Slider) {
    if (!confirm(`Delete slider "${s.title}"?`)) return
    const {error:e} = await supabase.from('app_sliders').delete().eq('id',s.id)
    if (e) setError(e.message)
    else { await supabase.storage.from(bucket).remove([s.image_path]); setNotice('Slider deleted.'); await loadData() }
  }
  async function toggleSlider(s: Slider) {
    const {error:e} = await supabase.from('app_sliders').update({is_active:!s.is_active}).eq('id',s.id)
    if (e) setError(e.message); else await loadData()
  }
  async function saveSettings() {
    setSaving(true); setError('')
    const writes = await Promise.all([
      supabase.from('app_settings').upsert({setting_key:'announcement',setting_value:{enabled:settings.announcementEnabled,title:settings.announcementTitle,message:settings.announcementMessage},updated_at:new Date().toISOString()}),
      supabase.from('app_settings').upsert({setting_key:'maintenance',setting_value:{enabled:settings.maintenanceEnabled,message:settings.maintenanceMessage},updated_at:new Date().toISOString()})
    ])
    const failure = writes.find(x=>x.error)?.error
    if (failure) setError(failure.message); else setNotice('App settings saved.')
    setSaving(false)
  }

  if (!configReady) return <SetupNotice />
  if (checking) return <div className="center-screen"><div className="spinner"/><p>Checking secure access…</p></div>
  if (!session) return <main className="login-wrap"><div className="login-card"><div className="brand-mark"><AudioWaveform/></div><p className="eyebrow">CONTROL CENTER</p><h1>YF TTS Studio</h1><p className="muted">Sign in to your administrator account.</p><form onSubmit={login} className="stack"><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="admin@example.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Your password"/></label><button className="primary full">Sign in <ShieldCheck size={16}/></button></form>{error&&<div className="alert error">{error}</div>}<p className="tiny muted">Access is restricted to accounts listed in the Supabase admin_users table.</p></div></main>
  if (!admin) return <main className="center-screen"><div className="login-card"><ShieldCheck size={34}/><h2>Admin access required</h2><p className="muted">This account is signed in but is not registered as an administrator.</p>{error&&<div className="alert error">{error}</div>}<button className="secondary full" onClick={logout}>Sign out</button></div></main>

  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen?'open':''}`}>
      <div className="brand"><div className="brand-mark small"><AudioWaveform/></div><div><b>YF TTS STUDIO</b><span>ADMIN CONSOLE</span></div></div>
      <div className="nav-label">WORKSPACE</div>
      {nav.map(item=><button key={item.name} className={`nav-item ${section===item.name?'selected':''}`} onClick={()=>{setSection(item.name);setSidebarOpen(false)}}><item.icon size={18}/>{item.name}{section===item.name&&<span className="nav-dot"/>}</button>)}
      <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={16}/><span>Protected by Supabase Auth & RLS</span></div><button className="nav-item" onClick={logout}><LogOut size={18}/>Sign out</button></div>
    </aside>
    {sidebarOpen&&<div className="scrim" onClick={()=>setSidebarOpen(false)}/>}
    <main className="main">
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setSidebarOpen(!sidebarOpen)}><Menu/></button><div><p className="eyebrow">YF TTS STUDIO / ADMIN</p><h2>{section}</h2></div><div className="top-actions"><button className="secondary refresh" onClick={()=>void loadData()} disabled={refreshing}><RefreshCw size={15} className={refreshing?'spin':''}/> Refresh</button><div className="avatar">{(session.user.email||'A')[0].toUpperCase()}</div></div></header>
      {error&&<div className="alert error"><X size={16}/>{error}</div>}{notice&&<div className="alert success"><Check size={16}/>{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
      {section==='Dashboard'&&<><div className="welcome"><div><p className="eyebrow">OVERVIEW</p><h1>Good to see you, Admin.</h1><p className="muted">Your app control center. Data updates only when you refresh.</p></div><button className="primary" onClick={()=>void loadData()}><RefreshCw size={16}/> Refresh data</button></div><div className="stat-grid"><Stat icon={<Users/>} label="Registered profiles" value={profiles.length} tone="purple"/><Stat icon={<Crown/>} label="VIP profiles" value={vipCount} tone="gold"/><Stat icon={<ImageIcon/>} label="Slider campaigns" value={sliders.length} tone="blue"/><Stat icon={<Activity/>} label="Active sliders" value={sliders.filter(s=>s.is_active).length} tone="green"/></div><div className="panel"><div className="panel-head"><div><h3>Recent users</h3><p className="muted">Latest profiles returned by Supabase</p></div><button className="text-btn" onClick={()=>setSection('Users')}>View all <ExternalLink size={14}/></button></div><UserTable users={profiles.slice(0,6)}/></div></>}
      {section==='Users'&&<div className="panel"><div className="panel-head"><div><h3>User accounts</h3><p className="muted">Showing up to 500 profile records</p></div><div className="search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, email or ID"/></div></div><UserTable users={filtered}/></div>}
      {section==='Slider Manager'&&<div className="panel"><div className="panel-head"><div><h3>Home screen sliders</h3><p className="muted">Manage banners and the URL opened when a user taps them.</p></div><button className="primary" onClick={openNew}><Plus size={16}/> Add slider</button></div>{sliders.length===0?<Empty icon={<ImageIcon/>} title="No sliders yet" desc="Add your first promotional banner."/ >:<div className="slider-grid">{sliders.map(s=>{const {data}=supabase.storage.from(bucket).getPublicUrl(s.image_path);return <article className="slider-card" key={s.id}><img src={data.publicUrl} alt={s.title}/><div className="slider-content"><div className="row-between"><b>{s.title}</b><span className={`pill ${s.is_active?'green':'gray'}`}>{s.is_active?'Visible':'Hidden'}</span></div><p className="muted clamp">{s.description||'No description'}</p><a className="url" href={s.target_url} target="_blank" rel="noreferrer">{s.target_url}<ExternalLink size={12}/></a><div className="card-actions"><button className="secondary" onClick={()=>openEdit(s)}><Pencil size={14}/> Edit</button><button className="secondary" onClick={()=>void toggleSlider(s)}>{s.is_active?'Hide':'Show'}</button><button className="danger-ghost" onClick={()=>void deleteSlider(s)}><Trash2 size={14}/></button></div></div></article>})}</div>}</div>}
      {section==='VIP'&&<div className="panel"><div className="panel-head"><div><h3>VIP overview</h3><p className="muted">VIP status is read from profiles.plan. Payment approval workflow is not enabled in this starter.</p></div></div><div className="stat-grid compact"><Stat icon={<Crown/>} label="VIP profiles" value={vipCount} tone="gold"/><Stat icon={<Users/>} label="Free profiles" value={Math.max(0,profiles.length-vipCount)} tone="purple"/></div><UserTable users={profiles.filter(p=>(p.plan||'').toLowerCase()==='vip')}/></div>}
      {section==='App Settings'&&<div className="panel settings-panel"><div><h3>Announcements</h3><p className="muted">Saved to Supabase. The mobile app must read these settings to display them.</p></div><Toggle label="Enable announcement" checked={settings.announcementEnabled} onChange={v=>setSettings({...settings,announcementEnabled:v})}/><label>Announcement title<input value={settings.announcementTitle} onChange={e=>setSettings({...settings,announcementTitle:e.target.value})}/></label><label>Announcement message<textarea rows={3} value={settings.announcementMessage} onChange={e=>setSettings({...settings,announcementMessage:e.target.value})}/></label><hr/><h3>Maintenance mode</h3><Toggle label="Enable maintenance mode" checked={settings.maintenanceEnabled} onChange={v=>setSettings({...settings,maintenanceEnabled:v})}/><label>Maintenance message<textarea rows={2} value={settings.maintenanceMessage} onChange={e=>setSettings({...settings,maintenanceMessage:e.target.value})}/></label><button className="primary" onClick={()=>void saveSettings()} disabled={saving}>{saving?'Saving…':'Save settings'}</button></div>}
    </main>
    {modal&&<div className="modal-backdrop"><form className="modal" onSubmit={saveSlider}><div className="panel-head"><div><h3>{editing?'Edit slider':'Create slider'}</h3><p className="muted">Image, content and destination link</p></div><button type="button" className="icon-btn" onClick={()=>setModal(false)}><X/></button></div><label>Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label><label>Description<textarea rows={2} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>Destination URL<input required type="url" placeholder="https://example.com/promotion" value={form.target_url} onChange={e=>setForm({...form,target_url:e.target.value})}/></label><label>Banner image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setImage(e.target.files?.[0]||null)} required={!editing}/><span className="tiny muted">PNG, JPG or WebP · maximum 5 MB</span></label><label>Display order<input type="number" value={form.sort_order} onChange={e=>setForm({...form,sort_order:Number(e.target.value)})}/></label><Toggle label="Visible in app" checked={form.is_active} onChange={v=>setForm({...form,is_active:v})}/><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancel</button><button className="primary" disabled={saving}>{saving?'Saving…':'Save slider'}</button></div></form></div>}
  </div>
}

function Stat({icon,label,value,tone}:{icon:any,label:string,value:number,tone:string}) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><p className="muted">{label}</p><strong>{value.toLocaleString()}</strong></div></div>
}
function UserTable({users}:{users:Profile[]}) {
  if (!users.length) return <Empty icon={<Users/>} title="No users found" desc="No profile records were returned."/>
  return <div className="table-wrap"><table><thead><tr><th>USER</th><th>PLAN</th><th>STATUS</th><th>REGISTERED</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><b>{u.display_name||'Unnamed user'}</b><small>{u.email||u.id}</small></td><td><span className={`pill ${(u.plan||'free').toLowerCase()==='vip'?'gold':'gray'}`}>{u.plan||'FREE'}</span></td><td>{u.account_status||'active'}</td><td>{u.created_at?new Date(u.created_at).toLocaleDateString():'—'}</td></tr>)}</tbody></table></div>
}
function Empty({icon,title,desc}:{icon:any,title:string,desc:string}) { return <div className="empty">{icon}<b>{title}</b><p>{desc}</p></div> }
function Toggle({label,checked,onChange}:{label:string,checked:boolean,onChange:(v:boolean)=>void}) { return <label className="toggle-row"><span>{label}</span><button type="button" role="switch" aria-checked={checked} className={`switch ${checked?'on':''}`} onClick={()=>onChange(!checked)}><i/></button></label> }
function SetupNotice() { return <main className="center-screen"><div className="login-card"><div className="brand-mark"><Zap/></div><h2>Connect your Supabase project</h2><p className="muted">Create a <code>.env</code> file from <code>.env.example</code> and add your Supabase URL and publishable key. Do not use a service-role key here.</p></div></main> }
