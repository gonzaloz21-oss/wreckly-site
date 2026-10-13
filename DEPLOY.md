# Wreckly — guía de despliegue (≈45 min)

Costo: $0/mes (solo sigues pagando el dominio). Hazlo ANTES del 20 de octubre.
Orden: 1 Supabase → 2 Resend → 3 Stripe → 4 GitHub+Netlify → 5 Probar → 6 DNS → 7 Cancelar Bubble.

## 1. Supabase (base de datos)
1. supabase.com → New project (región Canada Central). Guarda la contraseña.
2. SQL Editor → New query → pega `supabase/schema.sql` → Run.
3. Project Settings → API: copia **Project URL** y la llave **service_role**.

## 2. Resend (emails a compradores)
1. resend.com → Domains → Add domain `wreckly.ca` (región us-east o la más cercana).
2. Te da registros DNS (SPF/DKIM). Agrégalos en Namecheap → Domain List → Manage → Advanced DNS.
   ⚠ NO borres los registros actuales de Namecheap Private Email (MX/SPF). Si ya hay un SPF (`v=spf1 ...`), NO crees otro: combínalos en uno solo. Si dudas, mándame una captura del DNS antes de guardar.
3. Cuando diga Verified → API Keys → crea una llave. Cópiala.

## 3. Stripe
1. Dashboard (modo Live) → Developers → API keys → crea una **restricted key** con permisos de escritura en *Products* y *Payment Links* (o usa la secret key).
2. El webhook se crea DESPUÉS del paso 4 (necesita la URL).

## 4. GitHub + Netlify
1. Sube la carpeta `wreckly-site` a un repo privado nuevo en GitHub.
2. netlify.com → Add new site → Import an existing project → GitHub → elige el repo. Netlify lee `netlify.toml` (publish `public`, funciones en `netlify/functions`); no cambies nada.
3. Site configuration → Environment variables: pega todo de `.env.example` con tus valores (todavía sin STRIPE_WEBHOOK_SECRET). Deploy.
4. Stripe → Developers → Webhooks → Add endpoint:
   URL: `https://TU-PROYECTO.netlify.app/api/stripe-webhook` (luego puedes cambiarla a https://wreckly.ca/api/stripe-webhook)
   Evento: `checkout.session.completed`. Copia el **Signing secret** (whsec_...) → pégalo en Netlify como `STRIPE_WEBHOOK_SECRET` → Deploys → Trigger deploy.

## 5. Probar (con la URL de Netlify, antes del DNS)
- Envía una solicitud en /request → debe llegarte email a info@wreckly.ca y verse en /admin.
- En /admin crea un link por un monto de prueba con tu propio email, paga con una tarjeta real de $10 mínimo y reembólsala desde Stripe, o usa modo Test con llaves sk_test (cambia llaves y webhook a test para esta prueba).
- Debe llegar el email con los datos del yard y la solicitud debe pasar a "paid".

## 6. Dominio (cuando todo funcione)
1. Netlify → Domain management → Add a domain → `wreckly.ca`. Te dirá qué registros poner.
2. Namecheap → Advanced DNS: cambia el registro A de `@` y el CNAME `www` por los que indique Netlify (normalmente A 75.2.60.5 y CNAME hacia TU-PROYECTO.netlify.app; usa los valores que te muestre Netlify). Elimina los registros que apunten a Bubble (CNAME/A hacia bubble).
3. Espera 5–30 min. Verifica https://wreckly.ca.

## 7. Cancelar Bubble
Cuando wreckly.ca ya cargue el sitio nuevo: bubble.io/account → Invoices → Plans → cambia/cancela antes del 20 de octubre.
(Si cancelas, tu app queda en el plan gratis; el dominio ya no apunta a ella, así que nada se rompe.)

## Uso diario
1. Llega una solicitud → email a info@wreckly.ca.
2. Llamas/escribes a los yards.
3. Si uno la tiene: /admin → abres la solicitud → pones nombre, teléfono, dirección y precio del yard → **Create link & email buyer**.
4. Cuando el comprador paga: te llega un email "PAID" y el comprador recibe los datos del yard automáticamente. Avisa tú al yard.

## Pendiente de tu revisión
- La Privacy Policy es un borrador razonable pero no es asesoría legal: revísala.
- Ahora el sitio carga Google Analytics y Meta Pixel sin banner de cookies (igual que antes en Bubble). Considera añadir uno.
- Los links de depósito no vencen; el límite de 1 pago por link evita dobles cobros.
