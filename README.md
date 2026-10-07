# Apex · Administración

Sistema administrativo de Apex Consulting: presupuestos, cobros en dólares y bolívares, cuentas por cobrar y estados de cuenta. Next.js 14 + Supabase, con la marca del manual (`Desktop\apex\MANUAL-DE-MARCA.md`).

## Pantallas

| Ruta | Qué hace |
|---|---|
| `/login` | Única pantalla pública. |
| `/dashboard` | Resumen: por cobrar (USD y Bs), vencido, cobrado y presupuestado del mes contra el mismo día del mes anterior, días de cobro, presupuestado contra cobrado en 12 meses, antigüedad de saldos, clientes, proyectos y métodos de pago. |
| `/presupuestos` | Lista con filtros y CSV. Ver, imprimir, duplicar, cobrar y cancelar o reactivar. |
| `/presupuestos/nuevo` y `/presupuestos/[id]` | Editor con vista previa en vivo del PDF; ficha con saldo y abonos. |
| `/cobros` | Control en bolívares: cuánto cobrar hoy en Bs a la tasa BCV, totales por mes y libro de cobros (CSV y PDF). |
| `/clientes` y `/clientes/[cliente]` | Saldos por cliente y estado de cuenta: por cada presupuesto se elige qué se cobra (saldo, anticipo o un monto) y si está vencido. Correos de contacto del cliente y últimos envíos. |
| `/ajustes` | Estado de cuenta automático semanal (día, hora, a quién, prueba y registro), datos de pago que salen en los PDF, plazo de vencimiento, perfil y contraseña. |

La tasa BCV la entrega `/api/tasa`, que consulta DolarApi del lado del servidor con caché de 30 minutos.

## Correr en local

```bash
npx pnpm@9 install
# .env.local (no se sube a git)
# NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<clave anon>
npx pnpm@9 dev
```

`npx pnpm@9 typecheck` verifica los tipos, y el build también los verifica.

## Envío por correo

El estado de cuenta (desde la ficha del cliente) y los presupuestos (botón **Enviar al cliente**, que se abre solo al crear uno) se mandan por correo con el diseño de marca en el cuerpo y el **PDF adjunto**. El PDF lo genera el servidor con un Chrome sin interfaz (`puppeteer-core` + `@sparticuz/chromium`), así que es idéntico al que se imprime.

Cada cliente tiene **varios correos de contacto** (`clients.contacts`) y a todos les llegan presupuestos y estados de cuenta; en cada envío se puede desmarcar alguno o agregar otros. Cada envío queda en `email_log`.

### Estado de cuenta semanal

Se activa en **Ajustes → Estado de cuenta automático** (día y hora de Caracas; solo clientes con vencido o todos los que tienen saldo). Cada cliente puede quedar fuera desde su ficha. Lleva lo sugerido (anticipo pendiente o saldo), el mismo aviso y el mismo PDF que el envío a mano, y una copia oculta a la cuenta que envía.

Cómo sale: `pg_cron` corre cada hora `dispatch_weekly_statements()`; cuando toca, crea una corrida con un token de un solo uso y llama por `pg_net` a `<app_url>/api/estados-semanales`. La app lee los datos de esa corrida con `statement_run_data`, envía y anota cada correo. Si algo falla, la base lo reintenta en la hora siguiente (hasta 3 veces ese día) sin repetir a quien ya lo recibió. `app_url` se registra solo al abrir la app publicada (https). **Enviarme una prueba** manda todo lo de esa semana solo a tu correo.

Variables de entorno (en `.env.local` y en Render):

| Variable | Valor |
|---|---|
| `GMAIL_USER` | `edwin.dev.21114@gmail.com` |
| `GMAIL_APP_PASSWORD` | Contraseña de aplicación de Google (16 letras) |
| `MAIL_FROM_NAME` | Opcional. Nombre del remitente; por defecto "Apex Consulting" |
| `CHROME_EXECUTABLE_PATH` | Opcional, solo en local si Chrome no está en la ruta de siempre |

Para crear la contraseña de aplicación: en la cuenta de Google, **Seguridad → Verificación en 2 pasos** (debe estar activa) → **Contraseñas de aplicaciones** → nombre "Apex" → copiar las 16 letras en `GMAIL_APP_PASSWORD`.

## Base de datos

Los scripts de `scripts/` se aplican en orden en el editor SQL de Supabase. **`11-cobros-bs-aprobacion-y-seguridad.sql`** es el de este rediseño y solo agrega o ajusta, sin borrar nada:

- columnas para cobros en Bs (`currency`, `amount_ves`, `exchange_rate`) y para los datos de pago de los PDF;
- aprobación de presupuestos (`approved_on`): solo los aprobados son cuenta por cobrar; los existentes quedan aprobados con su fecha de emisión (salvo los cancelados) y un cobro aprueba el presupuesto;
- anticipo por presupuesto (`advance_type`, `advance_value`): porcentaje del total (50 % por lo general) o monto fijo;
- trigger para que el estado del presupuesto siga al saldo cuando cambia el total o se reactiva;
- número de presupuesto único por usuario;
- RLS en `invoices` y `budget_invoice_items`, que estaban expuestas;
- `search_path` fijo en las funciones y políticas optimizadas.

La app funciona sin esa migración: todo lo no cancelado cuenta como aprobado, los cobros se registran en dólares, no hay anticipos y Ajustes queda en solo lectura hasta aplicarla.

**`12-contactos-y-estado-de-cuenta-semanal.sql`** (también solo agrega): `clients.contacts` y `clients.auto_statement` (el correo que ya tenía cada cliente pasa a ser su primer contacto), la programación en `company_settings`, las tablas `statement_runs` y `email_log`, las funciones de la corrida y el trabajo de `pg_cron` (activa `pg_cron` y `pg_net`). El envío arranca **apagado**. Sin esta migración cada cliente tiene un solo correo y el envío semanal no aparece.

Los módulos de facturas y de horas se retiraron de la app. Sus tablas y datos siguen en la base.
