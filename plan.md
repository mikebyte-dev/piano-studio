# 🚀 Plan de Proyecto: Piano Studio

> **Visión General:** Piano Studio es una app de piano centrada en la grabación MIDI: conectar un teclado MIDI físico por USB, grabar tomas, ver las notas a lo largo del tiempo en un piano roll horizontal estilo Synthesia/DAW, editar por regiones (no nota a nota) y contar con MIDI in y out. El objetivo es un MVP fiable construido sobre el proyecto Expo existente, sin migraciones innecesarias. La visión completa del autor está en [`docs/vision.md`](docs/vision.md).
> **Última Actualización:** 2026-10-15 — Decisiones de plataforma resueltas

## 🧱 Restricciones y hechos verificados del entorno

- **Stack actual:** Expo SDK 57 (`expo ~57.0.30`), React Native 0.86.3, React 19.2.3, NativeWind 4, TypeScript 6, `expo-dev-client` instalado, `react-native-web ~0.21.0` presente.
- **Estado del repositorio:** es una plantilla limpia. Solo contiene `src/app/_layout.tsx` (Stack + `global.css`) y `src/app/index.tsx` (placeholder). No hay código de MIDI, audio, secuenciación ni persistencia. No hay nada "existente" que conservar salvo el tooling.
- **Tests:** no hay infraestructura de tests todavía.
- **Hardware de pruebas:** una **tablet Android** (hoy conectada al PC por cable) y un piano **Roland FP-30X**. Probar contra el piano requiere un **build autónomo instalado en la tablet**, sin dependencia del cable al PC.
- **Capacidades del FP-30X — sin verificar (UNKNOWN):** si su MIDI es por USB y/o por Bluetooth MIDI, y si requiere driver o adaptador OTG. Se valida contra la documentación oficial de Roland en la Fase 0A. Si tuviera Bluetooth MIDI, permitiría probar en la tablet sin cables.
- **Alternativa no validada (UNKNOWN):** usar **Web MIDI API dentro de un WebView en Android** (Chrome Android soporta Web MIDI). Si funcionara, unificaría Android y escritorio en un único camino de código. **No es el plan** ni compromete la arquitectura: se evalúa como experimento dentro de la Fase 0A.
- **Verificación obligatoria (Definición de Terminado):** `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`.

## 🧭 Decisiones técnicas ya tomadas

- **MIDI nativo en Android:** se usará `android.media.midi.MidiManager` a través de un módulo Expo. No existe un módulo MIDI oficial de Expo. Librería candidata a validar: `react-native-midi-api` v0.2.0 (MIT, Expo Module, publicada 2026-09-01).
  - Librerías descartadas: `react-native-midi` (abandonada, sin licencia, último release 2021); `react-native-midi-device` y `react-native-usb-midi` (no existen en npm); `@motiz88/react-native-midi` (WIP desde 2023).
- **La capa MIDI se valida en un proyecto satélite, no en este repo:** no se compromete la arquitectura a una librería sin validarla. Proyecto satélite independiente: `D:\Programming\Projects\expo-midi` (nombre provisional), con plan propio ya escrito. Secuencia acordada: **validar → decidir (consumir la librería | fork/PR | módulo propio) → construir**. Intención: si la candidata no sirve, publicar un módulo MIDI open source como aporte a la comunidad.
- **Desacople obligatorio (principio de arquitectura, no una tarea):** la app se construye contra una **interfaz de adaptador MIDI** (entrada/salida) con una **implementación falsa/simulada**. El núcleo de dominio, el motor de grabación y toda la UI deben poder desarrollarse y testearse **hoy**, sin hardware y sin esperar el resultado del proyecto satélite. La librería MIDI real se conecta después, detrás de esa interfaz.
- **MIDI no funciona en Expo Go** → se trabaja con **development build**. Implica Android SDK/Android Studio y ciclos de compilación nativa.
- **Arquitectura:** la lógica de MIDI, transporte y grabación se separa de la UI en un núcleo puro y testeable; la UI se suscribe con selectores para que los eventos MIDI frecuentes no re-rendericen toda la app.
- **Referencia temporal:** los **timestamps nativos de los eventos MIDI** son la referencia temporal fiable. `performance.now()` en RN toma como origen el arranque del sistema (soporte parcial), por lo que no sirve como base para grabar.
- **Test-first para comportamiento nuevo:** los tests se escriben desde la especificación antes de implementar, y los revisa el orquestador como contrato.
- **Escritorio (Windows) — decidido:** build web con `react-native-web` + **Web MIDI API**, empaquetado con **Electron/Tauri**. `react-native-windows` queda **descartado definitivamente** para este stack (soporta RN 0.84, no 0.86; Expo no soporta Windows oficialmente). Restricción conocida: Web MIDI no está en Safari.

## 📊 Estado de Escalabilidad y Arquitectura

- [ ] Núcleo de dominio (proyecto, pistas, tomas, regiones, notas, ticks/PPQ) — sin iniciar
- [ ] Adaptador MIDI (interfaz de entrada/salida + implementación falsa/simulada) — sin iniciar; forma parte del núcleo desde el inicio
- [ ] Transporte y reloj musical — sin iniciar
- [ ] Entrada MIDI (Android USB) — sin iniciar; la implementación real depende del resultado de la Fase 0A
- [ ] Motor de grabación (overdub / replace) — sin iniciar
- [ ] Salida MIDI (MIDI out) — sin iniciar
- [ ] UI: transporte, panel de pistas desplegable, piano roll horizontal, teclado, timeline, cursor — sin iniciar
- [ ] Edición de regiones (seleccionar, mover, recortar, redimensionar) — sin iniciar
- [ ] Persistencia y exportación — sin iniciar
- [ ] Infraestructura de tests (jest-expo + @testing-library/react-native) — sin iniciar
- [ ] Target de escritorio (Electron/Tauri + `react-native-web` + Web MIDI) — decidido, sin iniciar

## 🎯 Tareas Activas y Priorizadas

### 🔴 En Progreso

Son **dos tareas paralelas e independientes**: no se bloquean entre sí y pueden ejecutarse a la vez (`@buddy` puede tomar una mientras la otra espera hardware o tiempos de build). La 0A ocurre en el proyecto satélite; la 0B, en este repo.

- [ ] **Fase 0A — Spike de viabilidad MIDI (en el proyecto satélite `expo-midi`)**
  - **Asignación:** `@buddy` (implementación) con validación de `@tester`. El detalle completo vive en `D:\Programming\Projects\expo-midi\plan.md`.
  - **Objetivo:** decidir la capa MIDI real antes de construir encima, con evidencia y no con suposiciones.
  - **Tareas internas:**
    1. Comprobar si la librería candidata `react-native-midi-api@0.2.0` tiene repositorio público (código, issues, mantenimiento).
    2. App de prueba mínima con SDK 57 y development build; validar que compila y enlaza (`expo-doctor` limpio).
    3. Con hardware real: enumerar dispositivos, capturar note-on/note-off con su `timeStamp`, medir jitter (p50/p95) y probar desconexión/reconexión con una tecla presionada (el caso donde quedan notas colgadas).
    4. Verificar las capacidades MIDI del **Roland FP-30X** contra la documentación oficial de Roland (USB y/o Bluetooth MIDI, driver, adaptador OTG).
    5. Generar un **build autónomo instalable en la tablet** para probar contra el piano sin el cable al PC.
    6. Evaluar la alternativa **Web MIDI API en WebView** en Android (marcada explícitamente como alternativa no validada).
    7. Registrar la decisión (**consumir | fork/PR | módulo propio**) con su evidencia y alternativas descartadas.
  - **Criterio de aceptación:** informe con datos concretos (compila sí/no, dispositivo detectado, cantidad de eventos capturados, jitter p50/p95, comportamiento ante desconexión) y la decisión de capa MIDI registrada con sus alternativas descartadas.

- [ ] **Fase 0B — Infraestructura de tests + núcleo de dominio + adaptador MIDI falso (en este repo, sin hardware)**
  - **Asignación:** `@buddy` (implementación) con revisión de `@tester`.
  - **Objetivo:** poder desarrollar y testear el núcleo y la UI hoy, sin hardware y sin esperar a la Fase 0A.
  - **Tareas internas:**
    1. Instalar `jest-expo` 57.0.6 + `@testing-library/react-native` 14.1.0 y el script de test.
    2. Definir el modelo: proyecto, pista, toma/región, nota con pitch/velocity/ticks/duración, PPQ y tempo.
    3. Definir la **interfaz del adaptador MIDI** (entrada/salida) y su **implementación falsa/simulada**: entrada simulada/scriptada para tests y para desarrollar la UI sin hardware.
  - **Criterio de aceptación:** `npx tsc --noEmit`, `npx expo lint` y los tests en verde, con los tests escritos **antes** de la implementación a partir de la especificación.

### 🟡 Próximas Tareas (Orden Recomendado)

1. [ ] **Fase 1 — Integración de la capa MIDI real (en este repo)** — `@buddy`, validación de `@tester`
   - **Depende del resultado de la Fase 0A.** Consiste en implementar el adaptador MIDI real detrás de la interfaz definida en la Fase 0B, sin tocar el núcleo ni la UI.
   - **Criterio de aceptación:** la app recibe eventos del teclado real a través de la interfaz, con los mismos tests del adaptador falso en verde.
2. [ ] **Fase 2 — Transporte y motor de grabación (overdub / replace)** — `@buddy`, validación de `@tester`
   - Posición en ticks, play/stop/record, semántica precisa de overdub y de replace (replace solo altera el rango de grabación y no toca material ajeno), flush de notas activas al detener para evitar notas colgadas.
   - **Criterio de aceptación:** tests rojos primero, luego verde; validación de `@tester`.
3. [ ] **Fase 3 — UI base del piano roll** — `@buddy`
   - Layout oscuro, barra de transporte, panel de pistas desplegable/colapsable, teclado horizontal, timeline, cursor vertical y rejilla.
   - **Criterio de aceptación:** typecheck y lint verdes; verificación visual en el dispositivo (se admite validación después, es UX).
4. [ ] **Fase 4 — Grabación en vivo de punta a punta** — `@buddy` con `@tester`
   - Overdub y replace con teclado real, notas nuevas visibles durante la grabación y diferenciación visual entre material previo y recién grabado.
   - **Criterio de aceptación:** una toma grabada y visible sin detener la grabación.
5. [ ] **Fase 5 — Edición por regiones** — `@buddy`, tests de `@tester`
   - Seleccionar, mover en el tiempo, recortar inicio/final y cambiar duración.
   - **Criterio de aceptación:** operaciones cubiertas por tests de la lógica, no de la UI.
6. [ ] **Fase 6 — Salida MIDI** — `@buddy`, prueba en hardware de `@tester`
   - Enviar a dispositivo externo, all-notes-off al detener.
   - **Criterio de aceptación:** prueba en hardware.
7. [ ] **Fase 7 — Persistencia** — `@buddy`
   - `expo-sqlite` para metadatos y `expo-file-system` (API nueva: `File`, `Directory`, `Paths`) para archivos, más guardar/cargar proyecto y exportación.
   - **Criterio de aceptación:** cerrar la app y recuperar el proyecto.
8. [ ] **Fase 8 — Target de escritorio** — `@buddy`
   - Ruta ya decidida (Electron/Tauri + `react-native-web` + Web MIDI), sin bloqueo de decisión. Queda supeditada a que el núcleo funcione primero. Restricción conocida: Web MIDI no está en Safari.

### 🟢 Completadas

- [x] Inicialización de la estructura de trabajo: `plan.md` versionado + `.opencode/context/decision_log.md` privado e ignorado por git.
- [x] Inspección del estado inicial del repositorio.

## ❓ Decisiones pendientes del usuario

1. **Formato de exportación/importación.** ¿Standard MIDI File (`.mid`) interoperable, o formato propio en JSON (más simple, menos útil fuera de la app)?
2. **Publicación del paquete satélite.** ¿Se publica abierto en npm como aporte a la comunidad, o queda privado para consumo propio?
3. **Nombre del paquete satélite.** Sigue pendiente el nombre definitivo (el prefijo `expo-` en un paquete no oficial es mal visto en la comunidad).

## 📌 Contexto de Continuación (Para reanudar el chat)

- **Último punto de control:** plan actualizado con las decisiones de plataforma resueltas (escritorio, validación de la capa MIDI en proyecto satélite y adaptador MIDI desacoplado). Sin código de producto todavía.
- **Siguiente paso exacto:** ejecutar la **Fase 0A** (spike en el proyecto satélite `expo-midi`), arrancando por la validación de la librería candidata y el build autónomo en la tablet, **en paralelo** con la **Fase 0B** en este repo (infraestructura de tests + núcleo de dominio + adaptador MIDI falso).
