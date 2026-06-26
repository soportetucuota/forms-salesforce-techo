# Formularios de donación · Debi + Salesforce

Template **listo para deploy** de formularios de donación. Trae tres flujos
funcionando contra Salesforce de fábrica:

| Flujo | URL | Para qué sirve |
|---|---|---|
| **Alta de donante** | `/flow/alta-donante` | Wizard de 2 pasos: datos del donante y, después, monto + tarjeta/CBU + DNI. |
| **Alta de donante (alternativo)** | `/flow/alta-donante-alternativo` | Wizard de 3 pasos con monto-primero, mostrado en formato dropdown. Sirve como segundo ejemplo de qué tan distinto puede ser un flow. |
| **Actualizar donación** (autoservicio) | `/flow/actualizar-donacion/<id-de-oportunidad>` | Link que la org manda por mail a un donante para que cambie monto y/o método de pago. |

> Los nombres de los flows son genéricos para que cualquier organización
> pueda usarlos directamente. Personalizá el copy, colores y logo en cada
> archivo `.vue` según tu marca.

---

## 1) Deployar en Vercel (10 minutos).

Estos pasos asumen que no tenés ni GitHub ni Vercel todavía. Si ya
tenés cuenta en ambos, saltá al paso 4.

1. **Abrí una cuenta en GitHub** (gratis): <https://github.com/signup>. La
   cuenta que crees acá va a ser el **dueño de la publicación del sitio** —
   quien controle ese usuario controla qué se publica.
2. **Forkeá este repo** a tu cuenta. Desde la página del template tocá
   *"Fork"* (arriba a la derecha) y elegí tu usuario como destino. Esto
   te crea una copia editable en `https://github.com/<tu-usuario>/forms-salesforce`.
3. **Abrí una cuenta en Vercel** (gratis): <https://vercel.com/signup>.
   Loguéate con tu cuenta de GitHub para que Vercel pueda leer tu fork.
4. En Vercel tocá **"Add New… → Project"** y elegí tu fork
   `<tu-usuario>/forms-salesforce`. Vercel detecta solo que es Nuxt 3 y
   pre-completa el build.
5. **Elegí una URL preliminar**, por ejemplo `donaciones.vercel.app`. Si esa
   ya está tomada, probá `mi-org-donaciones.vercel.app`. Esto se cambia
   después (Vercel → Project → Settings → Domains) cuando tengas el
   dominio definitivo (ej. `donar.miorg.org`).
6. **Pegá las 5 variables de entorno** y tocá *Deploy*. Las variables
   están explicadas en la sección [Variables de entorno](#variables-de-entorno).
7. A los ~2 minutos el sitio está vivo. Andá a
   `https://<tu-url>.vercel.app/` y vas a ver el listado de los 3 flows.

> **Asistente** Si estás usando un agente (Cursor, v0, Copilot Chat,
> etc.) para hacer esto, mirá [`AGENTS.md`](./AGENTS.md): hay un prompt
> y unas instrucciones específicas para que el agente sepa de dónde
> sacar las variables de Salesforce.

---

## 2) Variables de entorno

Son **5 obligatorias** y no hay opcionales. Si te falta alguna, los
formularios devuelven un error claro al primer submit.

| Variable | De dónde sale |
|---|---|
| `SF_INSTANCE_URL` | Asistente de onboarding de Debi (ver abajo) |
| `SF_REFRESH_TOKEN` | Asistente de onboarding de Debi |
| `SF_LOGIN_URL` | Asistente de onboarding de Debi (`https://login.salesforce.com` en prod, `https://test.salesforce.com` en sandbox) |
| `DEBI_PUBLIC_KEY` | <https://debi.pro/dashboard/developers> → `pk_live_*` (o `pk_test_*` mientras probás) |
| `DEBI_SECRET_KEY` | <https://debi.pro/dashboard/developers> → `sk_live_*` |

### Las 3 de Salesforce — usá el asistente

Pedile a Debi (a tu contacto o a soporte) la URL del **asistente de
onboarding**. Hoy es <https://forms.tc-cloud-partners.net/connect>; si
no responde, mirá [debi.pro/docs](https://debi.pro/docs) que siempre
tiene la versión actualizada.

El asistente te pide:

1. Elegir Producción o Sandbox.
2. Loguearte con tu Salesforce y autorizar la app *"Debi Forms Onboarding"*.
3. Te devuelve los **3 valores listos para copiar** (`SF_INSTANCE_URL`,
   `SF_REFRESH_TOKEN`, `SF_LOGIN_URL`). Los tokens **no se guardan en
   ninguna base de datos** — la pantalla expira a los 5 minutos.

### Las 2 de Debi — del dashboard

Entrá a <https://debi.pro/dashboard/developers> y copiá:

- `DEBI_PUBLIC_KEY` → el valor que empieza con `pk_live_*` (publishable).
- `DEBI_SECRET_KEY` → el valor que empieza con `sk_live_*` (secret).

> `DEBI_SECRET_KEY` no la usa ningún flujo todavía, pero se carga ahora
> para que los flujos futuros que sí van a hablar con Debi desde el
> backend (refunds, listado de cobros, etc.) no te pidan volver a tocar
> la configuración.

---

## 3) Probá los flujos (la "prueba de 5 minutos")

Apenas el deploy está verde, hacé este recorrido. Te va a dejar entender
el repo sin abrir un solo archivo.

### Paso 1 — Listado de flows

Abrí `https://<tu-url>.vercel.app/`. Tenés que ver 3 tarjetas con el
nombre y descripción de cada flow. Tocá *"Alta de donante"*.

### Paso 2 — Alta de donante (front)

Completá el formulario con un email que reconozcas (vas a poder buscar
el Contact en Salesforce después). Avanzá al paso 2, completá monto + una
tarjeta de prueba (`4509 9535 6623 3704`, cualquier fecha futura, cualquier
CVV de 3 dígitos), DNI y tildá los términos. Tocá *Donar*. Si todo va bien
vas a ver *"¡Gracias por sumarte!"* en verde.

Andá a tu Salesforce: tenés que ver el nuevo Contact con su Opportunity
linkeada, su Recurring Donation, y un `TCPagos__Payment_Method__c` con
el id de Debi (`pm_test_*`).

### Paso 3 — Actualizar donación (front)

Copiá el `Id` de esa Oportunidad recién creada (Salesforce te lo muestra
en la URL, son los 18 caracteres después del último `/`). Abrí
`https://<tu-url>.vercel.app/flow/actualizar-donacion/<ese-id>`.
Tenés que ver tu monto actual; cambialo y guardalo. La Oportunidad y la
Recurring Donation se actualizan en Salesforce.

### Paso 4 — Probá los endpoints por curl

Cada flow expone un endpoint en `/api/flow/<nombre>`. Es la misma
respuesta que recibe el formulario, así que sirve para depurar:

```bash
# Crear un Contact (etapa "personal" del alta)
curl -X POST https://<tu-url>.vercel.app/api/flow/alta-donante \
  -H "Content-Type: application/json" \
  -d '{
    "stage": "personal",
    "personal": {
      "firstName": "Juan",
      "lastName": "Tester",
      "email": "juan.tester+curl@example.com",
      "phone": "1112341234",
      "birthDate": "1990-01-01",
      "country": "Argentina",
      "province": "CABA"
    }
  }'

# GET de la oportunidad (datos que carga la pantalla de autoservicio)
curl https://<tu-url>.vercel.app/api/flow/actualizar-donacion/<oppId>
```

Si algo falla, el JSON de respuesta trae `error: true` y `message` con el
texto crudo de Salesforce — por ejemplo
`"INVALID_FIELD: No such column 'Tel_fono_fijo__c' on entity Contact"` te
está diciendo "estás pegándole a una org que no tiene ese campo
custom".

---

## 4) Arquitectura del template

La idea es: **un flow = un archivo de front + un archivo de back** con
el mismo nombre. Y dentro de cada flow, los pasos son piezas
reutilizables.

```
pages/flow/
├── alta-donante.vue                                  ← Alta de 2 pasos
├── alta-donante-alternativo.vue                      ← Alta de 3 pasos (ejemplo)
└── actualizar-donacion/
    └── [oppId].vue                                   ← UI del autoservicio

server/api/flow/
├── alta-donante.post.ts                              ← backend del alta
├── alta-donante-alternativo.post.ts                  ← backend alternativo
└── actualizar-donacion/
    ├── [oppId].get.ts                                ← carga la oportunidad
    └── [oppId].post.ts                               ← envía cambios

components/
├── PaymentMethodForm.vue                             ← elemento Debi (tokeniza)
├── flow/
│   ├── MultiStepFlow.vue                             ← wizard de N pasos
│   └── StepsIndicator.vue                            ← stepper visual
├── steps/                                            ← bloques reusables del wizard
│   ├── PersonalDataStep.vue                          (nombre, email, etc.)
│   ├── AmountStep.vue                                (monto + frecuencia)
│   ├── PaymentMethodStep.vue                         (tarjeta o CBU vía Debi)
│   ├── IdentificationStep.vue                        (DNI / CUIT / CUIL)
│   └── AcceptanceStep.vue                            (términos + slot extra)
└── fields/                                           ← inputs base
    ├── FieldText.vue
    ├── FieldSelect.vue
    ├── FieldButtonGroup.vue
    └── FieldCheckbox.vue

server/utils/salesforce.ts                            ← jsforce + lógica de SF
```

### ¿Cómo se arma un flow nuevo?

Un flow es un archivo `.vue` en `pages/flow/` que **compone los steps**
con un `<MultiStepFlow>` (o sin él, si es de un solo paso). Si necesita
guardar en Salesforce, agregás también `server/api/flow/<nombre>.post.ts`.

Ejemplo mínimo (un flow de "actualizar monto" en 25 líneas):

```vue
<!-- pages/flow/upgrade/[oppId].vue -->
<script setup lang="ts">
import { ref } from "vue";
import AmountStep, { type AmountData } from "~/components/steps/AmountStep.vue";
import PaymentMethodStep, { type PaymentData } from "~/components/steps/PaymentMethodStep.vue";
import { useFlowState } from "~/composables/useFlowState";

const route = useRoute();
const oppId = String(route.params.oppId);

const state = useFlowState({
  amount: { value: null, frequency: "Mensual" } as AmountData,
  payment: { token: null } as PaymentData,
});

const amountRef = ref<InstanceType<typeof AmountStep> | null>(null);
const paymentRef = ref<InstanceType<typeof PaymentMethodStep> | null>(null);

async function submit() {
  if (!(await amountRef.value?.validate())?.ok) return;
  if (!(await paymentRef.value?.validate())?.ok) return;
  await $fetch(`/api/flow/upgrade/${oppId}`, {
    method: "POST",
    body: {
      amount: state.value.amount.value,
      paymentMethodToken: state.value.payment.token,
    },
  });
}
</script>

<template>
  <main class="mx-auto w-full max-w-xl px-4 py-5 sm:px-6 space-y-5">
    <AmountStep ref="amountRef" v-model="state.amount" :presets="[10000, 20000, 30000]" />
    <PaymentMethodStep ref="paymentRef" v-model="state.payment" />
    <button @click="submit">Actualizar</button>
  </main>
</template>
```

Y un endpoint que llama a `submitFlow()`:

```ts
// server/api/flow/upgrade/[oppId].post.ts
import { submitFlow } from "~/server/utils/salesforce";

export default defineEventHandler(async (event) => {
  const oppId = getRouterParam(event, "oppId")!;
  const body = await readBody(event);
  return submitFlow({
    oppId,
    amount: body.amount,
    paymentMethodToken: body.paymentMethodToken,
  });
});
```

La ruta `/flow/upgrade/<oppId>` queda viva en el próximo deploy.

> **El template "evoluciona" sumando archivos, no editando un motor
> central.** Si en un futuro Debi (u otra fuente) publica una nueva
> plantilla, va a ser literalmente *"copiá este `.vue` y este
> `.post.ts` a tu repo"*. No hay migración compleja.

### Si tu flow no usa Salesforce

`server/utils/salesforce.ts` es **una utilidad**, no un acoplamiento.
Si tu flow quiere postear a otro servicio (Mailchimp, una API propia,
etc.), escribilo directo en `server/api/flow/<nombre>.post.ts` sin
importar nada de Salesforce.

### Si necesitás un campo que ningún step ofrece

Dos opciones:

1. **Rápido**: ponelo en línea en el flow page usando los primitivos en
   `components/fields/` (`FieldText`, `FieldSelect`, `FieldButtonGroup`,
   `FieldCheckbox`) y guardalo en `state` con `v-model`.
2. **Si lo vas a reusar**: hacelo un step nuevo en
   `components/steps/<MiStep>.vue` siguiendo la forma de los otros (props
   `modelValue` + `stepIndex`, `defineExpose({ validate })`, y llamar
   `useFlowStep({ stepIndex, validate })` en el `<script setup>`).

---

## 5) Personalización rápida

Todo se cambia editando archivos. No hay archivo de configuración ni
JSON especial: si querés cambiar algo, abrí el `.vue` o el `.css` (con
ayuda de Cursor o v0 si querés).

| Querés cambiar… | Editá |
|---|---|
| Color primario / fondos | `assets/css/main.css` (`--primary`, `--background`, etc.) |
| Tipografía principal | `assets/css/main.css` (`--font-sans-stack`) y el `<link>` de Google Fonts en `nuxt.config.ts` |
| Texto / copy de un flow | el `.vue` de ese flow en `pages/flow/` |
| Presets de monto / frecuencias | el mismo `.vue` del flow (props `presets` y `frequencies` del `<AmountStep>`) |
| Campos de un step | el `.vue` del step en `components/steps/` |
| Nombres API de campos de Salesforce | la constante `FIELD_MAP` arriba de `server/utils/salesforce.ts` |

---

## 6) Embed como iframe

Los formularios están preparados para ser embebidos en otros sitios
con un `<iframe>`. La cabecera CSP queda configurada en `nuxt.config.ts`:

```html
<iframe
  src="https://<tu-url>.vercel.app/flow/alta-donante"
  style="width: 100%; max-width: 480px; height: 720px; border: 0;"
  loading="lazy"
></iframe>
```

Por defecto **cualquier sitio puede embeber tus formularios**
(`frame-ancestors *`). Si querés restringir a un par de dominios, abrí
`nuxt.config.ts` y cambiá el `*` por la lista, p.ej.:

```ts
"Content-Security-Policy": "frame-ancestors https://miorg.org https://www.miorg.org",
```

### Cosas a tener en cuenta

- **Tamaños**: los flows usan `max-w-xl` (~580px) y se adaptan al ancho
  disponible. En el iframe definí un `width` razonable y un `height`
  generoso (~720–820px) — el contenido scrollea internamente si hace falta.
- **Cookies de Safari**: Safari bloquea cookies de terceros por defecto,
  pero **estos flows no setean ninguna**, así que no hay problema.
- **No necesitás configuración extra en Vercel**: la cabecera CSP se
  envía sola desde `nuxt.config.ts`.

---

## 7) Desarrollo local (opcional)

Si querés correr el sitio en tu máquina antes de subirlo:

```bash
npm install
cp .env.example .env
# completá las 5 variables en .env
npm run dev
```

- <http://localhost:3001/> — landing con los 3 flows.
- <http://localhost:3001/flow/alta-donante>
- <http://localhost:3001/flow/alta-donante-alternativo>
- <http://localhost:3001/flow/actualizar-donacion/006XXXXXXXXXXXX>

El puerto local es **3001** (no 3000) para que coexista con el
asistente de onboarding central de Debi (también Nuxt 3) si lo corrés
en paralelo.

> **Si ves errores raros (steps que se apilan, falta CSS, etc.) en dev**
> después de actualizar el repo, borrá el caché de Vite/Nuxt:
> `rm -rf .nuxt node_modules/.vite && npm run dev`. Esto es típico cada
> tanto cuando Vite mantiene una versión vieja de un componente.

---

## 8) ¿Qué hace exactamente, en Salesforce?

### Alta (flujos `alta-*`)

1. El donante completa sus datos personales en el navegador.
2. Después del paso de datos personales, el back **crea o reusa** un
   `Contact` matcheando por email. Esto pasa **antes** de pagar, así que
   aun si el donante abandona, te quedás con el Contact.
3. Cuando el donante completa monto + método de pago, el SDK de Debi
   tokeniza la tarjeta o CBU en el navegador con `DEBI_PUBLIC_KEY`.
4. El back recibe el token y crea, en cadena:
   - un `TCPagos__Payment_Method__c` linkeado al Contact,
   - una `npe03__Recurring_Donation__c` si la frecuencia es Mensual,
   - una `Opportunity` apuntando al Contact, al Payment Method y a la
     Recurring Donation.

### Autoservicio (`actualizar-donacion`)

1. `GET /api/flow/actualizar-donacion/<oppId>` carga la
   Opportunity y le devuelve al donante su monto actual.
2. Cuando guarda los cambios, el back:
   - Si cambió método de pago, tokeniza con Debi y crea un
     `TCPagos__Payment_Method__c` nuevo linkeado al Contact.
   - Actualiza la Opportunity (`Amount`, payment method).
   - Si la Opportunity tenía una Recurring Donation linkeada, también
     la actualiza.

Las credenciales de Salesforce **nunca llegan al navegador**: se quedan
en el backend de Vercel.

---

## 9) Cómo Debi te va a mandar mejoras

Este template **se entrega una vez**. Después de que lo deployás, el
repo es 100% tuyo y Debi no le pushea commits a tu fork.

Puede que Debi publique nuevas plantillas — típicamente 2–3 archivos
(`pages/flow/<nombre>.vue` + `server/api/flow/<nombre>.post.ts`) que
podés copiar al repo, ajustar lo que quieras, hacer commit, y Vercel
auto-deploya. Pero es un trabajo manual que puede no ser tan sencillo, lo explicamos a continuación.

### Traer los commits nuevos del fork principal

Si querés sincronizar tu fork con las mejoras del repo original
(`debipro/forms-salesforce`), agregalo una sola vez como remoto
`upstream` y después traé los cambios cuando quieras.

**1. Configurar el remoto `upstream` (solo la primera vez):**

```bash
# Add the original repo as the "upstream" remote
git remote add upstream https://github.com/debipro/forms-salesforce.git

# Verify both remotes ("origin" = your fork, "upstream" = original repo)
git remote -v
```

**2. Traer los commits nuevos (cada vez que quieras actualizar):**

```bash
# Download the latest commits from the original repo
git fetch upstream

# See which new commits exist upstream but not in your branch
git log --oneline main..upstream/main

# Bring those commits into your local main
git checkout main
git merge upstream/main
```

**3. Subir los cambios a tu fork:**

```bash
git push origin main
```

> Si preferís revisar los cambios antes de mezclarlos en `main`, creá
> una rama nueva y abrí un Pull Request en vez de mergear directo:
>
> ```bash
> git fetch upstream
> git checkout -b sync-upstream upstream/main
> git push -u origin sync-upstream
> # luego abrí el PR desde GitHub (o con `gh pr create`)
> ```
>
> Si aparecen conflictos al mergear, Git te marca los archivos en
> conflicto; resolvelos, hacé `git add <archivo>` y `git commit`.
