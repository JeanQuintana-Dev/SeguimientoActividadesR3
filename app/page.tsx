"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "Rojo" | "Amarillo" | "Verde";
type ControlRow = { topic: string; pending: string; owner: string; deadline: string; status: Status; action: string };

const areas = [
  { id:"pqr", number:"01", title:"PQR", subtitle:"Prioridad alta", tone:"critical", items:["Revisar las PQR pendientes en HORUS.","Identificar casos próximos a vencerse y vencidos.","Revisar PQR con mayor antigüedad.","Verificar responsable asignado y avance de gestión.","Dar seguimiento a casos con IPS o prestadores.","Revisar respuestas pendientes de envío y casos pendientes de cierre.","Identificar acumulación de casos por responsable.","Registrar novedades y compromisos del día."] },
  { id:"horus", number:"02", title:"Plataforma HORUS", subtitle:"Control operativo", tone:"critical", items:["Revisar funcionamiento y novedades de la plataforma.","Verificar que las gestiones estén registradas correctamente.","Revisar pendientes de asignación.","Validar casos sin gestión o con gestión incompleta.","Revisar tiempos de atención.","Identificar inconsistencias que deban escalarse.","Dar seguimiento a casos críticos o de mayor antigüedad."] },
  { id:"siau", number:"03", title:"Atención al Usuario / SIAU", subtitle:"Prevención y respuesta", tone:"standard", items:["Revisar novedades de atención.","Revisar casos pendientes de gestión.","Atender requerimientos especiales de usuarios.","Identificar casos que puedan convertirse en PQR o tutela.","Dar seguimiento a compromisos adquiridos."] },
  { id:"tutelas", number:"04", title:"Tutelas y requerimientos", subtitle:"Términos y cumplimiento", tone:"standard", items:["Revisar tutelas nuevas.","Verificar términos y responsables.","Dar seguimiento al cumplimiento.","Identificar casos con riesgo de desacato.","Revisar requerimientos de Supersalud y otras entidades."] },
  { id:"riesgo", number:"05", title:"Gestión del riesgo en salud", subtitle:"Cohortes y acceso", tone:"standard", items:["Revisar casos priorizados.","Dar seguimiento a cohortes.","Identificar casos con barreras de acceso.","Revisar usuarios con atenciones repetitivas.","Gestionar demanda inducida o articulación con prestadores."] },
  { id:"red", number:"06", title:"Red / Prestadores", subtitle:"Continuidad del servicio", tone:"standard", items:["Revisar novedades reportadas por IPS.","Identificar barreras de atención.","Revisar referencias y contrarreferencias pendientes.","Identificar servicios no disponibles.","Revisar situaciones que estén generando PQR."] },
  { id:"contratacion", number:"07", title:"Contratación", subtitle:"Gestión de prestadores", tone:"standard", items:["Revisar pendientes de prestadores.","Validar documentación.","Revisar tarifarios.","Dar seguimiento a actas y negociaciones pendientes.","Identificar novedades que afecten la prestación del servicio."] },
  { id:"indicadores", number:"08", title:"Indicadores y reportes", subtitle:"Información para decisiones", tone:"standard", items:["Revisar indicadores con comportamiento crítico.","Validar información de Power BI y HORUS.","Identificar variaciones importantes.","Registrar avances y pendientes para Comité Primario."] },
] as const;

const topics = ["PQR","HORUS","Tutelas","SIAU","Gestión del riesgo","Prestadores","Contratación","Indicadores"];
const initialRows = (): ControlRow[] => topics.map(topic => ({ topic, pending:"", owner:"", deadline:"", status:"Amarillo", action:"" }));
const keyFor = (date:string) => `seguimiento-r3:${date}`;

export default function Home() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Bogota" }).format(new Date());
  const [date,setDate] = useState(today);
  const [checked,setChecked] = useState<Record<string,boolean>>({});
  const [rows,setRows] = useState<ControlRow[]>(initialRows);
  const [notes,setNotes] = useState("");
  const [openAreas,setOpenAreas] = useState<Record<string,boolean>>({ pqr:true, horus:true });
  const [saved,setSaved] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(keyFor(date));
    if (raw) { const data = JSON.parse(raw); setChecked(data.checked ?? {}); setRows(data.rows ?? initialRows()); setNotes(data.notes ?? ""); }
    else { setChecked({}); setRows(initialRows()); setNotes(""); }
  },[date]);

  useEffect(() => {
    const timer = setTimeout(() => { localStorage.setItem(keyFor(date),JSON.stringify({checked,rows,notes})); setSaved(true); setTimeout(()=>setSaved(false),1200); },250);
    return () => clearTimeout(timer);
  },[checked,rows,notes,date]);

  const total = areas.reduce((sum,area)=>sum+area.items.length,0);
  const completed = Object.values(checked).filter(Boolean).length;
  const progress = Math.round((completed/total)*100);
  const criticalProgress = useMemo(() => {
    const critical = areas.slice(0,2); const count = critical.reduce((sum,a)=>sum+a.items.length,0);
    const done = critical.reduce((sum,a)=>sum+a.items.filter((_,i)=>checked[`${a.id}-${i}`]).length,0);
    return Math.round((done/count)*100);
  },[checked]);

  const updateRow = (index:number, field:keyof ControlRow, value:string) => setRows(current=>current.map((row,i)=>i===index?{...row,[field]:value}:row));
  const exportSummary = () => {
    const checklist = areas.map(a=>`${a.title}: ${a.items.filter((_,i)=>checked[`${a.id}-${i}`]).length}/${a.items.length}`).join("\n");
    const control = rows.map(r=>`${r.topic} | ${r.status} | Pendientes: ${r.pending||"—"} | Responsable: ${r.owner||"—"} | Acción: ${r.action||"—"}`).join("\n");
    const content = `SEGUIMIENTO DIARIO – REGIÓN 3\nFecha: ${date}\nAvance: ${progress}%\n\nCHECKLIST\n${checklist}\n\nCONTROL DIARIO\n${control}\n\nNOVEDADES Y COMPROMISOS\n${notes||"Sin novedades registradas."}`;
    const url=URL.createObjectURL(new Blob([content],{type:"text/plain;charset=utf-8"})); const a=document.createElement("a"); a.href=url; a.download=`seguimiento-region-3-${date}.txt`; a.click(); URL.revokeObjectURL(url);
  };
  const resetDay = () => { if(!window.confirm("¿Deseas borrar toda la información registrada para esta fecha?")) return; localStorage.removeItem(keyFor(date)); setChecked({}); setRows(initialRows()); setNotes(""); };

  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">R3</span><div><strong>Dirección Región 3</strong><small>Bolívar · Córdoba · Sucre</small></div></div><div className="top-actions"><label className="date-control"><span>Fecha de seguimiento</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><span className={`save-state ${saved?"visible":""}`}>✓ Guardado</span></div></header>
    <section className="hero"><div className="hero-copy"><span className="eyebrow">CONTROL OPERATIVO DIARIO</span><h1>Seguimiento diario<br/><em>Región 3</em></h1><p>Una vista clara para anticipar vencimientos, remover barreras y asegurar el cierre de los compromisos más críticos.</p><div className="hero-actions"><button className="primary" onClick={()=>document.getElementById("prioridades")?.scrollIntoView({behavior:"smooth"})}>Comenzar revisión <span>↓</span></button><button className="secondary" onClick={exportSummary}>Exportar resumen</button></div></div><div className="progress-card"><div className="progress-top"><div><span>AVANCE DEL DÍA</span><strong>{completed} de {total}</strong></div><div className="progress-ring" style={{"--progress":`${progress*3.6}deg`} as React.CSSProperties}><b>{progress}%</b></div></div><div className="bar"><i style={{width:`${progress}%`}}/></div><div className="progress-meta"><span><i className="dot red"/> PQR + HORUS <b>{criticalProgress}%</b></span><span><i className="dot green"/> Guardado automático</span></div></div></section>
    <section className="priority-wrap" id="prioridades"><div className="section-heading"><div><span className="section-kicker">PRIMERO LO CRÍTICO</span><h2>PQR + HORUS</h2></div><p>Inicia siempre aquí. Atiende vencimientos, casos antiguos y novedades de plataforma antes de continuar con las demás áreas.</p></div><div className="priority-grid">{areas.slice(0,2).map(area=><AreaCard key={area.id} area={area} checked={checked} setChecked={setChecked} open={openAreas[area.id]} toggle={()=>setOpenAreas(o=>({...o,[area.id]:!o[area.id]}))}/>)}</div></section>
    <section className="areas-wrap"><div className="section-heading compact"><div><span className="section-kicker">VISIÓN INTEGRAL</span><h2>Demás áreas de seguimiento</h2></div><p>Completa cada bloque y deja evidencia de lo revisado durante la jornada.</p></div><div className="areas-grid">{areas.slice(2).map(area=><AreaCard key={area.id} area={area} checked={checked} setChecked={setChecked} open={openAreas[area.id]} toggle={()=>setOpenAreas(o=>({...o,[area.id]:!o[area.id]}))}/>)}</div></section>
    <section className="control-wrap"><div className="section-heading compact"><div><span className="section-kicker">SEMÁFORO DE GESTIÓN</span><h2>Control diario</h2></div><div className="legend"><span><i className="dot red"/> Crítico</span><span><i className="dot yellow"/> En gestión</span><span><i className="dot green"/> Al día</span></div></div><div className="control-table" role="table" aria-label="Control diario por área"><div className="control-row header" role="row"><span>Tema</span><span>Pendientes</span><span>Responsable</span><span>Fecha límite</span><span>Estado</span><span>Acción del día</span></div>{rows.map((row,index)=><div className="control-row" role="row" key={row.topic}><strong>{row.topic}</strong><input aria-label={`Pendientes de ${row.topic}`} placeholder="Ej. 12 casos" value={row.pending} onChange={e=>updateRow(index,"pending",e.target.value)}/><input aria-label={`Responsable de ${row.topic}`} placeholder="Nombre" value={row.owner} onChange={e=>updateRow(index,"owner",e.target.value)}/><input aria-label={`Fecha límite de ${row.topic}`} type="date" value={row.deadline} onChange={e=>updateRow(index,"deadline",e.target.value)}/><label className={`status-select ${row.status.toLowerCase()}`}><i className={`dot ${row.status==="Rojo"?"red":row.status==="Amarillo"?"yellow":"green"}`}/><select aria-label={`Estado de ${row.topic}`} value={row.status} onChange={e=>updateRow(index,"status",e.target.value)}><option>Rojo</option><option>Amarillo</option><option>Verde</option></select></label><input aria-label={`Acción del día para ${row.topic}`} placeholder="Próximo paso concreto" value={row.action} onChange={e=>updateRow(index,"action",e.target.value)}/></div>)}</div></section>
    <section className="notes-wrap"><div><span className="section-kicker">CIERRE DE JORNADA</span><h2>Novedades y compromisos</h2><p>Registra decisiones, alertas escaladas y compromisos que deben retomarse mañana.</p></div><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ej.: Se escaló inconsistencia de HORUS al nivel nacional. La IPS debe responder antes de las 3:00 p. m…"/></section>
    <footer><div><strong>Seguimiento diario · Región 3</strong><span>La información se guarda automáticamente en este dispositivo y por fecha.</span></div><div className="footer-actions"><button onClick={()=>window.print()}>Imprimir</button><button className="danger" onClick={resetDay}>Limpiar fecha</button></div></footer>
  </main>;
}

function AreaCard({area,checked,setChecked,open,toggle}:{area:typeof areas[number];checked:Record<string,boolean>;setChecked:React.Dispatch<React.SetStateAction<Record<string,boolean>>>;open?:boolean;toggle:()=>void}) {
  const done=area.items.filter((_,i)=>checked[`${area.id}-${i}`]).length; const percent=Math.round((done/area.items.length)*100);
  return <article className={`area-card ${area.tone} ${open?"open":""}`}><button className="area-head" onClick={toggle} aria-expanded={!!open}><span className="area-number">{area.number}</span><span className="area-title"><small>{area.subtitle}</small><strong>{area.title}</strong></span><span className="area-progress"><b>{done}/{area.items.length}</b><i><em style={{width:`${percent}%`}}/></i></span><span className="chevron">⌄</span></button>{open&&<div className="checklist">{area.items.map((item,index)=>{const id=`${area.id}-${index}`;return <label className={checked[id]?"done":""} key={id}><input type="checkbox" checked={!!checked[id]} onChange={e=>setChecked(c=>({...c,[id]:e.target.checked}))}/><span className="fake-check">✓</span><span>{item}</span></label>})}</div>}</article>;
}
