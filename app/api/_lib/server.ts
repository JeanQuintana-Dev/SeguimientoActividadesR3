import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "seguimiento_r3_session";
const SESSION_DAYS = 7;
const BOOTSTRAP_ADMIN = {
  id: "admin-jean-quintana",
  email: "jeanquintana.123@gmail.com",
  name: "Jean Quintana",
  salt: "065f211a06753487deb489a26c2d3ace",
  hash: "1a52ec0321b637f1a5d83a609a7bb180eb6140292409fe3b8241b7d108b9adce",
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  mustChangePassword: boolean;
};

export function database() {
  const connectionString =
    process.env.DATABASE_URL ??
    process.env.STORAGE_URL ??
    process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("DATABASE_URL_NOT_CONFIGURED");
  return neon(connectionString);
}

export async function ensureSchema(sql: ReturnType<typeof database>) {
  await sql`
    CREATE TABLE IF NOT EXISTS seguimiento_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS seguimiento_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES seguimiento_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS seguimiento_audit (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES seguimiento_users(id),
      action TEXT NOT NULL,
      board_date TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS seguimiento_region_3 (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE seguimiento_region_3 ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE seguimiento_region_3 ADD COLUMN IF NOT EXISTS updated_by TEXT`;
  await sql`
    INSERT INTO seguimiento_users (
      id,email,name,password_salt,password_hash,role,active,must_change_password
    ) VALUES (
      ${BOOTSTRAP_ADMIN.id},${BOOTSTRAP_ADMIN.email},${BOOTSTRAP_ADMIN.name},
      ${BOOTSTRAP_ADMIN.salt},${BOOTSTRAP_ADMIN.hash},'admin',TRUE,TRUE
    ) ON CONFLICT (email) DO NOTHING
  `;
  await sql`
    INSERT INTO seguimiento_region_3 (id,data,version)
    VALUES (1,'{}'::jsonb,0)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`DELETE FROM seguimiento_sessions WHERE expires_at <= NOW()`;
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map(value => value.toString(16).padStart(2,"0"))
    .join("");
}

export function randomToken(bytes = 32) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToHex(values);
}

export async function sha256(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
}

export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations:210_000,hash:"SHA-256"},
    key,
    256,
  );
  return bytesToHex(bits);
}

export function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (!forwardedHost) return false;
  return origin === `${forwardedProto}://${forwardedHost}`;
}

export async function currentUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sql = database();
  await ensureSchema(sql);
  const tokenHash = await sha256(token);
  const rows = await sql`
    SELECT u.id,u.email,u.name,u.role,u.must_change_password
    FROM seguimiento_sessions s
    JOIN seguimiento_users u ON u.id=s.user_id
    WHERE s.token_hash=${tokenHash} AND s.expires_at>NOW() AND u.active=TRUE
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    id:String(rows[0].id),
    email:String(rows[0].email),
    name:String(rows[0].name),
    role:rows[0].role === "admin" ? "admin" : "user",
    mustChangePassword:Boolean(rows[0].must_change_password),
  };
}

export async function requireUser(request: NextRequest, allowPasswordChange = false) {
  const user = await currentUser(request);
  if (!user) return {response:NextResponse.json({error:"Debes iniciar sesión."},{status:401})};
  if (user.mustChangePassword && !allowPasswordChange) {
    return {response:NextResponse.json({error:"Debes cambiar la contraseña temporal."},{status:428})};
  }
  return {user};
}

export async function createSession(userId: string) {
  const sql = database();
  const token = randomToken();
  const tokenHash = await sha256(token);
  await sql`
    INSERT INTO seguimiento_sessions (token_hash,user_id,expires_at)
    VALUES (${tokenHash},${userId},NOW()+INTERVAL '7 days')
  `;
  return token;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE,token,{
    httpOnly:true,
    secure:process.env.NODE_ENV === "production",
    sameSite:"lax",
    path:"/",
    maxAge:SESSION_DAYS*24*60*60,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"lax",path:"/",maxAge:0});
}
