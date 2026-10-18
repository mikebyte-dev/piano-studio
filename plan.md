# 🚀 Plan de Proyecto: Piano Studio

> **Visión General:** Piano Studio es una app de piano centrada en la grabación MIDI: conectar un teclado MIDI físico por USB, grabar tomas, ver las notas a lo largo del tiempo en un piano roll horizontal estilo Synthesia/DAW, editar por regiones (no nota a nota) y contar con MIDI in y out. El objetivo es un MVP fiable construido sobre el proyecto Expo existente, sin migraciones innecesarias. La visión completa del autor está en [`docs/vision.md`](docs/vision.md).
> **Última Actualización:** 2026-10-18 — **release personal v0.9.0** (`version` 0.9.0 en `package.json` y `app.json`; HEAD `00545a3`, árbol de trabajo limpio; **12 suites / 232 tests**, `tsc`, `lint` y `expo-doctor` en **verde**): **id global del autor `com.mikebytedev.pianostudio`** (applicationId de android + bundle id de iOS, fijo para todos sus proyectos); **rotación habilitada** (orientation `default`) con **layout responsivo** — el alto del teclado escala con el ancho de la ventana (ratio ×5.0, clamp 150–220 px) y la franja de pistas/transporte se adaptan al landscape; **nuevo set de iconos de piano** generado por `scripts/generate_icons.py` (Pillow: `icon.png` 1024, adaptive fore/background/monochrome, favicon) con fondo azul **`#208AEF`** (igual que el splash y `adaptiveIcon.backgroundColor`); **referencia durante la grabación**: al grabar una toma nueva las tomas commiteadas se reproducen por **MIDI out como referencia** (reinicio desde tick 0, all-notes-off al cancelar). **APK de release construida e instalada** en el dispositivo `HNQ01NPP` (`D:/piano-studio-0.9.0.apk`, universal ~102 MB, **firmada con la debug key**: válida para uso personal, no para Play); `android/` regenerada con `npx expo prebuild --clean` y **gitignored**. Commits del hito: `b067bd9` (rotación + responsivo + 0.9.0 + id), `6a11894` (referencia MIDI out), `dccbc91` (alto del teclado), `00545a3` (iconos); el waterfall unificado + 60 fps quedó en `f675703`. Conocido: `expo-dev-client` en dependencies infla el APK. **Pendiente: verificación de hardware real en el satélite `midi-android`** (tablet + piano OTG); Fases 7 y 8 sin iniciar.

## 🧱 Restricciones y hechos verificados del entorno

- **Stack actual:** Expo SDK 57 (`expo ~57.0.30`), React Native 0.86.3, React 19.2.3, NativeWind 4, TypeScript 6, `expo-dev-client` instalado, `react-native-web ~0.21.0` presente.
- **Estado del repositorio:** el código de producto ya existe (ver "Estado de Escalabilidad y Arquitectura"): núcleo de dominio, adaptador MIDI (interfaz + falsa + `MidiAndroidAdapter`), transporte, grabación, UI (waterfall + teclado + transporte), edición por regiones y salida MIDI; hito UI commiteado (`267c154`). Quedan sin iniciar las Fases 7 (persistencia) y 8 (escritorio).
- **Tests:** infraestructura de tests activa (`jest-expo` + `@testing-library/react-native`); **11 suites / 230 tests en verde** (125 previos + 95 del waterfall: `noteGeometry` 43, `colors` 19, `liveNotes` 26, `tempo` 7 + 10 de `commitTake`). No hay tests de componentes en este repo: lo testeable se extrae a módulos puros.
- **Hardware de pruebas:** una **tablet Android** (hoy conectada al PC por cable) y un piano **Roland FP-30X**. Probar contra el piano requiere un **build autónomo instalado en la tablet**, sin dependencia del cable al PC.
- **Capacidades del FP-30X — VERIFICADO:** MIDI por **USB tipo B** (MIDI + audio, *class-compliant*, **sin driver**) y por **Bluetooth 4.0 BLE-MIDI**; **no tiene conectores MIDI DIN de 5 pines**. Roland documenta el uso con Android **solo por Bluetooth**; el uso por USB a Android no está documentado por Roland. Sin embargo, **el usuario confirmó por su propia experiencia que el FP-30X funciona por USB MIDI en su tablet** (ya usa otras apps que reciben MIDI del piano por USB en esa misma tablet) → **la vía USB OTG es viable**; lo pendiente es medir precisión (jitter) y comportamiento ante desconexión, no la viabilidad.
- **Librería candidata `react-native-midi-api@0.2.0` — DESCARTADA como dependencia:** declara en npm el repositorio `github.com/Odisei-Music/react-native-midi-api`, pero **da 404**; la organización existe y su único repo público es un fork archivado de otra cosa; no hay issues, forks ni perfil del mantenedor. **No hay forma de hacer fork ni PR** ni canal de soporte. Es **MIT y su código fuente viaja en el tarball** (desarrollada contra SDK 56 / RN 0.81.5, no validada en SDK 57 / RN 0.86.3), así que reutilizarlo sería legal y posible, pero **queda descartado como base**: el módulo MIDI es **nuestro (first-party)**, no derivado de terceros.
- **Alternativa no validada (UNKNOWN):** usar **Web MIDI API dentro de un WebView en Android** (Chrome Android soporta Web MIDI). Si funcionara, unificaría Android y escritorio en un único camino de código. **No es el plan** ni compromete la arquitectura: se evalúa como experimento dentro de la Fase 0A.
- **Verificación obligatoria (Definición de Terminado):** `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`.

## 🧭 Decisiones técnicas ya tomadas

- **MIDI nativo en Android:** se usará `android.media.midi.MidiManager` a través de un **módulo Expo propio**, construido en el proyecto separado `midi-android`. No existe un módulo MIDI oficial de Expo. La librería candidata `react-native-midi-api` v0.2.0 **queda descartada como dependencia** (repo público inexistente, un solo mantenedor, sin canal de soporte); su código **MIT** queda **descartado también como base**: el módulo MIDI es **nuestro (first-party)**, no derivado de código de terceros.
  - Librerías descartadas: `react-native-midi` (abandonada, sin licencia, último release 2021); `react-native-midi-device` y `react-native-usb-midi` (no existen en npm); `@motiz88/react-native-midi` (WIP desde 2023).
- **La capa MIDI se valida en un proyecto satélite, no en este repo:** no se compromete la arquitectura a una librería sin validarla. Proyecto satélite independiente: `D:\Programming\Projects\midi-android` (**nombre provisional, pendiente de renombrado**), con plan propio ya escrito. Secuencia acordada: **validar → construir el módulo propio → importarlo**. Decisión ya resuelta: **se escribe un módulo MIDI propio** con todo lo requerido. Intención: publicar un módulo MIDI open source como aporte a la comunidad.
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
- [x] UI: transporte, panel de pistas desplegable, teclado, timeline, cursor y **vista principal de waterfall estilo Synthesia** (notas cayendo sobre el teclado, con color por pista) — hecho (`Waterfall`, `PianoKeyboard`; transporte integrado en `index.tsx`); el `PianoRoll` clásico sigue en el repo pero ya no es la vista de `index.tsx`
- [x] **Waterfall continuo: geometría y color extraídos a módulos puros** (`src/core/waterfall/noteGeometry.ts` + `colors.ts`), testeados sin React/RN; ciclo de vida de notas en vivo (anclada al teclado / congelada al soltar) y gradiente vertical por posición — hecho; **integrado en `Waterfall.tsx`**: store `liveNotes` (suscripción vía `useSyncExternalStore`) + `tempo` conectado al prop `tempo` (**sin `1.5` hardcodeado**: `quartersPerSecond` dinámico vía `flowQuartersPerSecond`) — hecho (tests test-first: `noteGeometry` 43 + `colors` 19 + `liveNotes` 26 + `tempo` 7; **11 suites / 230 tests** en total en el repo)
- [x] **Waterfall unificado + reloj 60 fps** — hecho (`Waterfall.tsx`: notas grabadas renderizadas como **notas en vivo sintéticas** con `liveNoteGeometry` y `flowTick = position`; **`renderRecordedNote` eliminado**; waterfall **limpio en idle**; `useStudio.recordedNotes` **solo con regiones commiteadas** — la toma en curso no se dibuja dos veces; `CLOCK_INTERVAL_MS` 33 → 16 ms en `useStudio`, `currentTick()` sigue usando `performance.now()`); **verificado 2026-10-18** (`jest` **11 suites / 230 tests**, `tsc`, `lint`, `expo-doctor` 21/21); **cambios sin commitear**
- [x] Metronome: pulsos visuales + **audio real** (accent/click en cada pulso, acento por compás 1..8, vía `expo-audio`) — hecho (`useStudio`, `assets/sounds/{accent,click}.wav`)
- [x] Edición de regiones (seleccionar, mover, recortar, redimensionar) — hecho (`regionEditing`)
- [ ] Persistencia y exportación — sin iniciar (Fase 7, opcional)
- [x] Infraestructura de tests (jest-expo + @testing-library/react-native) — hecho (jest-expo, 11 suites / 230 tests en verde)
- [ ] Target de escritorio (Electron/Tauri + `react-native-web` + Web MIDI) — decidido, sin iniciar (Fase 8)

## 📦 Release checklist (nueva versión)

Checklist corto para publicar una versión nueva (v0.9.0 fue la primera, ver "Última Actualización"):

1. **Subir la versión:** `version` (versionName) y `android.versionCode` en `app.json`, y `version` en `package.json`. **`versionCode` actual: `1`** (incrementar +1 en cada release). **`applicationId`/`ios.bundleIdentifier` NO se tocan** — siempre `com.mikebytedev.pianostudio`.
2. **Verificación obligatoria:** `npx tsc --noEmit`, `npx expo lint`, `npx jest` (12 suites / 232 tests en verde) y `npx expo-doctor`.
3. **Si cambió config nativa** (`app.json`, plugins, dependencias nativas): `npx expo prebuild --clean --platform android` — `android/` es generada y está **gitignoreada**, nunca se edita a mano.
4. **Build de release:** `cd android && ./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk` (universal, ~102 MB para 0.9.0). Hoy se firma con la **debug key** (uso personal; para Play se necesita keystore propio).
5. **Instalar y probar en el dispositivo:** `adb install -r <apk>` (dispositivo actual: `HNQ01NPP`).

## 🎯 Tareas Activas y Priorizadas

### 🔴 En Progreso

Las tareas de esta sección **no se bloquean entre sí** y pueden ejecutarse a la vez (`@buddy` puede tomar una mientras la otra espera hardware o tiempos de build). **Por decisión del usuario la Fase 0A tiene prioridad sobre la Fase 0B**: **primero el recorrido de punta a punta con hardware real (piano → visualizador), después la infraestructura de pruebas sin hardware**. El **Hito UI** (estilo Synthesia + metronome + fix de notas colgadas) está **commiteado** (`267c154`) y no depende de ninguna de las dos.

La **Fase 0A no se ejecuta en este repo** sino en el repositorio satélite `D:\Programming\Projects\midi-android`, cuyo plan es la referencia; la **Fase 0B y el Hito UI ocurren en este repo**.

- [ ] **Fase 0A — Spike de viabilidad MIDI (en el proyecto satélite `midi-android`)** — **prioritaria; código implementado en el satélite, falta la verificación con hardware real**
  - **Asignación:** `@buddy` (implementación) con validación de `@tester`. El detalle completo vive en `D:\Programming\Projects\midi-android\plan.md`.
  - **Objetivo:** decidir la capa MIDI real antes de construir encima, con evidencia y no con suposiciones.
  - **Tareas internas:**
    1. (✅) Comprobar si la librería candidata `react-native-midi-api@0.2.0` tiene repositorio público → **resultado: no hay repositorio público; queda descartada como dependencia**.
    2. (✅) Verificar las capacidades MIDI del **Roland FP-30X** contra la documentación oficial de Roland → **resultado: USB-B *class-compliant* (sin driver) y BLE-MIDI, sin MIDI DIN**.
    3. (✅) Viabilidad del hardware → **RESUELTO por el usuario: el piano ya funciona por USB MIDI en su tablet con otras apps; la vía USB OTG es viable.** Abrir un visor MIDI sigue siendo útil pero **opcional**.
    4. (✅) Punto de partida del módulo propio — **RESUELTO: el módulo es nuestro (first-party)**, no derivado del código MIT de terceros. Queda **pendiente el renombrado del repo satélite** (hoy `midi-android`); la **verificación con hardware real sigue pendiente**.
    5. (✅) App de prueba/harness en el satélite con SDK 57: el **Expo Module propio compila y enlaza** (módulo Kotlin nativo send+receive + web adapter); 4 suites / 125 tests y `tsc` en verde.
    6. (pendiente) Con hardware real (tablet + piano OTG): enumerar dispositivos, capturar note-on/note-off con su `timeStamp`, medir jitter (p50/p95) y probar desconexión/reconexión con una tecla presionada (el caso donde quedan notas colgadas). *El harness de captura/exportación de evidencia ya existe; falta ejecutarlo contra el piano.*
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

- [x] **Hito UI — Rediseño estilo Synthesia + metronome con audio + fix de notas colgadas (en este repo)** — ✅ completado y **commiteado** (`267c154`)
  - **Asignación:** `@buddy` (implementación); verificación de `tsc`/`lint`/`jest` por el orquestador.
  - **Objetivo:** acercar la vista de práctica a Synthesia (notas cayendo verticalmente sobre el teclado), añadir un metronome audible con acento por compás y eliminar las notas colgadas al tocar en pantalla.
  - **Tareas internas:**
    1. (✅) **`Waterfall` estilo Synthesia** (`src/components/Waterfall.tsx`): notas cayendo hacia el teclado, geometría de teclas blancas/negras, notas vivas (mientras se sostienen) + notas grabadas, color por pista y autopoda de las notas antiguas.
    2. (✅) **`index.tsx` reescrito**: el waterfall pasa a ser la vista principal; barra de transporte con compás (TS), selector de **color de pista** y botón de metronome. El `PianoRoll` clásico queda en el repo pero deja de usarse en la pantalla principal.
    3. (✅) **Metronome con audio** (`src/hooks/useStudio.ts`): `expo-audio` (`createAudioPlayer`) con `assets/sounds/click.wav` y `assets/sounds/accent.wav`; acento según el compás (1..8); `setAudioModeAsync({ playsInSilentMode: true })`; degrada a solo-visual si el audio no está disponible (p. ej. web).
    4. (✅) **Fix de notas colgadas**: los taps en pantalla guardan su `setTimeout` por pitch, limpian el timer pendiente antes de re-tap y cancelan **todos** los timers al desmontar (además del `player.cancel()`); antes podían apilarse/reaparecer como notas colgadas.
    5. (✅) **Color de pista propagado**: `Note.color` opcional (`src/core/domain/types.ts`) capturado por `RecordingSession` y aplicado a las tomas nuevas, para distinguir visualmente la grabación en el waterfall.
    6. (✅) **Plugins de Expo** declarados en `app.json`: `expo-audio` y `expo-asset`.
    7. (✅) **Commit** del hito (`267c154`: `Waterfall.tsx`, `assets/sounds/`, `index.tsx`, `useStudio.ts`, `RecordingSession.ts`, `types.ts`, `app.json`). La carpeta `desing/` (imagen de referencia) **no entra en git: fue eliminada** (`git rm -r desing/`).
    8. (pendiente) **Verificación visual en tablet** del waterfall y del metronome (la validación de UX se admite después).
  - **Criterio de aceptación:** `npx tsc --noEmit`, `npx expo lint` y `npx jest` en verde *(cumplido: `tsc`/`lint` OK, 6 suites / 125 tests)* + waterfall y metronome visibles/audibles en el dispositivo *(pendiente)*.

- [x] **Hito Waterfall Continuo — ciclo de vida de notas en vivo + pulido visual (en este repo)** — ✅ completado a nivel de código; **pendiente la validación visual del usuario en el build web**
  - **Asignación:** `@buddy` (implementación); verificación de `tsc`/`lint`/`jest` por el orquestador.
  - **Objetivo:** que las notas en vivo se comporten como un waterfall continuo (nacer en el teclado, congelarse con su longitud real, subir y desvanecerse) y pulir el aspecto del waterfall (color) y de la fila de pistas.
  - **Tareas internas:**
    1. (✅) **Ciclo de vida de la nota en vivo** (`src/components/Waterfall.tsx`): sostenida → barra **anclada al teclado** (`bottom: 0`) que crece hacia arriba; al soltar → **se congela en su duración real** y viaja con el reloj interno de flujo (`flowTick`); se desvanece sobre el **25% superior** de la vista; poda **por posición** (`offscreen`), no por antigüedad (`LIVE_MAX_AGE_QUARTERS` **eliminado**). Mismo comportamiento en grabación, playback y modo idle/free.
    2. (✅) **Geometría pura** (`src/core/waterfall/noteGeometry.ts`): `MIN_NOTE_PX`, `DEFAULT_PX_PER_QUARTER` (60), `FADE_PORTION` (0.25) y `liveNoteGeometry()`; guarda de valores no finitos (`ppq <= 0` o cualquier entrada no finita → geometría neutra) para no filtrar `NaN` al layout.
    3. (✅) **Color puro** (`src/core/waterfall/colors.ts`): `lighten`/`darken` movidos **verbatim** desde `Waterfall.tsx` + nueva `shadeByPosition` (gradiente vertical).
    4. (✅) **Gradiente vertical** en notas **grabadas y en vivo** (`t = clamp01((bottom + height/2) / viewHeight)` → `shadeByPosition(base, t)`): `t=0` en el teclado = `darken(base, 0.2)`, `t=1` arriba = `lighten(base, 0.3)`. **Solo visual, nunca persistido**; el color depende de la posición, no de la nota.
    5. (✅) **`PX_PER_QUARTER` 48 → 60** (`DEFAULT_PX_PER_QUARTER`, pedido del usuario: "un poco más alto").
    6. (✅) **`index.tsx`**: franja roja de **3px** envuelta en un margen gris oscuro con bordes negros (`border-y border-black bg-zinc-900`, `pt-2 pb-0`) entre el waterfall y el teclado (fieltro rojo de piano profesional) y **toggle real de paleta** gobernado por el estado local `paletteRegionId` (abre/cierra solo al pulsar la muestra de color; antes se mostraba siempre que la fila estaba seleccionada).
    7. (✅) **Tests test-first** (`src/core/waterfall/__tests__/`): `noteGeometry.test.ts` (43) y `colors.test.ts` (19), escritos **antes** de implementar (rojo por módulos ausentes → verde), nunca editados para pasar.
    8. (✅) **Integración de los módulos puros en `Waterfall.tsx`**: store `liveNotes` (`src/core/waterfall/liveNotes.ts`, suscripción vía `useSyncExternalStore` con snapshot estable) y `tempo` (`src/core/waterfall/tempo.ts`) conectado al prop **`tempo`** — `quartersPerSecond` **dinámico** vía `flowQuartersPerSecond(tempo ?? DEFAULT_TEMPO)`, el `1.5` hardcodeado **eliminado**. Tests test-first: `liveNotes.test.ts` (26) y `tempo.test.ts` (7).
    9. (pendiente) **Validación visual del usuario en el build web** (color de trazo, dirección del gradiente, toggle de paleta, tamaño de nota).
  - **Criterio de aceptación:** `npx jest` en **verde** (**10 suites / 220 tests** al cierre de ese hito; **11 suites / 230 tests** hoy), `npx tsc --noEmit` y `npx expo lint` en **verde** *(cumplido y verificado)* + validación visual del usuario en el build web *(pendiente)*.

- [x] **Hito Waterfall unificado + 60 fps (en este repo)** — ✅ completado a nivel de código; **cambios sin commitear**; **pendiente la validación visual del usuario en el build web**
  - **Asignación:** `@buddy` (implementación); verificación de `tsc`/`lint`/`jest`/`expo-doctor` por el orquestador.
  - **Objetivo:** unificar el renderizado del waterfall (notas grabadas y en vivo con el mismo ciclo de vida, sin dibujar dos veces la toma en curso) y subir la frecuencia de animación a ~60 fps.
  - **Tareas internas:**
    1. (✅) **Renderizador único `renderAsLive`** (`src/components/Waterfall.tsx`): notas grabadas y en vivo pasan por `liveNoteGeometry` y comparten geometría, gradiente y estilo. **`renderRecordedNote` eliminado** (con él `MAX_AGE_QUARTERS`, `STATIC_TOP_MARGIN` y el memo `maxStart` de la vista estática).
    2. (✅) **Notas grabadas como notas en vivo sintéticas**: `flowTick = position` (base de tiempo del transporte); **abiertas** (ancladas al teclado, creciendo) mientras el playhead está dentro de su duración y **cerradas** (congeladas, subiendo) al superarla; **color por nota** (`region.color ?? activeColor`); poda por `offscreen`.
    3. (✅) **Idle limpio + sin duplicación**: con el transporte detenido no se dibujan notas grabadas (el waterfall queda limpio); `useStudio.recordedNotes` dejó de incluir el take en curso — ese se muestra solo vía el store `liveNotes`, eliminando el doble dibujado durante la grabación.
    4. (✅) **Reloj 60 fps**: `CLOCK_INTERVAL_MS` de `useStudio` **33 → 16 ms** (el reloj de animación del waterfall ya era de 16 ms). La precisión de grabación **no depende** de este reloj: `currentTick()` sigue calculándose con `performance.now()`.
    5. (pendiente) **Validación visual del usuario en el build web** (notas grabadas con ciclo de vida en vivo, waterfall limpio en idle, suavidad de 60 fps).
  - **Criterio de aceptación:** `npx jest` (**11 suites / 230 tests**), `npx tsc --noEmit`, `npx expo lint` y `npx expo-doctor` en **verde** *(cumplido y verificado 2026-10-18)* + validación visual del usuario en el build web *(pendiente)*.

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
   - (✅) **Referencia durante la grabación (2026-10-18):** al pulsar record, la sesión **reinicia desde el tick 0** y las tomas commiteadas existentes se **reproducen por MIDI out como referencia** mientras se captura la nueva toma (overdub reference estilo DAW). `player.cancel()` en record/stop garantiza **all-notes-off** (sin notas colgadas); una toma vacía no crea región.
   - *(UI wiring parcial: el núcleo puro está hecho y testiado, pero el flujo de grabación de `useStudio` almacena cada toma finalizada como una región independiente — `commitModes` (overdub/replace) no se aplica en la UI.)*
5. [x] **Fase 5 — Edición por regiones** — ✅ completada — `@buddy`, tests de `@tester`
   - Seleccionar, mover en el tiempo, recortar inicio/final y cambiar duración.
   - **Criterio de aceptación:** operaciones cubiertas por tests de la lógica, no de la UI. *(Hecho: `regionEditing` con tests.)*
   - *(UI wiring parcial: `regionEditing` (mover/recortar/redimensionar) está hecho y testiado, pero no hay control en pantalla; solo recolor + borrado están cableados en la franja de pistas.)*
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
- [x] Hito UI — rediseño estilo Synthesia (`Waterfall`), metronome con audio (`expo-audio` + `assets/sounds/{click,accent}.wav`, acento por compás 1..8) y fix de notas colgadas en los taps de pantalla; color de pista propagado (`Note.color`); `tsc`/`lint`/`jest` en verde (6 suites / 125 tests). **Commiteado (`267c154`).**
- [x] Metronome rediseñado (**commit `09b357a`**): componente `Metronome.tsx` + hook `useMetronome.ts`, audio extraído de useStudio, refactor de useStudio.ts; `tsc`/`lint`/`jest` en verde.
- [x] Hito Waterfall Continuo — ciclo de vida de notas en vivo (sostenida **anclada al teclado** / soltada **congelada con su duración real** + viaje con el reloj de flujo y fade en el 25% superior) y poda **por posición**; geometría y color extraídos a módulos puros (`src/core/waterfall/{noteGeometry,colors}.ts`) con tests test-first (43 + 19); gradiente vertical por posición (solo visual); `PX_PER_QUARTER` = 60; franja roja de 3px y toggle de paleta real en `index.tsx`. **Integración hecha**: store `liveNotes` + `tempo` en `Waterfall.tsx` (`useSyncExternalStore`, prop `tempo`, `quartersPerSecond` dinámico; `1.5` hardcodeado eliminado) con tests test-first (`liveNotes` 26 + `tempo` 7). `jest` en **verde** (10 suites / 220 tests al cierre; **11 suites / 230 tests** hoy), `tsc` y `lint` en **verde** (verificado). **Pendiente: validación visual del usuario en el build web.**
- [x] **Refactor de grabación (2026-10-18)** — el commit de tomas se extrajo a la función pura `commitTake` (`src/core/recording/commitTake.ts`, test-first, 10 tests): la región nace ahora en `sessionStartTick` (antes `startTick: 0` con notas en ticks absolutos, rompiendo el invariante de `regionEditing`) y su `lengthTick` cubre hasta el final de la última nota (sin el silencio final de la grabación). `useStudio` deja de exponer `recordMode`/`setRecordMode`/`clearRegion` y el tipo `RecordMode` (era un toggle sin efecto); se eliminaron los componentes sin cablear `TransportBar.tsx` y `RegionTools.tsx` con sus re-exports. `commitModes.ts` se conserva como capacidad futura sin plumbing. Además, **la grabación de una toma nueva reinicia desde el tick 0 y reproduce las tomas commiteadas existentes por MIDI out como referencia** mientras se captura la nueva (estilo DAW; `player.cancel()` en record/stop emite all-notes-off; las tomas vacías no crean región). `tsc`/`lint`/`jest` en verde (**12 suites / 232 tests**).
- **Nota de repositorio (2026-10-18):** el árbol de trabajo tiene **cambios sin commitear** — `src/components/Waterfall.tsx` y `src/hooks/useStudio.ts`, correspondientes al hito **Waterfall unificado + 60 fps**; aún **no están en git**.
- **Nota de repositorio:** la carpeta `desing/` (imagen de referencia del rediseño, nombre con typo) **fue eliminada del repo y del índice** — no se versiona ni queda pendiente de decisión. El árbol de trabajo quedó limpio tras el commit de ese hito (en ese momento; ver nota del 2026-10-18 arriba sobre los cambios hoy pendientes de commit).
- **Nota de repositorio:** el **tarball** `midi-android-0.1.0.tgz` (`npm pack` del módulo, usado para probar la vinculación local `file:`) **ya está ignorado** vía `.gitignore` (`*.tgz`) — decisión **resuelta: ignorado**, no se versiona. La carpeta `.opencode/context/` **sí está en `.gitignore`** (decisiones privadas).

## ❓ Decisiones pendientes del usuario

1. **Punto de partida del módulo MIDI propio — RESUELTO: el módulo es nuestro (first-party)**, no derivado del código MIT de terceros de `react-native-midi-api@0.2.0`. Ya no es una decisión abierta. **Sigue pendiente:** el **renombrado del repo satélite** (hoy `midi-android`) y la **verificación con hardware real** del propio módulo.
2. **Formato de exportación/importación.** ¿Standard MIDI File (`.mid`) interoperable, o formato propio en JSON (más simple, menos útil fuera de la app)?
3. **Publicación del paquete satélite.** ¿Se publica abierto en npm como aporte a la comunidad, o queda privado para consumo propio?
4. **Nombre del paquete/repo satélite — PENDIENTE DE RENOMBRADO:** hoy es **`midi-android`** (paquete, repositorio y carpeta); el nombre es **provisional** y el renombrado sigue pendiente. La nota previa que lo daba por "definitivo" queda superada.

## 🔮 Futuras features (backlog)

- [ ] **Mostrar/ocultar notas sostenidas por el pedal** — opción en el menú de opciones (futuro) para alternar la visibilidad visual de las notas sostenidas (teclas violeta suave y/o notas en el waterfall) sin afectar el audio/MIDI. Hoy siempre visibles. — `@buddy` (UI), sin bloqueo de otras tareas.
- [ ] **Cambio de idioma en opciones** — añadir en el menú de opciones (futuro) la posibilidad de seleccionar el idioma de la interfaz (hoy la UI está en español). Incluir al menos español/inglés. — `@buddy` (UI) + `@writer` (textos), sin bloqueo.

## 📌 Contexto de Continuación (Para reanudar el chat)

- **Último punto de control (2026-10-18):** hito **Waterfall unificado + 60 fps**, **completo a nivel de código y en el árbol de trabajo sin commitear** (`src/components/Waterfall.tsx` + `src/hooks/useStudio.ts`): renderizado unificado en `Waterfall.tsx` (`renderAsLive`, **`renderRecordedNote` eliminado**), notas grabadas como **notas en vivo sintéticas** (`flowTick = position`, abiertas mientras el playhead las cubre y cerradas después, color por nota), waterfall **limpio en idle**, toma en curso **sin duplicar** (`useStudio.recordedNotes` solo con regiones commiteadas; lo vivo se muestra vía el store `liveNotes`) y **reloj de transporte/UI 33 → 16 ms (~60 fps)** (precisión de grabación intacta: `currentTick()` usa `performance.now()`). Store `liveNotes` y `tempo` siguen conectados (`useSyncExternalStore`, prop `tempo`, `quartersPerSecond` dinámico vía `flowQuartersPerSecond`, sin `1.5` hardcodeado). Verificación **ejecutada 2026-10-18**: `npx jest` → **11 suites / 230 tests en verde** (125 previos + 95 del waterfall: `noteGeometry` 43, `colors` 19, `liveNotes` 26, `tempo` 7 + 10 de `commitTake`), `npx tsc --noEmit` → exit 0, `npx expo lint` → exit 0, `npx expo-doctor` → 21/21 checks. *(Commiteados: refactor de grabación en `731193e`; Waterfall Continuo en `2a35f13`/`8fb8117`/`1ca9593`; rediseño del metronome en `09b357a`; hito Synthesia en `267c154`; **el hito actual no está commiteado**.)* Se extrajeron `src/core/waterfall/noteGeometry.ts` (`MIN_NOTE_PX`, `DEFAULT_PX_PER_QUARTER = 60`, `FADE_PORTION = 0.25`, `liveNoteGeometry()`), `src/core/waterfall/colors.ts` (`lighten`/`darken` movidos **verbatim** + `shadeByPosition`), `liveNotes.ts` y `tempo.ts`, todos testeados test-first. **Queda pendiente solo la validación visual del usuario en el build web** (incluida la del render unificado y de los 60 fps). En el satélite `midi-android` el **código está implementado** (parser, tracker, normalize, módulo Kotlin nativo send+receive, web adapter, harness; 4 suites / 125 tests y `tsc` en verde); queda **pendiente solo la verificación con hardware real**. `.opencode/context/` está en `.gitignore`.

- **✅ VERIFICADO (tests/tsc/lint) vs ⏳ PENDIENTE (validación visual del usuario en el build web):**
  1. ⏳ Ciclo de vida de la nota en vivo: nacer anclada al teclado, sostener y crecer, **congelar con la duración real al soltar**, subir con el reloj de flujo y desvanecerse en el 25% superior.
  2. ⏳ Gradiente vertical por posición (oscuro abajo / claro arriba), **solo visual**: `t=0` → `darken(base, 0.2)`, `t=1` → `lighten(base, 0.3)`.
  3. ⏳ `PX_PER_QUARTER = 60` ("un poco más alto").
  4. ⏳ Franja roja de 3px sobre el teclado y **toggle de paleta** por `paletteRegionId`.
  5. ⏳ **Waterfall idle limpio** (2026-10-18, por diseño): con el transporte detenido **no** se dibujan notas grabadas — solo notas en vivo de teclas sostenidas. El comportamiento anterior (notas grabadas permanentemente visibles en idle) fue **eliminado** con `renderRecordedNote`. Re-check visual pendiente.
  6. ⏳ **Render unificado de las notas grabadas** (ciclo de vida de nota en vivo contra el playhead: abiertas mientras lo cubren, cerradas después; color por nota) y **suavidad de animación a ~60 fps** (reloj 16 ms) — re-check visual pendiente.
  - Detalle caracterizado que conviene recordar: `lighten('#808080', 0.5)` devuelve `#c0c0c0` (redondea 191.5 → 192), **no** `#bfbfbf`.

- **Elementos abiertos / pendientes de decisión:**
  1. **Color y borrado por pista: ya implementados** (`setRegionColor`/`deleteRegion` en `useStudio`, `region.color` aplicado a las notas).
  2. **Verificación con hardware real en el satélite `midi-android` — SIGUE PENDIENTE** (Fase 0A, Hito 1; el código y el harness ya están): enumerar dispositivos, capturar note-on/note-off con su `timeStamp`, medir jitter y probar desconexión/reconexión, y generar el **build autónomo instalable en la tablet**.
  3. **Persistencia (Fase 7) — opcional**, sin iniciar: `expo-sqlite` + `expo-file-system` para guardar/cargar y exportación.
  4. **Target de escritorio (Fase 8)** — sin iniciar, ruta ya decidida (Electron/Tauri + `react-native-web` + Web MIDI).
  5. **Publicación del módulo (Hito 2+)**: evaluar publicar `midi-android` abierto en npm como aporte a la comunidad, o mantenerlo privado.
- **Revisión de documentación (2026-10-17, sin cambios de código):** una revisión del estado real del repo encontró desajustes entre la documentación y el código: `TransportBar` y `RegionTools` existen pero no están cableados en `index.tsx`; `commitModes` no se aplica en el flujo de grabación de la UI (las tomas se guardan como regiones independientes); `regionEditing` no tiene controles en pantalla (solo recolor + borrado); y el mensaje del commit `09b357a` menciona un count-in que **no está implementado**. **Solo se corrigió la documentación** (`README.md` y este `plan.md`); **no se hizo ningún cambio de código**.
- **Alternativa no bloqueante:** el trabajo del waterfall siguió avanzando **sin hardware**; lo único bloqueado por la verificación del satélite es la vía MIDI real (Fases 0A/1 y la prueba de hardware de la 6). Las Fases 7 y 8 tampoco dependen de esa verificación.
