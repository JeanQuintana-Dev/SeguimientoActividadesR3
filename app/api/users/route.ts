import { NextRequest, NextResponse } from "next/server";
import { database, ensureSchema, hashPassword, randomToken, requireUser, sameOrigin } from "../_lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: NextRequest) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth;
  if (auth.user.role !== "admin") return {response:NextResponse.json({error:"Solo el administrador puede gestionar usuarios."},{status:403})};
  return auth;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if ("response" in auth) return auth.response;
    const sql = database();
    await ensureSchema(sql);
    const rows = await sql`
      SELECT id,email,name,role,active,must_change_password,created_at
      FROM seguimiento_users ORDER BY role ASC,name ASC
    `;
    return NextResponse.json({users:rows.map(row=>({
      id:String(row.id),email:String(row.email),name:String(row.name),
      role:row.role === "admin" ? "admin" : "user",active:Boolean(row.active),
      mustChangePassword:Boolean(row.must_change_password),createdAt:row.created_at,
    }))},{headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"No fue posible consultar los usuarios."},{status:500});
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({error:"Solicitud no autorizada."},{status:403});
    const auth = await requireAdmin(request);
    if ("response" in auth) return auth.response;
    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase().slice(0,254);
    const name = String(body?.name ?? "").trim().slice(0,100);
    const password = String(body?.password ?? "").slice(0,256);
    if (!email.includes("@") || !name) return NextResponse.json({error:"Ingresa un nombre y un correo válidos."},{status:400});
    if (password.length < 12) return NextResponse.json({error:"La contraseña temporal debe tener al menos 12 caracteres."},{status:400});
    const sql = database();
    await ensureSchema(sql);
    const salt = randomToken(16);
    const passwordHash = await hashPassword(password,salt);
    const id = crypto.randomUUID();
    try {
      await sql`
        INSERT INTO seguimiento_users (id,email,name,password_salt,password_hash,role,active,must_change_password)
        VALUES (${id},${email},${name},${salt},${passwordHash},'user',TRUE,TRUE)
      `;
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) return NextResponse.json({error:"Ya existe un usuario con ese correo."},{status:409});
      throw error;
    }
    await sql`INSERT INTO seguimiento_audit (user_id,action) VALUES (${auth.user.id},${`Creó el usuario ${email}`})`;
    return NextResponse.json({user:{id,email,name,role:"user",active:true,mustChangePassword:true}},{status:201});
  } catch {
    return NextResponse.json({error:"No fue posible crear el usuario."},{status:500});
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({error:"Solicitud no autorizada."},{status:403});
    const auth = await requireAdmin(request);
    if ("response" in auth) return auth.response;
    const body = await request.json();
    const id = String(body?.id ?? "");
    if (!id || id === auth.user.id) return NextResponse.json({error:"No puedes desactivar tu propia cuenta."},{status:400});
    const sql = database();
    await ensureSchema(sql);
    if (typeof body?.active === "boolean") {
      await sql`UPDATE seguimiento_users SET active=${body.active},updated_at=NOW() WHERE id=${id} AND role<>'admin'`;
      if (!body.active) await sql`DELETE FROM seguimiento_sessions WHERE user_id=${id}`;
      await sql`INSERT INTO seguimiento_audit (user_id,action) VALUES (${auth.user.id},${body.active?`Activó el usuario ${id}`:`Desactivó el usuario ${id}`})`;
      return NextResponse.json({ok:true});
    }
    const password = String(body?.password ?? "").slice(0,256);
    if (password.length < 12) return NextResponse.json({error:"La contraseña temporal debe tener al menos 12 caracteres."},{status:400});
    const salt = randomToken(16);
    const passwordHash = await hashPassword(password,salt);
    await sql`
      UPDATE seguimiento_users
      SET password_salt=${salt},password_hash=${passwordHash},must_change_password=TRUE,
          failed_attempts=0,locked_until=NULL,updated_at=NOW()
      WHERE id=${id} AND role<>'admin'
    `;
    await sql`DELETE FROM seguimiento_sessions WHERE user_id=${id}`;
    await sql`INSERT INTO seguimiento_audit (user_id,action) VALUES (${auth.user.id},${`Restableció la contraseña de ${id}`})`;
    return NextResponse.json({ok:true});
  } catch {
    return NextResponse.json({error:"No fue posible actualizar el usuario."},{status:500});
  }
}
