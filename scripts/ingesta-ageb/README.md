# Ingesta de AGEBs (Censo 2020 INEGI → PostGIS)

Carga las AGEBs urbanas con sus variables censales a la tabla
`public.agebs` de Supabase. Se corre **una vez por entidad** desde tu
máquina. Con esto, Seeker calcula universos automáticamente en cada
búsqueda.

## 1. Descarga los archivos de INEGI (manual, ~5 min por entidad)

INEGI no expone esto como API: son descargas de archivos. Las URLs
cambian de vez en cuando; si un enlace no responde, busca en Google
los términos indicados.

**a) Geometrías — Marco Geoestadístico 2020 (por entidad):**
- Página: https://www.inegi.org.mx/temas/mg/ → "Marco Geoestadístico,
  Censo de Población y Vivienda 2020" → descargas por entidad
  (búsqueda: `marco geoestadistico 2020 censo descarga entidad`).
- Descarga el ZIP de la entidad y extrae de `conjunto_de_datos/` los
  archivos de **AGEB urbana**: `EEa.shp`, `EEa.dbf`, `EEa.prj`,
  `EEa.shx` (EE = clave de entidad, p. ej. `09a.shp` para CDMX,
  `15a.shp` para Estado de México).

**b) Variables censales — "Principales resultados por AGEB y manzana
urbana", Censo 2020 (por entidad):**
- Página: https://www.inegi.org.mx/programas/ccpv/2020/#microdatos →
  sección "Principales resultados por AGEB y manzana urbana"
  (búsqueda: `RESAGEBURB 2020 csv`).
- URL típica: `https://www.inegi.org.mx/contenidos/programas/ccpv/2020/microdatos/ageb_manzana/RESAGEBURB_09_2020_csv.zip`
  (cambia `09` por la entidad). Extrae el CSV (p. ej.
  `RESAGEBURB_09CSV20.csv`).

**Claves de entidad:** CDMX = `09` · Estado de México = `15`.

Pon todo en la carpeta `/data` del repo (está en .gitignore):

```
data/
  09a.shp  09a.dbf  09a.prj  09a.shx
  15a.shp  15a.dbf  15a.prj  15a.shx
  RESAGEBURB_09CSV20.csv
  RESAGEBURB_15CSV20.csv
```

## 2. Cadena de conexión a la base

Supabase → tu proyecto → **Settings → Database → Connection string**
(formato URI; usa el *Session pooler* si tu red no tiene IPv6):

```bash
export SUPABASE_DB_URL='postgresql://postgres.emtsjushfyuphwurwlje:[TU_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
```

> La migración de la fase 5 (PostGIS + tabla `agebs` + RPC
> `calcular_universos`) ya está aplicada al proyecto. Si montas un
> proyecto nuevo, corre antes `supabase/schema.sql`.

## 3. Corre la ingesta

```bash
cd scripts/ingesta-ageb
npm install

# CDMX (~2,400 AGEBs, ~2 min)
node index.mjs --entidad 09 --shp ../../data/09a.shp --censo ../../data/RESAGEBURB_09CSV20.csv

# Estado de México (~5,500 AGEBs, ~4 min)
node index.mjs --entidad 15 --shp ../../data/15a.shp --censo ../../data/RESAGEBURB_15CSV20.csv
```

Es idempotente (upsert por CVEGEO): re-correrla actualiza sin duplicar.

## Qué hace el script

1. Lee el CSV censal (latin1), toma solo las filas "Total AGEB urbana"
   y arma el CVEGEO (entidad+municipio+localidad+AGEB, 13 caracteres).
   Los `*` y `N/D` de confidencialidad de INEGI se guardan como null.
2. Calcula el **índice socioeconómico aproximado (proxy censal)** 0-100:
   `100 × (0.4·escolaridad + 0.3·autos + 0.3·internet)` donde
   escolaridad = (GRAPROES−4)/12 recortado a [0,1],
   autos = VPH_AUTOM/TVIVHAB, internet = VPH_INTER/TVIVHAB.
   **Nunca lo presentes como NSE AMAI** — es un proxy censal.
3. Lee el shapefile, reproyecta de Lambert (ITRF/GRS80, la proyección
   del Marco Geoestadístico) a WGS84 y simplifica las geometrías
   (~10 m de tolerancia) para render web.
4. Sube todo a `public.agebs` en lotes de 200 con upsert.

## Variables cargadas por AGEB

POBTOT, P_18YMAS, P_18A24, P_60YMAS, GRAPROES, TVIVHAB, VPH_AUTOM,
VPH_INTER, VPH_PC + `nse_proxy` calculado.
