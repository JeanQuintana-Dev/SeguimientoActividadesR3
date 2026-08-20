"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "Rojo" | "Amarillo" | "Verde";
type ControlRow = { topic: string; pending: string; owner: string; deadline: string; status: Status; action: string };
type Task = { id: string; text: string };
type TaskCatalog = Record<string, Task[]>;
type Area = { id: string; number: string; title: string; subtitle: string; tone: "critical" | "standard"; items: readonly string[] };

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
const keyFor = (date:string) => `seguimiento-r3:${date}`;
const TASKS_KEY = "seguimiento-r3:catalog";

export default function Home() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Bogota" }).format(new Date());
  const [date,setDate] = useState(today);
  const [catalog,setCatalog] = useState<TaskCatalog>(initialCatalog);
  const [checked,setChecked] = useState<Record<string,boolean>>({});
  const [completionDates,setCompletionDates] = useState<Record<string,string>>({});
  const [rows,setRows] = useState<ControlRow[]>(initialRows);
  const [notes,setNotes] = useState("");
  const [openAreas,setOpenAreas] = useState<Record<string,boolean>>({ pqr:true, horus:true });
  const [saved,setSaved] = useState(false);
  const [dayHydrated,setDayHydrated] = useState(false);
  const [catalogHydrated,setCatalogHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(TASKS_KEY);
    if (stored) setCatalog(JSON.parse(stored));
    setCatalogHydrated(true);
  },[]);

  useEffect(() => {
    if (!catalogHydrated) return;
    localStorage.setItem(TASKS_KEY,JSON.stringify(catalog));
  },[catalog,catalogHydrated]);

  useEffect(() => {
    setDayHydrated(false);
    const raw = localStorage.getItem(keyFor(date));
    if (raw) {
      const data = JSON.parse(raw);
      setChecked(data.checked ?? {});
      setCompletionDates(data.completionDates ?? {});
      setRows(data.rows ?? initialRows());
      setNotes(data.notes ?? "");
    } else {
      setChecked({});
      setCompletionDates({});
      setRows(initialRows());
      setNotes("");
    }
    setDayHydrated(true);
  },[date]);

  useEffect(() => {
    if (!dayHydrated) return;
    const timer = setTimeout(() => {
      localStorage.setItem(keyFor(date),JSON.stringify({checked,completionDates,rows,notes}));
      setSaved(true);
      setTimeout(()=>setSaved(false),1200);
    },250);
    return () => clearTimeout(timer);
  },[checked,completionDates,rows,notes,date,dayHydrated]);

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
    localStorage.removeItem(keyFor(date)); setChecked({}); setCompletionDates({}); setRows(initialRows()); setNotes("");
  };

  const areaCard = (area:Area) => <AreaCard key={area.id} area={area} tasks={catalog[area.id] ?? []} checked={checked} completionDates={completionDates} selectedDate={date} setCompletionDates={setCompletionDates} toggleTask={toggleTask} addTask={addTask} removeTask={removeTask} open={openAreas[area.id]} toggle={()=>setOpenAreas(o=>({...o,[area.id]:!o[area.id]}))}/>;

  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">R3</span><div><strong>Dirección Región 3</strong><small>Bolívar · Córdoba · Sucre</small></div></div><div className="top-actions"><label className="date-control"><span>Fecha de seguimiento</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><span className={`save-state ${saved?"visible":""}`}>✓ Guardado</span></div></header>
    <section className="hero"><div className="hero-copy"><span className="eyebrow">CONTROL OPERATIVO DIARIO</span><h1>Seguimiento diario<br/><em>Región 3</em></h1><p>Una vista clara para anticipar vencimientos, remover barreras y asegurar el cierre de los compromisos más críticos.</p><div className="hero-actions"><button className="primary" onClick={()=>document.getElementById("prioridades")?.scrollIntoView({behavior:"smooth"})}>Comenzar revisión <span>↓</span></button><button className="secondary" onClick={exportSummary}>Exportar resumen</button></div></div><div className="progress-card"><div className="progress-top"><div><span>AVANCE DEL DÍA</span><strong>{completed} de {total}</strong></div><div className="progress-ring" style={{"--progress":`${progress*3.6}deg`} as React.CSSProperties}><b>{progress}%</b></div></div><div className="bar"><i style={{width:`${progress}%`}}/></div><div className="progress-meta"><span><i className="dot red"/> PQR + HORUS <b>{criticalProgress}%</b></span><span><i className="dot green"/> Guardado automático</span></div></div></section>
    <section className="priority-wrap" id="prioridades"><div className="section-heading"><div><span className="section-kicker">PRIMERO LO CRÍTICO</span><h2>PQR + HORUS</h2></div><p>Inicia siempre aquí. Puedes agregar actividades, establecer su fecha de realización o eliminar las que ya no apliquen.</p></div><div className="priority-grid">{areas.slice(0,2).map(areaCard)}</div></section>
    <section className="areas-wrap"><div className="section-heading compact"><div><span className="section-kicker">VISIÓN INTEGRAL</span><h2>Demás áreas de seguimiento</h2></div><p>Personaliza cada bloque y deja evidencia de las fechas programadas o realizadas.</p></div><div className="areas-grid">{areas.slice(2).map(areaCard)}</div></section>
    <section className="control-wrap"><div className="section-heading compact"><div><span className="section-kicker">SEMÁFORO DE GESTIÓN</span><h2>Control diario</h2></div><div className="legend"><span><i className="dot red"/> Crítico</span><span><i className="dot yellow"/> En gestión</span><span><i className="dot green"/> Al día</span></div></div><div className="control-table" role="table" aria-label="Control diario por área"><div className="control-row header" role="row"><span>Tema</span><span>Pendientes</span><span>Responsable</span><span>Fecha límite</span><span>Estado</span><span>Acción del día</span></div>{rows.map((row,index)=><div className="control-row" role="row" key={row.topic}><strong>{row.topic}</strong><input aria-label={`Pendientes de ${row.topic}`} placeholder="Ej. 12 casos" value={row.pending} onChange={e=>updateRow(index,"pending",e.target.value)}/><input aria-label={`Responsable de ${row.topic}`} placeholder="Nombre" value={row.owner} onChange={e=>updateRow(index,"owner",e.target.value)}/><input aria-label={`Fecha límite de ${row.topic}`} type="date" value={row.deadline} onChange={e=>updateRow(index,"deadline",e.target.value)}/><label className={`status-select ${row.status.toLowerCase()}`}><i className={`dot ${row.status==="Rojo"?"red":row.status==="Amarillo"?"yellow":"green"}`}/><select aria-label={`Estado de ${row.topic}`} value={row.status} onChange={e=>updateRow(index,"status",e.target.value)}><option>Rojo</option><option>Amarillo</option><option>Verde</option></select></label><input aria-label={`Acción del día para ${row.topic}`} placeholder="Próximo paso concreto" value={row.action} onChange={e=>updateRow(index,"action",e.target.value)}/></div>)}</div></section>
    <section className="notes-wrap"><div><span className="section-kicker">CIERRE DE JORNADA</span><h2>Novedades y compromisos</h2><p>Registra decisiones, alertas escaladas y compromisos que deben retomarse mañana.</p></div><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ej.: Se escaló inconsistencia de HORUS al nivel nacional. La IPS debe responder antes de las 3:00 p. m…"/></section>
    <footer><div><strong>Seguimiento diario · Región 3</strong><span>La lista de actividades y la información de cada fecha se guardan automáticamente en este dispositivo.</span></div><div className="footer-actions"><button onClick={()=>window.print()}>Imprimir</button><button className="danger" onClick={resetDay}>Limpiar fecha</button></div></footer>
  </main>;
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
