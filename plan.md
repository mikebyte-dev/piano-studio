# 🚀 Plan de Proyecto: Piano Studio

> **Visión General:** Piano Studio es una app de piano centrada en la grabación MIDI: conectar un teclado MIDI físico por USB, grabar tomas, ver las notas a lo largo del tiempo en un piano roll horizontal estilo Synthesia/DAW, editar por regiones (no nota a nota) y contar con MIDI in y out. El objetivo es un MVP fiable construido sobre el proyecto Expo existente, sin migraciones innecesarias. La visión completa del autor está en [`docs/vision.md`](docs/vision.md).
> **Última Actualización:** 2026-10-17 — sobre el visualizer + grabación/estudio ya implementados, nuevo hito UI **estilo Synthesia**: vista principal de notas cayendo sobre el teclado (`Waterfall`), **metronome con audio** (`expo-audio`) y **fix de notas colgadas** en los taps de pantalla; `tsc`/`lint`/`jest` en verde. Fases 0B y 1–6 cerradas a nivel de código; pendiente la verificación con hardware real en el satélite `midi-android`. El hito UI está **sin commit**.

## 🧱 Restricciones y hechos verificados del entorno

- **Stack actual:** Expo SDK 57 (`expo ~57.0.30`), React Native 0.86.3, React 19.2.3, NativeWind 4, TypeScript 6, `expo-dev-client` instalado, `react-native-web ~0.21.0` presente.
- **Estado del repositorio:** es una plantilla limpia. Solo contiene `src/app/_layout.tsx` (Stack + `global.css`) y `src/app/index.tsx` (placeholder). No hay código de MIDI, audio, secuenciación ni persistencia. No hay nada "existente" que conservar salvo el tooling.
- **Tests:** no hay infraestructura de tests todavía.
- **Hardware de pruebas:** una **tablet Android** (hoy conectada al PC por cable) y un piano **Roland FP-30X**. Probar contra el piano requiere un **build autónomo instalado en la tablet**, sin dependencia del cable al PC.
- **Capacidades del FP-30X — VERIFICADO:** MIDI por **USB tipo B** (MIDI + audio, *class-compliant*, **sin driver**) y por **Bluetooth 4.0 BLE-MIDI**; **no tiene conectores MIDI DIN de 5 pines**. Roland documenta el uso con Android **solo por Bluetooth**; el uso por USB a Android no está documentado por Roland. Sin embargo, **el usuario confirmó por su propia experiencia que el FP-30X funciona por USB MIDI en su tablet** (ya usa otras apps que reciben MIDI del piano por USB en esa misma tablet) → **la vía USB OTG es viable**; lo pendiente es medir precisión (jitter) y comportamiento ante desconexión, no la viabilidad.
- **Librería candidata `react-native-midi-api@0.2.0` — DESCARTADA como dependencia:** declara en npm el repositorio `github.com/Odisei-Music/react-native-midi-api`, pero **da 404**; la organización existe y su único repo público es un fork archivado de otra cosa; no hay issues, forks ni perfil del mantenedor. **No hay forma de hacer fork ni PR** ni canal de soporte. Es **MIT y su código fuente viaja en el tarball** (desarrollada contra SDK 56 / RN 0.81.5, no validada en SDK 57 / RN 0.86.3), así que reutilizarlo como base es legal y posible, pero es una **opción abierta, no una decisión**.
- **Alternativa no validada (UNKNOWN):** usar **Web MIDI API dentro de un WebView en Android** (Chrome Android soporta Web MIDI). Si funcionara, unificaría Android y escritorio en un único camino de código. **No es el plan** ni compromete la arquitectura: se evalúa como experimento dentro de la Fase 0A.
- **Verificación obligatoria (Definición de Terminado):** `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`.

## 🧭 Decisiones técnicas ya tomadas

- **MIDI nativo en Android:** se usará `android.media.midi.MidiManager` a través de un **módulo Expo propio**, construido en el proyecto separado `midi-android`. No existe un módulo MIDI oficial de Expo. La librería candidata `react-native-midi-api` v0.2.0 **queda descartada como dependencia** (repo público inexistente, un solo mantenedor, sin canal de soporte); su código **MIT** queda como **base opcional a decidir** (partir de él vs. escribir desde cero).
  - Librerías descartadas: `react-native-midi` (abandonada, sin licencia, último release 2021); `react-native-midi-device` y `react-native-usb-midi` (no existen en npm); `@motiz88/react-native-midi` (WIP desde 2023).
- **La capa MIDI se valida en un proyecto satélite, no en este repo:** no se compromete la arquitectura a una librería sin validarla. Proyecto satélite independiente: `D:\Programming\Projects\midi-android` (nombre definitivo), con plan propio ya escrito. Secuencia acordada: **validar → construir el módulo propio → importarlo**. Decisión ya resuelta: **se escribe un módulo MIDI propio** con todo lo requerido. Intención: publicar un módulo MIDI open source como aporte a la comunidad.
- **El módulo propio se importa desde el proyecto satélite sin tocar núcleo ni UI:** la capa MIDI real se importará a esta app cuando exista, **detrás de la interfaz de adaptador**; solo se sustituye la implementación falsa por la real. Gracias a eso, esta app **no depende** de que el satélite exista para avanzar. La vinculación local durante el desarrollo sigue **sin validar** (es la tarea de integración del plan).
- **Desacople obligatorio (principio de arquitectura, no una tarea):** la app se construye contra una **interfaz de adaptador MIDI** (entrada/salida) con una **implementación falsa/simulada**. El núcleo de dominio, el motor de grabación y toda la UI deben poder desarrollarse y testearse **hoy**, sin hardware y sin esperar el resultado del proyecto satélite. La librería MIDI real se conecta después, detrás de esa interfaz.
- **MIDI no funciona en Expo Go** → se trabaja con **development build**. Implica Android SDK/Android Studio y ciclos de compilación nativa.
- **Arquitectura:** la lógica de MIDI, transporte y grabación se separa de la UI en un núcleo puro y testeable; la UI se suscribe con selectores para que los eventos MIDI frecuentes no re-rendericen toda la app.
- **Referencia temporal:** los **timestamps nativos de los eventos MIDI** son la referencia temporal fiable. `performance.now()` en RN toma como origen el arranque del sistema (soporte parcial), por lo que no sirve como base para grabar.
- **Test-first para comportamiento nuevo:** los tests se escriben desde la especificación antes de implementar, y los revisa el orquestador como contrato.
- **Escritorio (Windows) — decidido:** build web con `react-native-web` + **Web MIDI API**, empaquetado con **Electron/Tauri**. `react-native-windows` queda **descartado definitivamente** para este stack (soporta RN 0.84, no 0.86; Expo no soporta Windows oficialmente). Restricción conocida: Web MIDI no está en Safari.

## 📊 Estado de Escalabilidad y Arquitectura

- [x] Núcleo de dominio (proyecto, pistas, tomas, regiones, notas, ticks/PPQ) — hecho (`src/core/domain/types.ts`)
- [x] Adaptador MIDI (interfaz de entrada/salida + implementación falsa/simulada) — hecho (`src/core/midi`: `MidiAdapter`, `FakeMidiAdapter`); forma parte del núcleo desde el inicio
- [x] Transporte y reloj musical — hecho (`src/core/recording/Transport.ts`)
- [ ] Entrada MIDI (Android USB) — parcial: `MidiAndroidAdapter` implementado sobre `midi-android`, pero **la verificación con hardware real sigue pendiente** (Fase 0A, en el satélite)
- [x] Motor de grabación (overdub / replace) — hecho (`RecordingSession` + `commitModes`)
- [x] Salida MIDI (MIDI out) — hecho (`MidiOutPlayer`)
- [x] UI: transporte, panel de pistas desplegable, teclado, timeline, cursor y **vista principal de waterfall estilo Synthesia** (notas cayendo sobre el teclado, con color por pista) — hecho (`Waterfall`, `PianoKeyboard`, `TransportBar`); el `PianoRoll` clásico sigue en el repo pero ya no es la vista de `index.tsx`
- [x] Metronome: pulsos visuales + **audio real** (accent/click en cada pulso, acento por compás 1..8, vía `expo-audio`) — hecho (`useStudio`, `assets/sounds/{accent,click}.wav`)
- [x] Edición de regiones (seleccionar, mover, recortar, redimensionar) — hecho (`regionEditing`)
- [ ] Persistencia y exportación — sin iniciar (Fase 7, opcional)
- [x] Infraestructura de tests (jest-expo + @testing-library/react-native) — hecho (jest-expo, 6 suites / 125 tests en verde)
- [ ] Target de escritorio (Electron/Tauri + `react-native-web` + Web MIDI) — decidido, sin iniciar (Fase 8)

## 🎯 Tareas Activas y Priorizadas

### 🔴 En Progreso

Las tareas de esta sección **no se bloquean entre sí** y pueden ejecutarse a la vez (`@buddy` puede tomar una mientras la otra espera hardware o tiempos de build). **Por decisión del usuario la Fase 0A tiene prioridad sobre la Fase 0B**: **primero el recorrido de punta a punta con hardware real (piano → visualizador), después la infraestructura de pruebas sin hardware**. El **Hito UI** (estilo Synthesia + metronome + fix de notas colgadas) avanzó en paralelo y **no depende de ninguna de las dos**.

La **Fase 0A no se ejecuta en este repo** sino en el repositorio satélite `D:\Programming\Projects\midi-android`, cuyo plan es la referencia; la **Fase 0B y el Hito UI ocurren en este repo**.

- [ ] **Fase 0A — Spike de viabilidad MIDI (en el proyecto satélite `midi-android`)** — **prioritaria, aún pendiente (verificado en el satélite, no en este repo)**
  - **Asignación:** `@buddy` (implementación) con validación de `@tester`. El detalle completo vive en `D:\Programming\Projects\midi-android\plan.md`.
  - **Objetivo:** decidir la capa MIDI real antes de construir encima, con evidencia y no con suposiciones.
  - **Tareas internas:**
    1. (✅) Comprobar si la librería candidata `react-native-midi-api@0.2.0` tiene repositorio público → **resultado: no hay repositorio público; queda descartada como dependencia**.
    2. (✅) Verificar las capacidades MIDI del **Roland FP-30X** contra la documentación oficial de Roland → **resultado: USB-B *class-compliant* (sin driver) y BLE-MIDI, sin MIDI DIN**.
    3. (✅) Viabilidad del hardware → **RESUELTO por el usuario: el piano ya funciona por USB MIDI en su tablet con otras apps; la vía USB OTG es viable.** Abrir un visor MIDI sigue siendo útil pero **opcional**.
    4. (pendiente) Decidir el punto de partida del módulo propio: **desde cero vs. partir del código MIT publicado** (decisión del usuario).
    5. (pendiente) App de prueba mínima con SDK 57 y development build: verificar que el entorno soporta un **Expo Module propio** (¿compila?, ¿enlaza?, ¿`expo-doctor` limpio?).
    6. (pendiente) Con hardware real: enumerar dispositivos, capturar note-on/note-off con su `timeStamp`, medir jitter (p50/p95) y probar desconexión/reconexión con una tecla presionada (el caso donde quedan notas colgadas).
    7. (pendiente) Generar un **build autónomo instalable en la tablet** para probar contra el piano sin el cable al PC.
    8. (pendiente) Evaluar la alternativa **Web MIDI API en WebView** en Android (marcada explícitamente como alternativa no validada).
    9. (pendiente) Registrar la decisión final con su evidencia.
  - **Criterio de aceptación:** informe con datos concretos (compila sí/no con SDK 57, eventos capturados, jitter p50/p95, comportamiento ante desconexión) y la decisión sobre el punto de partida del módulo registrada, con alternativas descartadas y motivo.

- [x] **Fase 0B — Infraestructura de tests + núcleo de dominio + adaptador MIDI falso (en este repo, sin hardware)** — ✅ completada
  - **Arranca después de que el recorrido real con hardware (piano → visualizador) esté verificado**, no antes. No está cancelada: sigue siendo necesaria, y sigue siendo el desbloqueo para poder trabajar sin hardware. *(Cumplido.)*
  - **Asignación:** `@buddy` (implementación) con revisión de `@tester`.
  - **Objetivo:** poder desarrollar y testear el núcleo y la UI hoy, sin hardware y sin esperar a la Fase 0A.
  - **Tareas internas:**
    1. (✅) Instalar `jest-expo` 57.0.6 + `@testing-library/react-native` 14.1.0 y el script de test.
    2. (✅) Definir el modelo: proyecto, pista, toma/región, nota con pitch/velocity/ticks/duración, PPQ y tempo (`src/core/domain/types.ts`).
    3. (✅) Definir la **interfaz del adaptador MIDI** (entrada/salida) y su **implementación falsa/simulada**: entrada simulada/scriptada para tests y para desarrollar la UI sin hardware (`src/core/midi/MidiAdapter.ts` + `FakeMidiAdapter.ts`).
  - **Criterio de aceptación:** `npx tsc --noEmit`, `npx expo lint` y los tests en verde, con los tests escritos **antes** de la implementación a partir de la especificación. *(Cumplido: 6 suites / 125 tests en verde.)*

**Criterio de integración del módulo MIDI:** el módulo del satélite se trae a esta app cuando se cumplan **dos condiciones**: (1) entregue **nota + velocidad + timestamp nativo** en la tablet y libere todo al desconectar, sin notas colgadas; y (2) existan la **interfaz del adaptador MIDI** y su **implementación falsa**, con el núcleo de grabación probado contra ella. Por eso el módulo **no necesita estar publicado ni "servible"** para integrarse.

**Riesgo sin validar:** la vinculación de un módulo local entre dos repos (dependencia `file:`, dependencia git o módulo local de Expo). Probarla temprano **con un stub**, no el día que se necesite el piano; alternativa de emergencia: `npm pack` → tarball → dependencia `file:`.

- [x] **Hito UI — Rediseño estilo Synthesia + metronome con audio + fix de notas colgadas (en este repo)** — ✅ completado a nivel de código, **sin commit**
  - **Asignación:** `@buddy` (implementación); verificación de `tsc`/`lint`/`jest` por el orquestador.
  - **Objetivo:** acercar la vista de práctica a Synthesia (notas cayendo verticalmente sobre el teclado), añadir un metronome audible con acento por compás y eliminar las notas colgadas al tocar en pantalla.
  - **Tareas internas:**
    1. (✅) **`Waterfall` estilo Synthesia** (`src/components/Waterfall.tsx`): notas cayendo hacia el teclado, geometría de teclas blancas/negras, notas vivas (mientras se sostienen) + notas grabadas, color por pista y autopoda de las notas antiguas.
    2. (✅) **`index.tsx` reescrito**: el waterfall pasa a ser la vista principal; barra de transporte con compás (TS), selector de **color de pista** y botón de metronome. El `PianoRoll` clásico queda en el repo pero deja de usarse en la pantalla principal.
    3. (✅) **Metronome con audio** (`src/hooks/useStudio.ts`): `expo-audio` (`createAudioPlayer`) con `assets/sounds/click.wav` y `assets/sounds/accent.wav`; acento según el compás (1..8); `setAudioModeAsync({ playsInSilentMode: true })`; degrada a solo-visual si el audio no está disponible (p. ej. web).
    4. (✅) **Fix de notas colgadas**: los taps en pantalla guardan su `setTimeout` por pitch, limpian el timer pendiente antes de re-tap y cancelan **todos** los timers al desmontar (además del `player.cancel()`); antes podían apilarse/reaparecer como notas colgadas.
    5. (✅) **Color de pista propagado**: `Note.color` opcional (`src/core/domain/types.ts`) capturado por `RecordingSession` y aplicado a las tomas nuevas, para distinguir visualmente la grabación en el waterfall.
    6. (✅) **Plugins de Expo** declarados en `app.json`: `expo-audio` y `expo-asset`.
    7. (pendiente) **Commit** del cambio (`Waterfall.tsx`, `assets/sounds/`, `index.tsx`, `useStudio.ts`, `RecordingSession.ts`, `types.ts`, `app.json`) y decidir si `desing/` (imagen de referencia) entra en git o se ignora.
    8. (pendiente) **Verificación visual en tablet** del waterfall y del metronome (la validación de UX se admite después).
  - **Criterio de aceptación:** `npx tsc --noEmit`, `npx expo lint` y `npx jest` en verde *(cumplido: `tsc`/`lint` OK, 6 suites / 125 tests)* + waterfall y metronome visibles/audibles en el dispositivo *(pendiente)*.

### 🟡 Próximas Tareas (Orden Recomendado)

1. [x] **Fase 1 — Integración de la capa MIDI real (en este repo)** — ✅ completada — `@buddy`, validación de `@tester`
   - **Depende del resultado de la Fase 0A.** Consiste en implementar el adaptador MIDI real detrás de la interfaz definida en la Fase 0B, sin tocar el núcleo ni la UI. *(Hecho: `MidiAndroidAdapter` sobre `midi-android` + visualizer. La validación con hardware real queda pendiente en el satélite.)*
   - **Criterio de aceptación:** la app recibe eventos del teclado real a través de la interfaz, con los mismos tests del adaptador falso en verde.
2. [x] **Fase 2 — Transporte y motor de grabación (overdub / replace)** — ✅ completada — `@buddy`, validación de `@tester`
   - Posición en ticks, play/stop/record, semántica precisa de overdub y de replace (replace solo altera el rango de grabación y no toca material ajeno), flush de notas activas al detener para evitar notas colgadas.
   - **Criterio de aceptación:** tests rojos primero, luego verde; validación de `@tester`. *(Hecho: `Transport`, `RecordingSession`, `commitModes` con tests en verde.)*
3. [x] **Fase 3 — UI base del piano roll** — ✅ completada — `@buddy`
   - Layout oscuro, barra de transporte, panel de pistas desplegable/colapsable, teclado horizontal, timeline, cursor vertical y rejilla.
   - **Criterio de aceptación:** typecheck y lint verdes; verificación visual en el dispositivo (se admite validación después, es UX). *(Hecho: `PianoRoll`, `PianoKeyboard`, `TransportBar`/`StudioScreen` compilando en web y android.)*
4. [x] **Fase 4 — Grabación en vivo de punta a punta** — ✅ completada — `@buddy` con `@tester`
   - Overdub y replace con teclado real, notas nuevas visibles durante la grabación y diferenciación visual entre material previo y recién grabado.
   - **Criterio de aceptación:** una toma grabada y visible sin detener la grabación.
5. [x] **Fase 5 — Edición por regiones** — ✅ completada — `@buddy`, tests de `@tester`
   - Seleccionar, mover en el tiempo, recortar inicio/final y cambiar duración.
   - **Criterio de aceptación:** operaciones cubiertas por tests de la lógica, no de la UI. *(Hecho: `regionEditing` con tests.)*
6. [x] **Fase 6 — Salida MIDI** — ✅ completada — `@buddy`, prueba en hardware de `@tester`
   - Enviar a dispositivo externo, all-notes-off al detener.
   - **Criterio de aceptación:** prueba en hardware. *(Lógica hecha: `MidiOutPlayer` con tests; la prueba en hardware queda pendiente junto con la verificación del satélite.)*
7. [ ] **Fase 7 — Persistencia** — `@buddy` — **sin iniciar (opcional)**
   - `expo-sqlite` para metadatos y `expo-file-system` (API nueva: `File`, `Directory`, `Paths`) para archivos, más guardar/cargar proyecto y exportación.
   - **Criterio de aceptación:** cerrar la app y recuperar el proyecto.
8. [ ] **Fase 8 — Target de escritorio** — `@buddy` — **sin iniciar**
   - Ruta ya decidida (Electron/Tauri + `react-native-web` + Web MIDI), sin bloqueo de decisión. Queda supeditada a que el núcleo funcione primero. Restricción conocida: Web MIDI no está en Safari.

### 🟢 Completadas

- [x] Inicialización de la estructura de trabajo: `plan.md` versionado + `.opencode/context/decision_log.md` privado e ignorado por git.
- [x] Inspección del estado inicial del repositorio.
- [x] Fase 0A, pasos de investigación: librería candidata descartada como dependencia; capacidades del FP-30X verificadas; vía USB MIDI confirmada por el usuario en su tablet.
- [x] Fase 0B completa: infraestructura de tests (jest-expo, 6 suites / 125 tests), modelo de dominio y adaptador MIDI falso.
- [x] Fases 1–6: integración de la capa MIDI real (`MidiAndroidAdapter` + visualizer), transporte y grabación (overdub/replace), UI del piano roll, edición por regiones y salida MIDI (`MidiOutPlayer`); app compilable (export web OK, android prebuild OK, tsc/lint/jest en verde).
- [x] Hito UI — rediseño estilo Synthesia (`Waterfall`), metronome con audio (`expo-audio` + `assets/sounds/{click,accent}.wav`, acento por compás 1..8) y fix de notas colgadas en los taps de pantalla; color de pista propagado (`Note.color`); `tsc`/`lint`/`jest` en verde (6 suites / 125 tests). **Sin commit.**
- **Nota de repositorio:** existe una carpeta `desing/` con la imagen de referencia del rediseño (`Neon Piano Roll Studio Interface.png`) **sin trackear** — decidir si se versiona o se ignora (nombre con typo: `desing` en vez de `design`). Además hay cambios **sin commitear** en `app.json`, `package.json`, `src/app/index.tsx`, `src/core/domain/types.ts`, `src/core/recording/RecordingSession.ts` y `src/hooks/useStudio.ts`, junto con los nuevos `src/components/Waterfall.tsx` y `assets/sounds/`.
- **Nota de repositorio:** existe un **tarball sin trackear** (`npm pack` del módulo, usado para probar la vinculación local `file:`); decidir si se versiona o se ignora en `.gitignore`. La carpeta `.opencode/context/` **sí está en `.gitignore`** (decisiones privadas).

## ❓ Decisiones pendientes del usuario

1. **Punto de partida del módulo MIDI propio.** ¿Se escribe **desde cero** o se **parte del código MIT publicado** en el tarball de `react-native-midi-api@0.2.0`? Consecuencias: partir del código MIT acelera y reutiliza lógica ya probada contra SDK 56, pero arrastra deuda de una base no validada en SDK 57 / RN 0.86.3 y exige respetar licencia y atribución; escribir desde cero da control total y parte del stack objetivo, pero cuesta más tiempo.
2. **Formato de exportación/importación.** ¿Standard MIDI File (`.mid`) interoperable, o formato propio en JSON (más simple, menos útil fuera de la app)?
3. **Publicación del paquete satélite.** ¿Se publica abierto en npm como aporte a la comunidad, o queda privado para consumo propio?
4. **Nombre del paquete satélite — RESUELTO:** el nombre definitivo del paquete, el repositorio y la carpeta es **`midi-android`**.

## 📌 Contexto de Continuación (Para reanudar el chat)

- **Último punto de control:** hito UI estilo Synthesia implementado (waterfall + metronome con audio + fix de notas colgadas); `tsc`, `lint` y `jest` (6 suites / 125 tests) en verde. En este repo el código de producto ya existe: núcleo de dominio, adaptador MIDI (interfaz + falsa + `MidiAndroidAdapter`), transporte, motor de grabación, UI (waterfall estilo Synthesia + teclado + transporte), edición por regiones y salida MIDI. Nota: el hito UI está **sin commitear** y hay un `desing/` y un **tarball sin trackear** (`npm pack`) por decidir si se ignoran (ver notas en Completadas). `.opencode/context/` está en `.gitignore`.
- **Siguiente paso exacto (por prioridad):**
  1. **Commit/cierre del hito UI** (nuevo): `src/components/Waterfall.tsx`, `assets/sounds/`, `src/app/index.tsx`, `src/hooks/useStudio.ts`, `src/core/recording/RecordingSession.ts`, `src/core/domain/types.ts`, `app.json`; decidir si `desing/` entra en git o se ignora (y, si se adopta, corregir el typo `desing` → `design`).
  2. **Verificación visual en tablet** del waterfall y del metronome (UX; se admite validar después).
  3. **Verificación con hardware real en el satélite `midi-android` — SIGUE PENDIENTE** (Fase 0A, Hito 1): enumerar dispositivos, capturar note-on/note-off con su `timeStamp`, medir jitter y probar desconexión/reconexión. Es el bloqueo real que queda para la vía MIDI (también para cerrar Fase 1 y Fase 6 a nivel de hardware).
  4. **Persistencia (Fase 7) — opcional**, sin iniciar: `expo-sqlite` + `expo-file-system` para guardar/cargar y exportación.
  5. **Decisión del usuario sobre el tarball**: ignorarlo en `.gitignore` (lo esperado) o versionarlo; decidir también su versión.
  6. **Publicación del módulo (Hito 2+)**: evaluar publicar `midi-android` abierto en npm como aporte a la comunidad, o mantenerlo privado.
- **Alternativa no bloqueante:** la UI/hito estilo Synthesia avanzó **sin hardware**, confirmando que el trabajo visual no depende de la verificación del satélite; lo que sí queda bloqueado por ella es únicamente la vía MIDI real (Fases 0A/1 y la prueba de hardware de la 6). Las Fases 7 y 8 tampoco dependen de esa verificación.
