# Ruta 7 Moto: sistema de diseño (v3, "hoja de ruta")

Rechazado antes: la v2 "señalética vial" (asfalto + amarillo señal + verde, Barlow Condensed). El detector daba 0 hallazgos,
pero la estructura era de plantilla: 9 secciones con el mismo molde, un hero de foto con dos botones, tarjetas iguales,
una tabla de precios y contenido inventado.

## Idea
La página es un **roadbook de rally**: la ruta se lee de arriba abajo, una casilla por pueblo, con el km a la izquierda,
la línea de la ruta al medio y lo que hay en ese punto a la derecha. Todo lo demás es secundario.

## Color
| token    | valor    | uso |
|----------|----------|-----|
| papel    | #FFFFFF  | fondo (blanco puro: el blanco tibio con rojo se lee como "crema + terracota") |
| tinta    | #1E2124  | texto, línea de la ruta, marcos |
| tinta-2  | #575C61  | texto secundario |
| regla    | #CDD1D4  | divisiones entre casillas |
| rojo     | #D11A1A  | **solo** advertencias de bencina (notas a mano) |
| lago     | #0F7F8C  | agua, balsas, enlaces |
| ripio    | #B3A27E  | barras de % de ripio |

## Tipografía
- Archivo (variable, wdth 62–125): km en wdth 125 y peso 800; nombres de pueblo en wdth 75 y peso 700; texto en wdth 100.
- Kalam 700, en rojo: notas a mano, solo para advertencias. Es el único gesto llamativo.
- Nada de mayúsculas en etiquetas, separadores con punto medio, flechas en botones ni monoespaciada.

## Reglas
- Sin contenido inventado. Los km son aproximados y se dice.
- Lo dinámico (autonomía, desde/hasta, ritmo) cambia las notas de la hoja, no abre otra sección.
- Fotos: solo Wikimedia Commons, con autor y licencia. La foto de un negocio es "la zona", hasta que el negocio suba la suya.
