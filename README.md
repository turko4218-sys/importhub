# importhub

Herramienta que toma URLs de productos de **Amazon**, extrae todos sus datos
(titulo, marca, modelo, precio, peso, descripcion, fotos, etc.), te deja
**revisar y editar todo en un panel web** (como harias con una ficha de
producto), y publica el resultado en **MercadoLibre**. Las URLs se procesan
con una **cola de trabajos** en segundo plano, asi podes tirar varias de
una sin bloquearte esperando cada scrape.

## Como funciona

```
                 POST /api/jobs                 BullMQ (Redis)
Vos --URL-->  API Express  ------ encola ----->  cola "amazon-import"
     ^                                                 |
     |                                                 v
     |                                       Worker (1 job a la vez)
     |                                                 |
     |                                       Scrapea Amazon (Playwright):
     |                                       titulo, precio, fotos, peso,
     |                                       modelo, descripcion, specs...
     |                                                 |
     |                                                 v
     |                                    Arma un "listing" editable
     |                                    (estima envio intl. por peso)
     |                                                 |
     +-------- Panel web (/) <---- SQLite (data/importhub.sqlite) --------+
     |         Importar / editar         (estado y datos de cada job)
     |         título, precio, peso,
     |         imagenes, descripcion...
     v
  Publicar en MercadoLibre
  (predice categoria, arma el item, sube fotos por URL)
```

Cada URL que encolas se convierte en un **job** con estado:
`queued -> scraping -> scraped -> publishing -> published` (o `failed` si
algo sale mal, con el error guardado). Por defecto (`AUTO_PUBLISH=false`)
el job se queda en `scraped` esperando que lo revises en el panel antes de
publicar; si preferis un flujo 100% automatico podes activar `AUTO_PUBLISH`.

## Requisitos

- Node.js 18+
- Redis (para la cola). Con Docker: `docker compose up -d`
- Una app creada en <https://developers.mercadolibre.com.ar/devcenter> con
  `client_id`, `client_secret` y una `redirect_uri`.

## Instalacion

### Opcion rapida: un solo comando

```bash
npm install
npm run setup
```

`npm run setup` instala el navegador de Playwright, crea tu `.env` (a partir
de `.env.example`, sin pisar uno que ya exista) y levanta Redis (con Docker
si esta disponible, o con un `redis-server` local si no). Al final te dice
los proximos pasos.

### Opcion manual

```bash
npm install
npx playwright install chromium
cp .env.example .env
docker compose up -d          # o un Redis local en el puerto 6379
```

### Autorizar la app de MercadoLibre (opcional, solo para publicar de verdad)

Sin esto podes igual scrapear e revisar productos en el panel; te va a
hacer falta recien cuando toques "Publicar en MercadoLibre".

1. Crea una app en <https://developers.mercadolibre.com.ar/devcenter> y
   copia `client_id`, `client_secret` y `redirect_uri` a tu `.env`
   (`ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`).
2. Corre:

   ```bash
   npm run ml:auth
   ```

   Te va a mostrar un link para abrir en el navegador, autorizas la app con
   tu cuenta de MercadoLibre, y pegas de vuelta la URL/codigo de la
   redireccion. Los tokens quedan guardados en `data/ml-token.json` y se
   renuevan solos a partir de ahi (no hace falta repetir esto salvo que
   revoques el acceso).

### Levantar la API y el worker

```bash
npm run dev
```

Levanta la API (con el panel web) y el worker juntos, en una sola terminal,
con la salida de cada uno diferenciada por color/prefijo. Si preferis
verlos por separado, corre `npm run build` una vez y despues `npm run dev:api`
y `npm run dev:worker` en dos terminales.

> Si en tu entorno (por ejemplo GitHub Codespaces) el scraper falla con un
> error de Chromium tipo `error while loading shared libraries: libatk...`,
> corre una vez `sudo npx playwright install-deps chromium` para instalar
> las dependencias de sistema que le faltan al navegador headless.

## Uso: panel web (recomendado)

Abri **http://localhost:3000** en el navegador:

1. Pega el link de un producto de Amazon en "Enlace de Amazon" y toca
   **Importar de Amazon**. El link se encola y en unos segundos el scraper
   completa el formulario (titulo, marca, modelo, precio, peso, imagenes,
   descripcion).
2. Editá lo que necesites: precio, peso, costo de envio internacional
   (se estima solo por peso, pero es editable), lista de imagenes (una URL
   por linea, con miniaturas), disponibilidad, descripcion, etc.
3. Toca **Publicar en MercadoLibre**. Guarda los cambios y publica el item.
   Si algo falla (precio o imagenes faltantes, error de la API de ML), el
   error se muestra ahi mismo sin perder lo que editaste.

La lista de la izquierda muestra todos los jobs encolados con su estado, asi
podes importar varios links seguidos y despues ir editando uno por uno.

### Importar varios productos de una sola URL (busqueda, categoria, mas vendidos)

Tambien podes pegar una URL de Amazon que **no** sea de un producto puntual,
sino de un listado: una busqueda (`amazon.com/s?k=...`), una categoria, una
pagina de "mas vendidos", o la tienda de una marca. El sistema detecta que
no es un producto unico, entra a esa pagina, saca todos los links de
producto que encuentra ahi, y los encola automaticamente uno por uno —
sin que tengas que copiar cada URL a mano.

En la lista de jobs vas a ver ese job marcado como **"📋 Lista"**; cuando
termina, muestra cuantos productos encontro y encolo, y cada uno aparece
como un job individual mas abajo, listo para revisar y publicar como
cualquier otro. La cantidad maxima de productos por listado se controla con
`AMAZON_LISTING_MAX_PRODUCTS` (40 por defecto).

## Acceder desde otra PC / por internet (no solo `localhost`)

El servidor ya escucha en todas las interfaces de red, asi que en la misma
red local alcanza con usar la IP de la maquina que lo corre en vez de
`localhost` (ej. `http://192.168.1.50:3000`). Para acceder desde otra
ubicacion (otra red, o simplemente por internet) sin desplegar nada, la
forma mas simple es un **tunel**.

### 0. Primero: activa el login (obligatorio para exponerlo)

Sin esto, cualquiera que llegue a la URL puede publicar en tu cuenta de
MercadoLibre. En tu `.env`:

```bash
APP_USERNAME=elegí-un-usuario
APP_PASSWORD=elegí-una-contraseña-larga
```

Reinicia `npm run dev` despues de setear esto. El navegador va a pedir esas
credenciales (HTTP Basic Auth) antes de mostrar cualquier pantalla, y la
API tambien las exige.

### 1. Levanta la app localmente

```bash
npm run dev
```

### 2. Abri un tunel hacia `http://localhost:3000`

**Opcion A — Cloudflare Tunnel** (no requiere cuenta para un tunel rapido):

```bash
# instalar (una vez): https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel --url http://localhost:3000
```

Te da una URL tipo `https://algo-al-azar.trycloudflare.com` que anda desde
cualquier lado mientras el comando siga corriendo.

**Opcion B — ngrok** (requiere una cuenta gratuita):

```bash
ngrok http 3000
```

Te da una URL tipo `https://algo.ngrok-free.app`.

Cualquiera de las dos URLs pide usuario/contraseña (lo que configuraste en
el paso 0) antes de dejar entrar. Cerra el tunel cuando termines de usarlo.

### 3. ¿Necesitas que quede prendido todo el tiempo, no solo mientras corre el tunel?

Eso ya es un despliegue permanente: subir el proyecto a un servidor/VPS
(o un servicio tipo Railway/Render/Fly.io) con Node, Redis y Playwright
instalados, dejarlo corriendo con un gestor de procesos (`pm2`, un
servicio de systemd, o el propio servicio del hosting), y opcionalmente un
dominio + HTTPS con un reverse proxy (nginx + Let's Encrypt). Es un paso
mas grande — avisame si es lo que necesitas y te armo esa parte
especificamente para el hosting que uses.

## Uso: linea de comandos / API (para lotes grandes)

### Encolar una URL de Amazon

```bash
npm run enqueue -- https://www.amazon.com/dp/B08N5WRWNW
```

### Encolar varias URLs a la vez, o un archivo con una URL por linea

```bash
npm run enqueue -- https://amazon.com/dp/AAA https://amazon.com/dp/BBB
npm run enqueue -- --file urls.txt
```

Todas quedan en estado `scraped` esperando revision en el panel web (o via
API). Si en cambio queres que se publiquen solas sin revisión manual:

```bash
npm run enqueue -- --publish https://www.amazon.com/dp/B08N5WRWNW
```

### Ver el estado de los jobs

```bash
npm run jobs:list
# o via API:
curl http://localhost:3000/api/jobs
curl http://localhost:3000/api/jobs/<jobId>
```

### API REST

| Metodo | Ruta                         | Descripcion                                              |
| ------ | ---------------------------- | --------------------------------------------------------- |
| POST   | `/api/jobs`                  | Encola `{ "url": "..." }` o `{ "urls": [...] }`            |
| GET    | `/api/jobs`                  | Lista los jobs mas recientes                               |
| GET    | `/api/jobs/:id`               | Detalle de un job (producto scrapeado + listing editable) |
| PATCH  | `/api/jobs/:id/listing`      | Edita campos del listing antes de publicar                |
| POST   | `/api/jobs/:id/publish`      | Publica en MercadoLibre el listing (editado) del job       |

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.amazon.com/dp/B08N5WRWNW"}'

curl -X PATCH http://localhost:3000/api/jobs/<jobId>/listing \
  -H "Content-Type: application/json" \
  -d '{"priceUsd": 45.50, "weightKg": 0.4}'

curl -X POST http://localhost:3000/api/jobs/<jobId>/publish
```

## Que datos extrae el scraper

- Titulo, marca, modelo y codigo de barras (UPC/EAN/GTIN, cuando Amazon lo
  publica)
- Precio y moneda
- Peso (convertido a kg desde la ficha tecnica, sea cual sea la unidad
  original: g, kg, lb, oz)
- Todas las fotos disponibles (en la resolucion mas alta posible)
- Descripcion, bullet points y tabla de especificaciones tecnicas
- Rating, cantidad de reviews y disponibilidad (en stock / no disponible)
- Referencias a videos del producto, si Amazon los expone (solo a modo
  informativo: la API de MercadoLibre no permite publicar videos)
- ASIN (identificador del producto en Amazon)

Ver `src/types.ts` (`ScrapedProduct`) para el detalle completo.

## El "listing": tu copia editable

Apenas termina el scraping se crea un `listing` (ver `Listing` en
`src/types.ts`) como copia editable de lo scrapeado: titulo, marca, modelo,
codigo de barras, precio (USD), peso, costo de envio internacional,
disponibilidad, imagenes y descripcion. El `product` original scrapeado
queda intacto como referencia; lo que se edita en el panel y lo que se
publica en MercadoLibre es siempre el `listing`.

## Como se calcula el precio y el envio

`src/mercadolibre/mapper.ts` arma el payload que espera la API de ML:

- **Categoria**: se predice automaticamente con el endpoint de
  `domain_discovery` de MercadoLibre a partir del titulo.
- **Costo de envio internacional**: se estima como
  `INTL_SHIPPING_BASE_COST_USD + peso_kg * INTL_SHIPPING_COST_PER_KG`
  apenas se scrapea el peso, pero es 100% editable en el panel antes de
  publicar.
- **Precio final** (en la moneda del sitio ML):
  `(precio_usd * PRICE_FX_RATE * (1 + PRICE_MARKUP_PERCENT/100)) + (costo_envio_usd * PRICE_FX_RATE)`.
  El margen se aplica solo sobre el precio del producto, no sobre el envio.
- **Fotos**: se envian como URLs (`pictures: [{ source: url }]`); es la
  propia API de MercadoLibre la que las descarga, no hace falta subirlas vos.
- **Stock**: si "Disponible en Amazon" esta destildado, se publica con
  `available_quantity: 0`.
- **Condicion, tipo de publicacion y envio**: configurables por env
  (`ML_CONDITION`, `ML_LISTING_TYPE_ID`, `ML_DEFAULT_QUANTITY`,
  `ML_SHIPPING_MODE`).

## Variables de entorno importantes

Ver `.env.example` para la lista completa y comentada. Las mas relevantes:

- `APP_USERNAME` / `APP_PASSWORD`: usuario/contraseña del panel (HTTP Basic
  Auth). Vacios = sin login (solo para uso local en tu propia PC). Son
  **obligatorios** antes de exponer la app fuera de tu maquina (otra PC,
  un tunel, un servidor).
- `ML_SITE_ID`: sitio de MercadoLibre donde publicas (`MLA` Argentina, `MLM`
  Mexico, `MLB` Brasil, etc.)
- `PRICE_FX_RATE` / `PRICE_MARKUP_PERCENT`: como se calcula el precio final
- `INTL_SHIPPING_BASE_COST_USD` / `INTL_SHIPPING_COST_PER_KG`: como se
  estima el costo de envio internacional por defecto
- `AUTO_PUBLISH`: si `false` (default), cada URL encolada queda en estado
  `scraped` para revisar/editar en el panel antes de publicar; si `true`,
  se publica sola apenas termina el scraping
- `QUEUE_CONCURRENCY`: cuantos jobs procesa el worker en simultaneo (dejalo
  en 1 si queres ser mas conservador con Amazon)
- `PLAYWRIGHT_CHROMIUM_PATH`: ruta a un binario de Chromium ya instalado,
  util en entornos donde la version de Playwright del proyecto no coincide
  con el Chromium disponible (evita que intente descargar uno nuevo)

## Consideraciones legales e importantes

- Revisa los **Terminos de Servicio de Amazon** y las leyes aplicables antes
  de scrapear a gran escala; este proyecto esta pensado para uso personal o
  de investigacion, con volumenes bajos y espaciados (`SCRAPER_MIN_DELAY_MS` /
  `SCRAPER_MAX_DELAY_MS`).
  Automatizar la extraccion de datos de un sitio puede incumplir sus
  terminos de uso; sos responsable de usar esta herramienta de forma legal.
- Revisa tambien las **politicas de MercadoLibre** sobre publicaciones
  duplicadas, uso de imagenes de terceros y dropshipping; algunas categorias
  o paises tienen reglas especificas.
- Amazon puede mostrar un captcha si detecta trafico automatizado; en ese
  caso el job queda en `failed` con el error correspondiente. Considera bajar
  la concurrencia, subir los delays o usar un proxy (`SCRAPER_PROXY_URL`).
- El precio, categoria y atributos sugeridos son un punto de partida: por
  eso el panel de revision existe — revisalos antes de publicar, sobre todo
  al principio.

## Tests

```bash
npm test
```

Cubren el parseo de precios/ratings/modelo/peso/codigo de barras del
scraper, el calculo de envio y armado del listing inicial, y el mapeo del
listing (editado) al payload de MercadoLibre (precio, atributos, stock,
validaciones).
