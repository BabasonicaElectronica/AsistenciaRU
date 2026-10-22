# Residencial Uruguay · Control de asistencia

React + TypeScript (Vite) · Supabase · publicable en Vercel o Netlify desde GitHub.

## Publicar con GitHub + Vercel
1. Crea un repositorio PRIVADO en GitHub y sube TODOS los archivos de esta carpeta
   (no subas `node_modules`, `dist` ni `.env`: ya están en `.gitignore`).
2. En Vercel: Add New > Project > importa el repositorio. Vercel detecta Vite solo
   (Build: `npm run build`, Output: `dist`).
3. Antes de pulsar Deploy, en "Environment Variables" agrega:
   - `VITE_SUPABASE_URL`  = la URL de tu proyecto de Supabase
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = la clave Publishable
4. Deploy. Cada cambio que subas a GitHub se publica solo.

`vercel.json` (y `netlify.toml`) ya incluyen la redirección que necesitan las rutas de la aplicación.

## Compilar en tu computadora (opcional)
`cp .env.example .env`, completa los dos valores, luego `npm install` y `npm run build`.

## Estructura
- `src/pages/Kiosco.tsx`: pantalla de recepción (nombre + PIN, registros y reportes personales).
- `src/pages/admin/*`: panel, horarios, asistencia, incidencias, reportes, empleados, feriados, configuración.
- `src/lib/*`: Supabase, fechas de Bolivia (UTC-4), exportación a Excel.
- Los cálculos (retrasos, horas, resúmenes) viven en la base de datos (vistas SQL), no en la aplicación.
