# Piano Studio — Documento de Visión

> Este es el documento de visión original del autor. Es la fuente de la sección "Visión General" y del alcance descrito en `plan.md`.

# Piano Studio — Idea y visión del proyecto

## 1. Concepto

Piano Studio es una aplicación musical centrada en el piano y la grabación MIDI.
Quiero una herramienta sencilla, visual y fluida que me permita tocar un piano
físico, grabar diferentes tomas y ver cómo se distribuyen las notas en el
tiempo.

La experiencia visual estará inspirada en Synthesia y en las interfaces de los
DAW, pero enfocada en el piano y en la grabación de interpretaciones, sin la
complejidad de un editor musical profesional completo.

El objetivo es desarrollar un MVP funcional sobre el proyecto existente,
conservando lo que ya sirva y evitando cambios innecesarios.

## 2. Plataformas y tecnologías

- Quiero utilizar la base tecnológica que ya tiene el proyecto: React Native,
  Expo y NativeWind.
- La aplicación está destinada a Android y escritorio, con Windows como entorno
  de desarrollo principal.
- La compatibilidad real con cada plataforma debe determinarse a partir del
  código existente y de sus requisitos técnicos.
- No quiero migraciones de tecnología innecesarias. Si alguna plataforma
  requiere una solución distinta, deberá justificarse antes de cambiar la
  arquitectura.

## 3. Interfaz y experiencia visual

Quiero una interfaz oscura, minimalista, moderna y orientada a la producción
musical.

La pantalla principal debe organizarse alrededor de un piano horizontal y una
timeline musical.

### Barra superior

En la parte superior quiero controles de transporte accesibles, como:

- Play.
- Stop.
- Record.
- Posición actual de reproducción o grabación.
- Controles básicos de tempo y otros ajustes esenciales cuando correspondan.

### Panel de pistas

También quiero un panel de controles de pistas situado en la zona superior, que
pueda desplegarse y contraerse para mantener despejada el área principal.

Desde este panel quiero poder consultar y controlar las pistas y sus tomas de
forma sencilla.

### Piano y timeline

La zona principal debe mostrar:

- Un teclado de piano horizontal.
- Las notas MIDI representadas a lo largo del tiempo.
- Un cursor vertical que indique la posición actual.
- Las tomas existentes y las nuevas notas que se estén grabando.
- Una diferenciación visual clara entre el material anterior y el recién
  grabado.
- Regiones que puedan seleccionarse y manipularse directamente.

La interfaz debe priorizar la claridad y la fluidez al tocar, grabar y revisar
interpretaciones.

## 4. Grabación MIDI

La grabación es una de las funciones centrales de Piano Studio.

Quiero conectar un teclado MIDI físico por USB y grabar interpretaciones dentro
de la aplicación.

Deben existir dos modos de grabación:

### Overdub

Permite grabar material nuevo sobre material existente sin eliminar las tomas
anteriores.

Durante la grabación quiero seguir viendo las notas anteriores y las que estoy
tocando en ese momento.

### Replace

Permite sustituir el material de una región o del ámbito de grabación definido,
sin borrar accidentalmente contenido ajeno a esa operación.

Ambos modos deben comportarse de forma predecible y conservar las tomas que no
corresponda modificar.

## 5. Edición centrada en regiones

No quiero que el MVP se convierta en un editor completo de notas individuales.

La edición debe centrarse en las regiones y las tomas como unidades de trabajo.

Quiero poder:

- Seleccionar una región.
- Moverla en el tiempo.
- Recortar su inicio o final.
- Modificar su duración.
- Organizar y revisar las distintas tomas.

La prioridad es que grabar y reorganizar interpretaciones resulte sencillo, no
disponer de todas las herramientas de edición de un DAW tradicional.

## 6. Entrada y salida MIDI

La entrada principal será un teclado MIDI físico conectado por USB.

También quiero poder enviar MIDI a un instrumento o dispositivo de sonido
externo para escuchar las interpretaciones a través de ese equipo.

La aplicación debe gestionar correctamente el inicio y el final de las notas, la
reproducción y la grabación, y evitar notas que se queden activas por errores de
sincronización o desconexiones.

La compatibilidad con dispositivos, conexiones y sistemas operativos deberá
validarse en el hardware real. No doy por hecho que todas las plataformas tengan
las mismas capacidades MIDI.

## 7. Comportamiento y rendimiento

Quiero que Piano Studio responda con fluidez mientras toco y grabo.

Las notas nuevas deben aparecer sin tener que detener la grabación. El cursor y
la reproducción deben mantenerse sincronizados con el tiempo musical.

La lógica de MIDI, transporte y grabación debe estar separada de la interfaz
para que los eventos MIDI frecuentes no provoquen actualizaciones innecesarias
de toda la aplicación.

La prioridad es tener un comportamiento fiable y una experiencia de uso
consistente antes de añadir funciones avanzadas.

## 8. Alcance del MVP

La primera versión debe concentrarse en:

1. Una interfaz principal funcional con piano horizontal, timeline, transporte y
   panel de pistas desplegable.
2. Visualización de notas MIDI y regiones.
3. Entrada MIDI desde un teclado físico.
4. Grabación en modo overdub y replace.
5. Visualización simultánea de tomas anteriores y nuevas.
6. Edición básica de regiones.
7. Salida MIDI hacia un dispositivo externo compatible.
8. Un proyecto que pueda ejecutarse y probarse de forma reproducible en las
   plataformas que se hayan validado.

No es prioritario incluir un editor avanzado de notas, efectos de audio,
mezcladores complejos ni funciones que no sean necesarias para demostrar el
funcionamiento central.

## 9. Principios del proyecto

- Partir del repositorio existente.
- Entender el estado actual antes de modificarlo.
- Conservar las funciones y configuraciones que ya funcionan.
- Evitar migraciones y dependencias innecesarias.
- No asumir compatibilidad multiplataforma sin comprobarla.
- Priorizar la fiabilidad de la grabación y del MIDI.
- Mantener una interfaz clara, compacta y centrada en el piano.
- Validar el funcionamiento real y distinguirlo de las simulaciones.
- Evitar cambios destructivos y preservar el trabajo existente.

## 10. Libertad para el agente de código

Este documento describe la idea, la experiencia deseada y las prioridades de
Piano Studio. No impone una arquitectura técnica definitiva ni un orden
obligatorio de implementación.

El agente de código debe inspeccionar el proyecto existente, comprender sus
capacidades y limitaciones, consultar la documentación pertinente y decidir la
mejor forma de abordar el desarrollo.

Debe elaborar su propio plan técnico, determinar las fases de trabajo,
identificar los riesgos y proponer las modificaciones necesarias antes de
ejecutarlas.

El objetivo final es conseguir una aplicación funcional y fiable para grabar,
visualizar y organizar interpretaciones de piano MIDI, con una experiencia
sencilla y enfocada en tocar música.
