import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  createSession,
  currentUser,
  database,
  ensureSchema,
  hashPassword,
  randomToken,
  requireUser,
  safeEqual,
  sameOrigin,
  SESSION_COOKIE,
  setSessionCookie,
  sha256,
} from "../_lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser(request);
    return NextResponse.json({user},{headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"No fue posible verificar la sesión."},{status:500});
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({error:"Solicitud no autorizada."},{status:403});
    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase().slice(0,254);
    const password = String(body?.password ?? "").slice(0,256);
    if (!email || !password) return NextResponse.json({error:"Ingresa el correo y la contraseña."},{status:400});

    const sql = database();
    await ensureSchema(sql);
    const rows = await sql`
      SELECT id,email,name,role,active,must_change_password,password_salt,password_hash,
             failed_attempts,locked_until
      FROM seguimiento_users WHERE email=${email} LIMIT 1
    `;
    const record = rows[0];
    const locked = record?.locked_until && new Date(String(record.locked_until)).getTime() > Date.now();
    if (!record || !record.active || locked) {
      return NextResponse.json({error:locked?"Cuenta bloqueada temporalmente. Intenta en 15 minutos.":"Correo o contraseña incorrectos."},{status:401});
    }
    const candidate = await hashPassword(password,String(record.password_salt));
    if (!safeEqual(candidate,String(record.password_hash))) {
      await sql`
        UPDATE seguimiento_users
        SET failed_attempts=failed_attempts+1,
            locked_until=CASE WHEN failed_attempts+1>=5 THEN NOW()+INTERVAL '15 minutes' ELSE locked_until END,
            updated_at=NOW()
        WHERE id=${record.id}
      `;
      return NextResponse.json({error:"Correo o contraseña incorrectos."},{status:401});
    }
    await sql`UPDATE seguimiento_users SET failed_attempts=0,locked_until=NULL,updated_at=NOW() WHERE id=${record.id}`;
    const token = await createSession(String(record.id));
    const user = {
      id:String(record.id),email:String(record.email),name:String(record.name),
      role:record.role === "admin" ? "admin" : "user",
      mustChangePassword:Boolean(record.must_change_password),
    };
    const response = NextResponse.json({user});
    setSessionCookie(response,token);
    return response;
  } catch {
    return NextResponse.json({error:"No fue posible iniciar sesión."},{status:500});
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({error:"Solicitud no autorizada."},{status:403});
    const auth = await requireUser(request,true);
    if ("response" in auth) return auth.response;
    const body = await request.json();
    const currentPassword = String(body?.currentPassword ?? "").slice(0,256);
    const newPassword = String(body?.newPassword ?? "").slice(0,256);
    if (newPassword.length < 12) return NextResponse.json({error:"La nueva contraseña debe tener al menos 12 caracteres."},{status:400});
    if (newPassword === currentPassword) return NextResponse.json({error:"La nueva contraseña debe ser diferente."},{status:400});
    const sql = database();
    const rows = await sql`SELECT password_salt,password_hash FROM seguimiento_users WHERE id=${auth.user.id}`;
    const currentHash = await hashPassword(currentPassword,String(rows[0]?.password_salt ?? ""));
    if (!rows[0] || !safeEqual(currentHash,String(rows[0].password_hash))) {
      return NextResponse.json({error:"La contraseña actual no es correcta."},{status:401});
    }
    const salt = randomToken(16);
    const passwordHash = await hashPassword(newPassword,salt);
    await sql`
      UPDATE seguimiento_users
      SET password_salt=${salt},password_hash=${passwordHash},must_change_password=FALSE,
          failed_attempts=0,locked_until=NULL,updated_at=NOW()
      WHERE id=${auth.user.id}
    `;
    await sql`INSERT INTO seguimiento_audit (user_id,action) VALUES (${auth.user.id},'Cambió su contraseña')`;
    return NextResponse.json({user:{...auth.user,mustChangePassword:false}});
  } catch {
    return NextResponse.json({error:"No fue posible cambiar la contraseña."},{status:500});
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({error:"Solicitud no autorizada."},{status:403});
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      const sql = database();
      await ensureSchema(sql);
      await sql`DELETE FROM seguimiento_sessions WHERE token_hash=${await sha256(token)}`;
    }
    const response = NextResponse.json({ok:true});
    clearSessionCookie(response);
    return response;
  } catch {
    const response = NextResponse.json({ok:true});
    clearSessionCookie(response);
    return response;
  }
}
