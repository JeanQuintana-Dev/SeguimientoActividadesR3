# Seguimiento Diario Región 3

Tablero operativo para el seguimiento diario de PQR, HORUS, tutelas, SIAU, gestión del riesgo, red de prestadores, contratación e indicadores.

## Funciones

- Checklist por área con prioridad visual para PQR y HORUS.
- Progreso general y progreso del bloque crítico.
- Control diario con responsable, fecha límite, semáforo y acción.
- Historial compartido separado por fecha.
- Sincronización automática entre usuarios mediante PostgreSQL.
- Exportación del resumen diario e impresión.

## Desarrollo

```bash
npm install
npm run dev
```

## Despliegue en Vercel

El archivo `vercel.json` configura el proyecto como una aplicación Next.js. Al importar este repositorio en Vercel, el despliegue se realiza automáticamente.

Para activar la información compartida, conecta una base de datos Neon desde el Marketplace de Vercel y verifica que el proyecto tenga la variable de entorno `DATABASE_URL`. La tabla requerida se crea automáticamente durante la primera consulta.
