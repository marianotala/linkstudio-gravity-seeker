# Seeker — Point of Interest Intelligence

Producto de **Gravity (Link Studio)** para equipos de venta y account
management en programmatic advertising y drive-to-store (México/LATAM).

Seeker encuentra puntos de interés alrededor de los PDVs de un cliente,
explora categorías de negocio por ciudad/zona, censa la presencia de una
marca en una ciudad completa, y exporta coordenadas y geocercas
poligonales (GeoJSON) listas para cargar en DSPs: Simpli.fi, Eskimi y
DV360.

## Funcionalidad

- **Por orígenes**: carga PDVs por direcciones, coordenadas o Excel/CSV
  (detección automática de columnas), geocodificación batch, y búsqueda
  de 20 categorías o "solo por nombre" alrededor de cada origen.
- **Por zona**: explora una ciudad o colonia con searchText paginado.
- **Censo de marca**: cuadrícula hexagonal o cuadrada de celdas
  (radio 1–3 km) que cubre un alcance configurable; corre una llamada
  por celda en serie con throttle de 250 ms, deduplica por place_id y
  muestra progreso en vivo. Pide confirmación antes de ejecutar
  (control de costos).
- **Filtros**: filtro estricto de nombre normalizado sin acentos y
  exclusiones de marcas tipo tags (sobre nombre + types).
- **Exports** (client-side): `seeker_pois.csv`,
  `seeker_pois_puntos.geojson`, `seeker_geocercas_pois.geojson`
  (polígono circular por POI con radio y vértices configurables) y
  `seeker_radios_origen.geojson`.
- **Auth y datos**: login email+password (Supabase, sin registro
  público), historial de búsquedas con re-export sin llamar a Google,
  duplicado de parámetros, y límites de uso diario por usuario.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · react-leaflet (tiles
CARTO dark) · Supabase (auth + Postgres con RLS) · Google Geocoding API
y Places API (New), solo del lado servidor.

## Variables de entorno

| Variable | Dónde vive | Descripción |
|---|---|---|
| `GOOGLE_MAPS_KEY` | **Solo servidor** | API key de Google con Geocoding API y Places API (New) habilitadas. El cliente nunca la recibe: todas las llamadas a Google pasan por `/app/api/*`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + servidor | URL del proyecto de Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente + servidor | Anon key pública; el acceso a datos lo controla RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor (opcional) | No la usa la app. Resérvala para scripts de administración. Nunca al cliente. |
| `DAILY_SEARCH_LIMIT` | Solo servidor (opcional) | Límite diario de búsquedas por usuario. Default: `50`. |
| `DAILY_CELL_LIMIT` | Solo servidor (opcional) | Límite diario de celdas de censo por usuario. Default: `300`. Los admin no tienen límite. |

## Setup local

```bash
# 1. Clona e instala
git clone https://github.com/marianotala/linkstudio-gravity-seeker.git
cd linkstudio-gravity-seeker
npm install

# 2. Variables de entorno
cp .env.example .env.local
# edita .env.local con tu GOOGLE_MAPS_KEY y las credenciales de Supabase

# 3. Base de datos (una sola vez por proyecto de Supabase)
# Pega el contenido de supabase/schema.sql en el SQL Editor de Supabase
# y ejecútalo (es idempotente: se puede re-correr sin romper nada).

# 4. Usuarios (no hay registro público)
# Supabase → Authentication → Users → Add user (marca "Auto Confirm").
# Para dar rol admin:
#   update public.profiles set rol = 'admin' where email = 'tu@correo.mx';

# 5. Corre
npm run dev        # http://localhost:3000
npm run build      # build de producción (debe pasar limpio)
npm run lint
```

## Deploy en Vercel

Con el [CLI de Vercel](https://vercel.com/docs/cli) (`npm i -g vercel`):

```bash
# 1. Vincula la carpeta al proyecto de Vercel (crea uno si no existe)
vercel link

# 2. Agrega las variables de entorno (repite por cada ambiente que uses;
#    cada comando te pedirá el valor de forma interactiva)
vercel env add GOOGLE_MAPS_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# opcionales:
vercel env add DAILY_SEARCH_LIMIT production
vercel env add DAILY_CELL_LIMIT production

# (repite con `preview` en lugar de `production` si quieres previews funcionales)

# 3. Deploy a producción
vercel --prod
```

### Dominio seeker.linkstudio.mx

1. En Vercel: proyecto → **Settings → Domains** → **Add** →
   `seeker.linkstudio.mx`.
2. Vercel te mostrará el registro DNS a crear. En el DNS de
   `linkstudio.mx` agrega:
   - `CNAME  seeker  cname.vercel-dns.com`
3. Espera la propagación (minutos a unas horas). Vercel emite el
   certificado TLS automáticamente cuando el registro valida.

## Seguridad

- La key de Google vive solo en variables de entorno del servidor y se
  usa únicamente desde `lib/google.ts` (marcado `server-only`) vía los
  route handlers de `/app/api/*`. Auditado: no aparece en el bundle del
  cliente (`.next/static`).
- Toda ruta excepto `/login` exige sesión (middleware); las APIs
  regresan 401 sin sesión.
- Postgres con RLS: cada usuario lee/escribe solo sus búsquedas; el rol
  `admin` lee todo. Las escrituras de cuota pasan solo por una función
  `security definer` atómica.
- Límite diario por usuario (búsquedas y celdas de censo) contra
  descontrol de costos de la API de Google.
