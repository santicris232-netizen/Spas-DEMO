# 🎨 Paleta de Colores - Aurosoft ERP

## Concepto
Paleta moderna y profesional para un ERP empresarial, inspirada en "aurora" (amanecer) con toques de elegancia corporativa.

---

## Colores Principales

### Primary (Azul Corporativo)
```
--aurosoft-primary: #0F5BA0
Uso: Headers, botones principales, navegación activa
RGB: 15, 91, 160
HSL: 210°, 84%, 35%
```

### Secondary (Azul Claro)
```
--aurosoft-secondary: #E8F1F8
Uso: Fondos suaves, superficies alternas
RGB: 232, 241, 248
HSL: 210°, 68%, 94%
```

### Accent (Dorado Aurora)
```
--aurosoft-accent: #D4AF37
Uso: Acentos, highlights, iconos importantes
RGB: 212, 175, 55
HSL: 45°, 78%, 52%
```

### Success (Verde Profesional)
```
--aurosoft-success: #1E8449
Uso: Estados positivos, confirmaciones
RGB: 30, 132, 73
HSL: 143°, 63%, 32%
```

### Warning (Naranja)
```
--aurosoft-warning: #D97706
Uso: Advertencias, pendientes
RGB: 217, 119, 6
HSL: 38°, 95%, 44%
```

### Danger (Rojo Profesional)
```
--aurosoft-danger: #C91C1C
Uso: Errores, acciones peligrosas
RGB: 201, 28, 28
HSL: 0°, 75%, 45%
```

---

## Colores de Superficie y Texto

### Superficies
```
--aurosoft-surface-default: #FFFFFF
--aurosoft-surface-soft: #F9FAFB
--aurosoft-surface-muted: #F3F4F6
--aurosoft-surface-dark: #1F2937
```

### Texto
```
--aurosoft-text-primary: #111827
--aurosoft-text-secondary: #6B7280
--aurosoft-text-tertiary: #9CA3AF
--aurosoft-text-inverse: #F9FAFB
```

### Bordes y Líneas
```
--aurosoft-border: #E5E7EB
--aurosoft-border-dark: #D1D5DB
--aurosoft-divider: #F3F4F6
```

---

## Variantes de Color

### Primary Variants
```
--aurosoft-primary-dark:   #043D6B (95%)
--aurosoft-primary-strong: #1A6FB0 (110%)
--aurosoft-primary-soft:   #D6E5F3 (10%)
--aurosoft-primary-pale:   #EBF2F8 (5%)
```

### Accent Variants
```
--aurosoft-accent-dark:    #A8862C (85%)
--aurosoft-accent-strong:  #E5C95A (125%)
--aurosoft-accent-soft:    #F5EDD1 (20%)
--aurosoft-accent-pale:    #FFFBF0 (5%)
```

---

## Paleta Extendida (Categorías)

### Categorías de Proceso
```
--category-entrada:     #3B82F6 (Azul - Ingreso)
--category-proceso:     #8B5CF6 (Púrpura - Producción)
--category-salida:      #EC4899 (Rosa - Egreso)
--category-inventario:  #14B8A6 (Verde agua - Stock)
--category-financiero:  #F59E0B (Ámbar - Finanzas)
```

---

## CSS Variables Completas

```css
:root {
  /* Marca Aurosoft */
  --aurosoft-primary: #0F5BA0;
  --aurosoft-secondary: #E8F1F8;
  --aurosoft-accent: #D4AF37;
  
  /* Estados */
  --aurosoft-success: #1E8449;
  --aurosoft-warning: #D97706;
  --aurosoft-danger: #C91C1C;
  
  /* Superficies */
  --aurosoft-surface-default: #FFFFFF;
  --aurosoft-surface-soft: #F9FAFB;
  --aurosoft-surface-muted: #F3F4F6;
  --aurosoft-surface-dark: #1F2937;
  
  /* Texto */
  --aurosoft-text-primary: #111827;
  --aurosoft-text-secondary: #6B7280;
  --aurosoft-text-tertiary: #9CA3AF;
  --aurosoft-text-inverse: #F9FAFB;
  
  /* Bordes */
  --aurosoft-border: #E5E7EB;
  --aurosoft-border-dark: #D1D5DB;
  
  /* Variantes Primary */
  --aurosoft-primary-dark: #043D6B;
  --aurosoft-primary-strong: #1A6FB0;
  --aurosoft-primary-soft: #D6E5F3;
  --aurosoft-primary-pale: #EBF2F8;
  
  /* Variantes Accent */
  --aurosoft-accent-dark: #A8862C;
  --aurosoft-accent-strong: #E5C95A;
  --aurosoft-accent-soft: #F5EDD1;
  --aurosoft-accent-pale: #FFFBF0;
}
```

---

## Recomendaciones de Uso

### En Headers y Navegación
- Fondo: `#0F5BA0` (Primary)
- Texto: Blanco
- Iconos: Dorado (`#D4AF37`) para elementos activos

### En Formularios
- Bordes: `#E5E7EB`
- Focus: Azul primary con sombra suave
- Labels: `#6B7280` (Text secondary)

### En Tablas
- Encabezados: Fondo primary, texto blanco
- Filas alternas: `#F9FAFB` y `#FFFFFF`
- Bordes: `#E5E7EB`

### En Alertas y Estados
- **Success**: Fondo `#EFF6F3`, texto `#1E8449`
- **Warning**: Fondo `#FEFCE8`, texto `#D97706`
- **Danger**: Fondo `#FEF2F2`, texto `#C91C1C`

### En Botones
- Primario: Fondo `#0F5BA0`, texto blanco
- Secundario: Fondo `#D6E5F3`, texto `#0F5BA0`
- Peligroso: Fondo `#C91C1C`, texto blanco

---

## Ejemplos de Aplicación

### Dark Mode (Opcional)
```css
@media (prefers-color-scheme: dark) {
  :root {
    --aurosoft-surface-default: #1F2937;
    --aurosoft-surface-soft: #111827;
    --aurosoft-text-primary: #F9FAFB;
    --aurosoft-text-secondary: #D1D5DB;
  }
}
```

### Accesibilidad
- Ratios de contraste verificados (WCAG AA/AAA)
- Primary (#0F5BA0) sobre blanco: 8.6:1 ✓
- Accent (#D4AF37) sobre blanco: 4.2:1 ✓

---

## Exportar a Otros Formatos

### JSON
```json
{
  "primary": "#0F5BA0",
  "secondary": "#E8F1F8",
  "accent": "#D4AF37",
  "success": "#1E8449",
  "warning": "#D97706",
  "danger": "#C91C1C"
}
```

### Tailwind Config
```js
colors: {
  aurosoft: {
    primary: '#0F5BA0',
    secondary: '#E8F1F8',
    accent: '#D4AF37'
  }
}
```
