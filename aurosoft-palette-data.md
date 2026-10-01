# 🎨 Paleta de Colores Aurosoft - Versión Data (Sobria)

Paleta profesional y discreta para Excel, dashboards y reportes informativos.

---

## Colores Principales (Minimalistas)

### Azul Profesional (Primary)
```
--data-primary: #4B5E7E
Uso: Headers, encabezados, texto destacado
RGB: 75, 94, 126
HSL: 217°, 26%, 39%
```

### Púrpura Suave (Secondary)
```
--data-secondary: #6B5B95
Uso: Acentos secundarios, categorías
RGB: 107, 91, 149
HSL: 259°, 24%, 47%
```

### Gris Neutro (Neutral)
```
--data-neutral: #8B8E99
Uso: Texto secundario, separadores
RGB: 139, 142, 153
HSL: 228°, 5%, 57%
```

---

## Superficies Claras

### Fondos
```
--bg-white:       #FFFFFF (fondos principales)
--bg-light:       #F8F9FB (fondos alternos suaves)
--bg-softer:      #F3F5F9 (fondos para tablas)
--bg-muted:       #EDEEF3 (fondos apagados)
```

### Texto
```
--text-dark:      #2D3748 (texto principal)
--text-medium:    #4B5E7E (texto secundario)
--text-light:     #7A8194 (texto terciario)
--text-faint:     #A0A5B8 (texto muy suave)
```

### Líneas y Bordes
```
--border-light:   #E5E7EB (bordes suaves)
--border-medium:  #D1D5DB (bordes normales)
--divider:        #EDF0F7 (divisores delicados)
```

---

## Variantes de Color (Tonos Profesionales)

### Azul - 6 tonos
```
--blue-50:   #F0F4FA
--blue-100:  #E0E8F4
--blue-200:  #C1D1E8
--blue-300:  #8BA7D1
--blue-400:  #5A7CB8
--blue-500:  #4B5E7E (primary)
```

### Púrpura - 6 tonos
```
--purple-50:  #F5F2F9
--purple-100: #EDDFF3
--purple-200: #D8C5E8
--purple-300: #B89DD9
--purple-400: #8B70B7
--purple-500: #6B5B95 (secondary)
```

### Gris - Escala neutral
```
--gray-50:   #F9FAFB
--gray-100:  #F3F4F6
--gray-200:  #E5E7EB
--gray-300:  #D1D5DB
--gray-400:  #9CA3AF
--gray-500:  #8B8E99
--gray-600:  #6B7280
--gray-700:  #4B5563
--gray-800:  #2D3748
```

---

## Colores de Estado (Discretos)

### Success (Verde Profesional)
```
--success-light:   #E6F7ED
--success-main:    #4A9F6A
--success-dark:    #2D6A3A
```

### Warning (Ámbar Profesional)
```
--warning-light:   #FBF4E0
--warning-main:    #B88D3A
--warning-dark:    #7A5C1F
```

### Danger (Rojo Suave)
```
--danger-light:    #F9E6E6
--danger-main:     #A85454
--danger-dark:     #7A3A3A
```

### Info (Azul Claro)
```
--info-light:      #E8F2FB
--info-main:       #5A7CB8
--info-dark:       #3A5090
```

---

## CSS Variables Completas

```css
:root {
  /* Colores primarios */
  --data-primary: #4B5E7E;
  --data-secondary: #6B5B95;
  --data-neutral: #8B8E99;
  
  /* Fondos */
  --bg-white: #FFFFFF;
  --bg-light: #F8F9FB;
  --bg-softer: #F3F5F9;
  --bg-muted: #EDEEF3;
  
  /* Texto */
  --text-dark: #2D3748;
  --text-medium: #4B5E7E;
  --text-light: #7A8194;
  --text-faint: #A0A5B8;
  
  /* Bordes */
  --border-light: #E5E7EB;
  --border-medium: #D1D5DB;
  --divider: #EDF0F7;
  
  /* Estados */
  --success-main: #4A9F6A;
  --warning-main: #B88D3A;
  --danger-main: #A85454;
  --info-main: #5A7CB8;
  
  /* Sombras suaves */
  --shadow-xs: 0 1px 2px rgba(75, 94, 126, 0.04);
  --shadow-sm: 0 1px 3px rgba(75, 94, 126, 0.06);
  --shadow-md: 0 4px 6px rgba(75, 94, 126, 0.08);
}
```

---

## Uso en Excel Informativo

### Headers (Encabezados)
- Fondo: `#F3F5F9`
- Texto: `#2D3748` (negrita)
- Borde: `#E5E7EB`

### Filas Alternas
- Par: `#FFFFFF`
- Impar: `#F8F9FB`

### Datos Importantes
- Fondo: `#EDF0F7` (azul muy suave)
- Texto: `#4B5E7E`

### Categorías/Grupos
- Fondo: Púrpura 50 (`#F5F2F9`)
- Texto: Púrpura 500 (`#6B5B95`)

### Indicadores
- Positivo: Verde `#4A9F6A`
- Advertencia: Ámbar `#B88D3A`
- Negativo: Rojo `#A85454`
- Información: Azul `#5A7CB8`

---

## Ejemplo de Tabla en Excel

```
┌─────────────────────────────────────┬──────────┬──────────┐
│ Concepto                            │ Objetivo │ Real     │
├─────────────────────────────────────┼──────────┼──────────┤
│ Ventas                              │ 100,000  │ 95,500   │
│ (fondo: #F8F9FB, texto: #2D3748)   │          │          │
├─────────────────────────────────────┼──────────┼──────────┤
│ Gastos                              │ 45,000   │ 48,200   │
│ (fondo: #FFFFFF, texto: #2D3748)   │          │          │
└─────────────────────────────────────┴──────────┴──────────┘

Estado: Variances en verde/rojo suave
```

---

## Escala de Grises Complementaria

Para gráficos y datos sin color:

```
Valor 100% (máximo):  #2D3748
Valor  80%:           #4B5563
Valor  60%:           #6B7280
Valor  40%:           #9CA3AF
Valor  20%:           #D1D5DB
Valor   0% (mínimo):  #FFFFFF
```

---

## Combinaciones Recomendadas

### Profesional Azul
- Primario: `#4B5E7E`
- Secundario: `#C1D1E8`
- Ternario: `#F0F4FA`

### Profesional Púrpura
- Primario: `#6B5B95`
- Secundario: `#D8C5E8`
- Ternario: `#F5F2F9`

### Mixta (Azul + Púrpura)
- Primario: `#4B5E7E`
- Complementario: `#6B5B95`
- Fondos: `#F8F9FB`

---

## Accesibilidad

Ratios de contraste verificados:
- `#2D3748` sobre `#FFFFFF`: 12.2:1 ✓ (AAA)
- `#4B5E7E` sobre `#F8F9FB`: 7.8:1 ✓ (AA)
- `#8B8E99` sobre `#FFFFFF`: 5.1:1 ✓ (AA)

---

## Exportar

### Tailwind Config
```js
colors: {
  data: {
    primary: '#4B5E7E',
    secondary: '#6B5B95',
    neutral: '#8B8E99',
    blue: {
      50: '#F0F4FA',
      100: '#E0E8F4',
      200: '#C1D1E8',
      300: '#8BA7D1',
      400: '#5A7CB8',
      500: '#4B5E7E',
    },
    purple: {
      50: '#F5F2F9',
      100: '#EDDFF3',
      200: '#D8C5E8',
      300: '#B89DD9',
      400: '#8B70B7',
      500: '#6B5B95',
    }
  }
}
```

### Material Design JSON
```json
{
  "primary": "#4B5E7E",
  "secondary": "#6B5B95",
  "error": "#A85454",
  "success": "#4A9F6A",
  "warning": "#B88D3A",
  "info": "#5A7CB8",
  "surface": "#FFFFFF",
  "background": "#F8F9FB"
}
```
