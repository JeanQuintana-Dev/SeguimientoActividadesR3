import { NextRequest, NextResponse } from "next/server";
import { database, ensureSchema, requireUser, sameOrigin } from "../_lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SharedDocument = {
  catalog?: Record<string,Array<{id:string;text:string}>>;
  days?: Record<string,unknown>;
};

export async function GET(request:NextRequest) {
  try{
    const auth=await requireUser(request);
    if("response" in auth) return auth.response;
    const sql=database();
    await ensureSchema(sql);
    const date=request.nextUrl.searchParams.get("date") ?? "";
    const rows=await sql`
      SELECT b.data,b.updated_at,b.version,u.name AS updated_by
      FROM seguimiento_region_3 b
      LEFT JOIN seguimiento_users u ON u.id=b.updated_by
      WHERE b.id=1
    `;
    const document=(rows[0]?.data ?? {}) as SharedDocument;
    return NextResponse.json({
      catalog:document.catalog ?? null,
      day:date ? document.days?.[date] ?? null : null,
      updatedAt:rows[0]?.updated_at ?? null,
      updatedBy:rows[0]?.updated_by ?? null,
      version:Number(rows[0]?.version ?? 0),
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const missing=error instanceof Error&&error.message==="DATABASE_URL_NOT_CONFIGURED";
    return NextResponse.json({error:missing?"La base de datos aún no está conectada.":"No fue posible consultar la información compartida."},{status:missing?503:500});
  }
}

export async function PUT(request:NextRequest) {
  try{
    if(!sameOrigin(request)) return NextResponse.json({error:"Solicitud no autorizada."},{status:403});
    const auth=await requireUser(request);
    if("response" in auth) return auth.response;
    const body=await request.json();
    if(!body||typeof body!=="object"||typeof body.date!=="string"||!body.day||!body.catalog||!Number.isInteger(body.version)){
      return NextResponse.json({error:"Información incompleta."},{status:400});
    }
    const serialized=JSON.stringify(body);
    if(serialized.length>1_500_000) return NextResponse.json({error:"La información supera el tamaño permitido."},{status:413});
    const sql=database();
    await ensureSchema(sql);
    const result=await sql`
      UPDATE seguimiento_region_3
      SET data=jsonb_set(
            jsonb_set(COALESCE(data,'{}'::jsonb),'{catalog}',${JSON.stringify(body.catalog)}::jsonb,TRUE),
            '{days}',
            COALESCE(data->'days','{}'::jsonb) || jsonb_build_object(${body.date}::text,${JSON.stringify(body.day)}::jsonb),
            TRUE
          ),
          version=version+1,
          updated_at=NOW(),
          updated_by=${auth.user.id}
      WHERE id=1 AND version=${body.version}
      RETURNING updated_at,version
    `;
    if(!result[0]) return NextResponse.json({error:"Otra persona actualizó el tablero. Recarga para ver los cambios."},{status:409});
    await sql`INSERT INTO seguimiento_audit (user_id,action,board_date) VALUES (${auth.user.id},'Actualizó el tablero compartido',${body.date})`;
    return NextResponse.json({ok:true,updatedAt:result[0].updated_at,updatedBy:auth.user.name,version:Number(result[0].version)});
  }catch(error){
    console.error("No fue posible guardar el tablero compartido.",error);
    const missing=error instanceof Error&&error.message==="DATABASE_URL_NOT_CONFIGURED";
    return NextResponse.json({error:missing?"La base de datos aún no está conectada.":"No fue posible guardar los cambios."},{status:missing?503:500});
  }
}
