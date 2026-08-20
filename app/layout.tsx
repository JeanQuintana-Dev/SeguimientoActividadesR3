import type { Metadata } from "next";
import "./globals.css";
const productionHost=process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const metadata:Metadata={metadataBase:productionHost?new URL(`https://${productionHost}`):undefined,title:"Seguimiento Diario Región 3",description:"Tablero diario para el seguimiento de PQR, HORUS y la gestión operativa de la Región 3.",openGraph:{title:"Seguimiento Diario Región 3",description:"PQR · HORUS · Control operativo",type:"website",images:[{url:"/og.png",width:1200,height:630,alt:"Seguimiento Diario Región 3"}]},twitter:{card:"summary_large_image",title:"Seguimiento Diario Región 3",description:"PQR · HORUS · Control operativo",images:["/og.png"]},icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="es"><body>{children}</body></html>}
