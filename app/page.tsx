"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Status = "Rojo" | "Amarillo" | "Verde";
type ControlRow = { topic: string; pending: string; owner: string; deadline: string; status: Status; action: string };
type Task = { id: string; text: string };
type TaskCatalog = Record<string, Task[]>;
type DayState = { checked: Record<string,boolean>; completionDates: Record<string,string>; rows: ControlRow[]; notes: string };
type Area = { id: string; number: string; title: string; subtitle: string; tone: "critical" | "standard"; items: readonly string[] };
type User = { id:string; email:string; name:string; role:"admin"|"user"; mustChangePassword:boolean };
type ManagedUser = User & { active:boolean; createdAt?:string };

const areas: Area[] = [
  { id:"pqr", number:"01", title:"PQR", subtitle:"Prioridad alta", tone:"critical", items:["Revisar las PQR pendientes en HORUS.","Identificar casos próximos a vencerse y vencidos.","Revisar PQR con mayor antigüedad.","Verificar responsable asignado y avance de gestión.","Dar seguimiento a casos con IPS o prestadores.","Revisar respuestas pendientes de envío y casos pendientes de cierre.","Identificar acumulación de casos por responsable.","Registrar novedades y compromisos del día."] },
  { id:"horus", number:"02", title:"Plataforma HORUS", subtitle:"Control operativo", tone:"critical", items:["Revisar funcionamiento y novedades de la plataforma.","Verificar que las gestiones estén registradas correctamente.","Revisar pendientes de asignación.","Validar casos sin gestión o con gestión incompleta.","Revisar tiempos de atención.","Identificar inconsistencias que deban escalarse.","Dar seguimiento a casos críticos o de mayor antigüedad."] },
  { id:"siau", number:"03", title:"Atención al Usuario / SIAU", subtitle:"Prevención y respuesta", tone:"standard", items:["Revisar novedades de atención.","Revisar casos pendientes de gestión.","Atender requerimientos especiales de usuarios.","Identificar casos que puedan convertirse en PQR o tutela.","Dar seguimiento a compromisos adquiridos."] },
  { id:"tutelas", number:"04", title:"Tutelas y requerimientos", subtitle:"Términos y cumplimiento", tone:"standard", items:["Revisar tutelas nuevas.","Verificar términos y responsables.","Dar seguimiento al cumplimiento.","Identificar casos con riesgo de desacato.","Revisar requerimientos de Supersalud y otras entidades."] },
  { id:"riesgo", number:"05", title:"Gestión del riesgo en salud", subtitle:"Cohortes y acceso", tone:"standard", items:["Revisar casos priorizados.","Dar seguimiento a cohortes.","Identificar casos con barreras de acceso.","Revisar usuarios con atenciones repetitivas.","Gestionar demanda inducida o articulación con prestadores."] },
  { id:"red", number:"06", title:"Red / Prestadores", subtitle:"Continuidad del servicio", tone:"standard", items:["Revisar novedades reportadas por IPS.","Identificar barreras de atención.","Revisar referencias y contrarreferencias pendientes.","Identificar servicios no disponibles.","Revisar situaciones que estén generando PQR."] },
  { id:"contratacion", number:"07", title:"Contratación", subtitle:"Gestión de prestadores", tone:"standard", items:["Revisar pendientes de prestadores.","Validar documentación.","Revisar tarifarios.","Dar seguimiento a actas y negociaciones pendientes.","Identificar novedades que afecten la prestación del servicio."] },
  { id:"indicadores", number:"08", title:"Indicadores y reportes", subtitle:"Información para decisiones", tone:"standard", items:["Revisar indicadores con comportamiento crítico.","Validar información de Power BI y HORUS.","Identificar variaciones importantes.","Registrar avances y pendientes para Comité Primario."] },
];

const topics = ["PQR","HORUS","Tutelas","SIAU","Gestión del riesgo","Prestadores","Contratación","Indicadores"];
const initialRows = (): ControlRow[] => topics.map(topic => ({ topic, pending:"", owner:"", deadline:"", status:"Amarillo", action:"" }));
const initialCatalog = (): TaskCatalog => Object.fromEntries(areas.map(area => [area.id, area.items.map((text,index) => ({ id:`${area.id}-base-${index}`, text }))]));

export default function Home() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Bogota" }).format(new Date());
  const [date,setDate] = useState(today);
  const [catalog,setCatalog] = useState<TaskCatalog>(initialCatalog);
  const [checked,setChecked] = useState<Record<string,boolean>>({});
  const [completionDates,setCompletionDates] = useState<Record<string,string>>({});
  const [rows,setRows] = useState<ControlRow[]>(initialRows);
  const [notes,setNotes] = useState("");
  const [openAreas,setOpenAreas] = useState<Record<string,boolean>>({ pqr:true, horus:true });
  const [ready,setReady] = useState(false);
  const [saved,setSaved] = useState(false);
  const [syncError,setSyncError] = useState("");
  const [user,setUser] = useState<User|null|undefined>(undefined);
  const [showUsers,setShowUsers] = useState(false);
  const [lastUpdate,setLastUpdate] = useState<{by?:string;at?:string}>({});
  const [reloadToken,setReloadToken] = useState(0);
  const skipSave = useRef(false);
  const saving = useRef(false);
  const dirty = useRef(false);
  const version = useRef(0);

  useEffect(()=>{
    let active=true;
    fetch("/api/auth",{cache:"no-store"})
      .then(async response=>response.ok?response.json():Promise.reject())
      .then(data=>{if(active)setUser(data.user ?? null)})
      .catch(()=>{if(active)setUser(null)});
    return()=>{active=false};
  },[]);

  useEffect(() => {
    if(!user||user.mustChangePassword) return;
    let active=true;
    const load = async () => {
      if (saving.current||dirty.current) return;
      try {
        const response=await fetch(`/api/state?date=${encodeURIComponent(date)}`,{cache:"no-store"});
        if(response.status===401){setUser(null);return}
        if(!response.ok) throw new Error("No fue posible conectar la base de datos.");
        const data=await response.json();
        if(!active) return;
        skipSave.current=true;
        setCatalog(data.catalog ?? initialCatalog());
        setChecked(data.day?.checked ?? {});
        setCompletionDates(data.day?.completionDates ?? {});
        setRows(data.day?.rows ?? initialRows());
        setNotes(data.day?.notes ?? "");
        version.current=Number(data.version ?? 0);
        setLastUpdate({by:data.updatedBy ?? "",at:data.updatedAt ?? ""});
        setSyncError("");
        setSaved(true);
        setReady(true);
      } catch {
        if(!active) return;
        setSyncError("No fue posible consultar el tablero compartido");
        setReady(true);
      }
    };
    load();
    const interval=window.setInterval(load,15000);
    return()=>{active=false;window.clearInterval(interval)};
  },[date,user?.id,user?.mustChangePassword,reloadToken]);

  useEffect(() => {
    if (!ready||!user||user.mustChangePassword) return;
    if(skipSave.current){skipSave.current=false;dirty.current=false;return}
    dirty.current=true;
    setSaved(false);
    const timer = setTimeout(async () => {
      saving.current=true;
      try{
        const day:DayState={checked,completionDates,rows,notes};
        const response=await fetch("/api/state",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({catalog,date,day,version:version.current})});
        if(response.status===409){dirty.current=false;setSyncError("Otra persona actualizó el tablero; recargando…");setReloadToken(value=>value+1);return}
        if(response.status===401){setUser(null);return}
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||"Error de sincronización");
        version.current=Number(data.version ?? version.current+1);
        setLastUpdate({by:data.updatedBy ?? user.name,at:data.updatedAt ?? new Date().toISOString()});
        dirty.current=false;
        setSyncError("");
        setSaved(true);
      }catch(error){
        setSyncError(error instanceof Error?error.message:"Cambios sin sincronizar");
      }finally{
        saving.current=false;
      }
    },600);
    return () => clearTimeout(timer);
  },[catalog,checked,completionDates,rows,notes,date,ready,user]);

  const allTasks = useMemo(() => areas.flatMap(area => catalog[area.id] ?? []),[catalog]);
  const total = allTasks.length;
  const completed = allTasks.filter(task => checked[task.id]).length;
  const progress = total ? Math.round((completed/total)*100) : 0;
  const criticalProgress = useMemo(() => {
    const criticalTasks = areas.slice(0,2).flatMap(area => catalog[area.id] ?? []);
    return criticalTasks.length ? Math.round((criticalTasks.filter(task => checked[task.id]).length/criticalTasks.length)*100) : 0;
  },[checked,catalog]);

  const toggleTask = (taskId:string, value:boolean) => {
    setChecked(current => ({...current,[taskId]:value}));
    setCompletionDates(current => value && !current[taskId] ? {...current,[taskId]:date} : current);
  };

  const addTask = (areaId:string, text:string, taskDate:string) => {
    const clean = text.trim();
    if (!clean) return;
    const id = `${areaId}-custom-${Date.now()}`;
    setCatalog(current => ({...current,[areaId]:[...(current[areaId] ?? []),{id,text:clean}]}));
    if (taskDate) setCompletionDates(current => ({...current,[id]:taskDate}));
    setOpenAreas(current => ({...current,[areaId]:true}));
  };

  const removeTask = (areaId:string, taskId:string) => {
    if (!window.confirm("¿Deseas eliminar esta actividad de la lista diaria?")) return;
    setCatalog(current => ({...current,[areaId]:(current[areaId] ?? []).filter(task => task.id !== taskId)}));
    setChecked(current => { const next={...current}; delete next[taskId]; return next; });
    setCompletionDates(current => { const next={...current}; delete next[taskId]; return next; });
  };

  const updateRow = (index:number, field:keyof ControlRow, value:string) => setRows(current=>current.map((row,i)=>i===index?{...row,[field]:value}:row));
  const exportSummary = () => {
    const checklist = areas.map(area => {
      const tasks=catalog[area.id] ?? [];
      const detail=tasks.map(task => `  ${checked[task.id]?"✓":"○"} ${task.text} | Fecha: ${completionDates[task.id]||"Sin fecha"}`).join("\n");
      return `${area.title}: ${tasks.filter(task=>checked[task.id]).length}/${tasks.length}\n${detail}`;
    }).join("\n\n");
    const control = rows.map(r=>`${r.topic} | ${r.status} | Pendientes: ${r.pending||"—"} | Responsable: ${r.owner||"—"} | Acción: ${r.action||"—"}`).join("\n");
    const content = `SEGUIMIENTO DIARIO – REGIÓN 3\nFecha: ${date}\nAvance: ${progress}%\n\nCHECKLIST\n${checklist}\n\nCONTROL DIARIO\n${control}\n\nNOVEDADES Y COMPROMISOS\n${notes||"Sin novedades registradas."}`;
    const url=URL.createObjectURL(new Blob([content],{type:"text/plain;charset=utf-8"})); const a=document.createElement("a"); a.href=url; a.download=`seguimiento-region-3-${date}.txt`; a.click(); URL.revokeObjectURL(url);
  };
  const resetDay = () => {
    if(!window.confirm("¿Deseas borrar el avance, las fechas y las observaciones de esta fecha?")) return;
    setChecked({}); setCompletionDates({}); setRows(initialRows()); setNotes("");
  };

  const logout = async () => {
    await fetch("/api/auth",{method:"DELETE"});
    setUser(null);
  };

  if(user===undefined) return <div className="auth-shell"><div className="auth-card loading-card"><span className="brand-mark">R3</span><p>Preparando el tablero compartido…</p></div></div>;
  if(!user) return <LoginScreen onAuthenticated={setUser}/>;
  if(user.mustChangePassword) return <ChangePassword user={user} onChanged={setUser}/>;

  const areaCard = (area:Area) => <AreaCard key={area.id} area={area} tasks={catalog[area.id] ?? []} checked={checked} completionDates={completionDates} selectedDate={date} setCompletionDates={setCompletionDates} toggleTask={toggleTask} addTask={addTask} removeTask={removeTask} open={openAreas[area.id]} toggle={()=>setOpenAreas(o=>({...o,[area.id]:!o[area.id]}))}/>;

  return <main>
    {showUsers&&<UserManager currentUser={user} onClose={()=>setShowUsers(false)}/>}
    <header className="topbar"><div className="brand"><span className="brand-mark">R3</span><div><strong>Dirección Región 3</strong><small>Bolívar · Córdoba · Sucre</small></div></div><div className="top-actions"><label className="date-control"><span>Fecha de seguimiento</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><span className={`save-state ${saved||syncError?"visible":""} ${syncError?"sync-error":""}`}>{syncError?`⚠ ${syncError}`:"✓ Sincronizado"}</span><div className="account-menu"><span><b>{user.name}</b><small>{user.role==="admin"?"Administrador":"Usuario"}</small></span>{user.role==="admin"&&<button onClick={()=>setShowUsers(true)}>Usuarios</button>}<button onClick={logout}>Salir</button></div></div></header>
    <section className="hero"><div className="hero-copy"><span className="eyebrow">CONTROL OPERATIVO DIARIO</span><h1>Seguimiento diario<br/><em>Región 3</em></h1><p>Una vista clara para anticipar vencimientos, remover barreras y asegurar el cierre de los compromisos más críticos.</p><div className="hero-actions"><button className="primary" onClick={()=>document.getElementById("prioridades")?.scrollIntoView({behavior:"smooth"})}>Comenzar revisión <span>↓</span></button><button className="secondary" onClick={exportSummary}>Exportar resumen</button></div></div><div className="progress-card"><div className="progress-top"><div><span>AVANCE DEL DÍA</span><strong>{completed} de {total}</strong></div><div className="progress-ring" style={{"--progress":`${progress*3.6}deg`} as React.CSSProperties}><b>{progress}%</b></div></div><div className="bar"><i style={{width:`${progress}%`}}/></div><div className="progress-meta"><span><i className="dot red"/> PQR + HORUS <b>{criticalProgress}%</b></span><span><i className="dot green"/> Guardado automático</span></div></div></section>
    <section className="priority-wrap" id="prioridades"><div className="section-heading"><div><span className="section-kicker">PRIMERO LO CRÍTICO</span><h2>PQR + HORUS</h2></div><p>Inicia siempre aquí. Puedes agregar actividades, establecer su fecha de realización o eliminar las que ya no apliquen.</p></div><div className="priority-grid">{areas.slice(0,2).map(areaCard)}</div></section>
    <section className="areas-wrap"><div className="section-heading compact"><div><span className="section-kicker">VISIÓN INTEGRAL</span><h2>Demás áreas de seguimiento</h2></div><p>Personaliza cada bloque y deja evidencia de las fechas programadas o realizadas.</p></div><div className="areas-grid">{areas.slice(2).map(areaCard)}</div></section>
    <section className="control-wrap"><div className="section-heading compact"><div><span className="section-kicker">SEMÁFORO DE GESTIÓN</span><h2>Control diario</h2></div><div className="legend"><span><i className="dot red"/> Crítico</span><span><i className="dot yellow"/> En gestión</span><span><i className="dot green"/> Al día</span></div></div><div className="control-table" role="table" aria-label="Control diario por área"><div className="control-row header" role="row"><span>Tema</span><span>Pendientes</span><span>Responsable</span><span>Fecha límite</span><span>Estado</span><span>Acción del día</span></div>{rows.map((row,index)=><div className="control-row" role="row" key={row.topic}><strong>{row.topic}</strong><input aria-label={`Pendientes de ${row.topic}`} placeholder="Ej. 12 casos" value={row.pending} onChange={e=>updateRow(index,"pending",e.target.value)}/><input aria-label={`Responsable de ${row.topic}`} placeholder="Nombre" value={row.owner} onChange={e=>updateRow(index,"owner",e.target.value)}/><input aria-label={`Fecha límite de ${row.topic}`} type="date" value={row.deadline} onChange={e=>updateRow(index,"deadline",e.target.value)}/><label className={`status-select ${row.status.toLowerCase()}`}><i className={`dot ${row.status==="Rojo"?"red":row.status==="Amarillo"?"yellow":"green"}`}/><select aria-label={`Estado de ${row.topic}`} value={row.status} onChange={e=>updateRow(index,"status",e.target.value)}><option>Rojo</option><option>Amarillo</option><option>Verde</option></select></label><input aria-label={`Acción del día para ${row.topic}`} placeholder="Próximo paso concreto" value={row.action} onChange={e=>updateRow(index,"action",e.target.value)}/></div>)}</div></section>
    <section className="notes-wrap"><div><span className="section-kicker">CIERRE DE JORNADA</span><h2>Novedades y compromisos</h2><p>Registra decisiones, alertas escaladas y compromisos que deben retomarse mañana.</p></div><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ej.: Se escaló inconsistencia de HORUS al nivel nacional. La IPS debe responder antes de las 3:00 p. m…"/></section>
    <footer><div><strong>Seguimiento diario · Región 3</strong><span>Todos los usuarios autorizados ven el mismo tablero.{lastUpdate.by&&<> Último cambio: {lastUpdate.by}{lastUpdate.at?` · ${new Date(lastUpdate.at).toLocaleString("es-CO")}`:""}.</>}</span></div><div className="footer-actions"><button onClick={()=>window.print()}>Imprimir</button><button className="danger" onClick={resetDay}>Limpiar fecha</button></div></footer>
  </main>;
}

function LoginScreen({onAuthenticated}:{onAuthenticated:(user:User)=>void}) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError("");
    try{
      const response=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"No fue posible iniciar sesión.");
      onAuthenticated(data.user);
    }catch(error){setError(error instanceof Error?error.message:"No fue posible iniciar sesión.")}finally{setBusy(false)}
  };
  return <div className="auth-shell"><div className="auth-card"><div className="auth-brand"><span className="brand-mark">R3</span><div><strong>Seguimiento Diario</strong><small>Región 3 · Tablero compartido</small></div></div><span className="section-kicker">ACCESO AUTORIZADO</span><h1>Iniciar sesión</h1><p>Ingresa con tu cuenta individual. Todos los usuarios autorizados trabajan sobre el mismo tablero.</p><form onSubmit={submit}><label>Correo electrónico<input type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} required/></label><label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></label>{error&&<div className="form-error">{error}</div>}<button type="submit" disabled={busy}>{busy?"Ingresando…":"Ingresar al tablero"}</button></form></div></div>;
}

function ChangePassword({user,onChanged}:{user:User;onChanged:(user:User)=>void}) {
  const [currentPassword,setCurrentPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setError("");
    if(newPassword!==confirm){setError("Las nuevas contraseñas no coinciden.");return}
    setBusy(true);
    try{
      const response=await fetch("/api/auth",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentPassword,newPassword})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"No fue posible cambiar la contraseña.");
      onChanged(data.user);
    }catch(error){setError(error instanceof Error?error.message:"No fue posible cambiar la contraseña.")}finally{setBusy(false)}
  };
  return <div className="auth-shell"><div className="auth-card"><div className="auth-brand"><span className="brand-mark">R3</span><div><strong>Hola, {user.name}</strong><small>Protege tu cuenta antes de continuar</small></div></div><span className="section-kicker">PRIMER INGRESO</span><h1>Crea tu contraseña</h1><p>La contraseña nueva debe tener al menos 12 caracteres.</p><form onSubmit={submit}><label>Contraseña temporal<input type="password" autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)} required/></label><label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={event=>setNewPassword(event.target.value)} required/></label><label>Confirmar nueva contraseña<input type="password" autoComplete="new-password" minLength={12} value={confirm} onChange={event=>setConfirm(event.target.value)} required/></label>{error&&<div className="form-error">{error}</div>}<button type="submit" disabled={busy}>{busy?"Guardando…":"Guardar y entrar"}</button></form></div></div>;
}

function UserManager({currentUser,onClose}:{currentUser:User;onClose:()=>void}) {
  const [users,setUsers]=useState<ManagedUser[]>([]);
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const load=()=>fetch("/api/users",{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);setUsers(data.users)}).catch(error=>setError(error instanceof Error?error.message:"No fue posible cargar los usuarios."));
  useEffect(()=>{load()},[]);
  const create=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError("");
    try{const response=await fetch("/api/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,password})});const data=await response.json();if(!response.ok)throw new Error(data.error);setName("");setEmail("");setPassword("");await load()}catch(error){setError(error instanceof Error?error.message:"No fue posible crear el usuario.")}finally{setBusy(false)}
  };
  const toggle=async(item:ManagedUser)=>{
    setError("");
    try{const response=await fetch("/api/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id,active:!item.active})});const data=await response.json();if(!response.ok)throw new Error(data.error);await load()}catch(error){setError(error instanceof Error?error.message:"No fue posible actualizar el usuario.")}
  };
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Gestión de usuarios"><div className="user-modal"><div className="modal-head"><div><span className="section-kicker">ADMINISTRACIÓN</span><h2>Usuarios del tablero</h2></div><button onClick={onClose} aria-label="Cerrar">×</button></div><p>Cada persona tiene su propia cuenta, pero todos ven y actualizan el mismo tablero.</p><form className="new-user" onSubmit={create}><label>Nombre<input value={name} onChange={event=>setName(event.target.value)} required/></label><label>Correo<input type="email" value={email} onChange={event=>setEmail(event.target.value)} required/></label><label>Contraseña temporal<input type="text" minLength={12} value={password} onChange={event=>setPassword(event.target.value)} placeholder="Mínimo 12 caracteres" required/></label><button type="submit" disabled={busy}>{busy?"Creando…":"Crear usuario"}</button></form>{error&&<div className="form-error">{error}</div>}<div className="users-list">{users.map(item=><div key={item.id}><span className="user-avatar">{item.name.slice(0,1).toUpperCase()}</span><span><b>{item.name}</b><small>{item.email}{item.mustChangePassword?" · Debe cambiar contraseña":""}</small></span><em className={item.active?"active":"inactive"}>{item.active?"Activo":"Inactivo"}</em>{item.id!==currentUser.id&&item.role!=="admin"&&<button onClick={()=>toggle(item)}>{item.active?"Desactivar":"Activar"}</button>}</div>)}</div></div></div>;
}

function AreaCard({area,tasks,checked,completionDates,selectedDate,setCompletionDates,toggleTask,addTask,removeTask,open,toggle}:{area:Area;tasks:Task[];checked:Record<string,boolean>;completionDates:Record<string,string>;selectedDate:string;setCompletionDates:React.Dispatch<React.SetStateAction<Record<string,string>>>;toggleTask:(taskId:string,value:boolean)=>void;addTask:(areaId:string,text:string,date:string)=>void;removeTask:(areaId:string,taskId:string)=>void;open?:boolean;toggle:()=>void}) {
  const [newText,setNewText]=useState("");
  const [newDate,setNewDate]=useState(selectedDate);
  useEffect(()=>setNewDate(selectedDate),[selectedDate]);
  const done=tasks.filter(task=>checked[task.id]).length;
  const percent=tasks.length?Math.round((done/tasks.length)*100):0;
  const submit=(event:React.FormEvent)=>{event.preventDefault();if(!newText.trim())return;addTask(area.id,newText,newDate);setNewText("");};
  return <article className={`area-card ${area.tone} ${open?"open":""}`}>
    <button className="area-head" onClick={toggle} aria-expanded={!!open}><span className="area-number">{area.number}</span><span className="area-title"><small>{area.subtitle}</small><strong>{area.title}</strong></span><span className="area-progress"><b>{done}/{tasks.length}</b><i><em style={{width:`${percent}%`}}/></i></span><span className="chevron">⌄</span></button>
    {open&&<div className="checklist">
      {tasks.length===0&&<p className="empty-list">No hay actividades. Agrega la primera en el formulario inferior.</p>}
      {tasks.map(task=><div className={`task-row ${checked[task.id]?"done":""}`} key={task.id}>
        <label className="task-check"><input type="checkbox" checked={!!checked[task.id]} onChange={e=>toggleTask(task.id,e.target.checked)}/><span className="fake-check">✓</span><span>{task.text}</span></label>
        <label className="task-date"><span>Fecha de realización</span><input type="date" value={completionDates[task.id]??""} onChange={e=>setCompletionDates(current=>({...current,[task.id]:e.target.value}))}/></label>
        <button className="delete-task" onClick={()=>removeTask(area.id,task.id)} aria-label={`Eliminar actividad: ${task.text}`} title="Eliminar actividad">×</button>
      </div>)}
      <form className="add-task" onSubmit={submit}><div><label htmlFor={`new-${area.id}`}>Nueva actividad</label><input id={`new-${area.id}`} value={newText} onChange={e=>setNewText(e.target.value)} placeholder="Escribe el nuevo punto de seguimiento"/></div><div><label htmlFor={`new-date-${area.id}`}>Fecha</label><input id={`new-date-${area.id}`} type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}/></div><button type="submit" disabled={!newText.trim()}>＋ Agregar</button></form>
    </div>}
  </article>;
}
