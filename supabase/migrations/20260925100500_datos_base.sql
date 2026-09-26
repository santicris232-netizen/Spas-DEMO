-- =============================================================================
-- CristaSpa v2 · 06 · Datos base de plataforma: plantillas de catálogo
-- Se copian a una empresa nueva al crearla (docs/flujos/12-modulo-desarrollador.md#5-plantillas).
-- Precios en la moneda de la empresa; duraciones en minutos (el jefe las ajusta).
-- =============================================================================

insert into public.plantillas (clave, nombre, descripcion, contenido) values
(
  'vacia',
  'Vacía',
  'Una sola categoría "General" sin servicios.',
  '{"categorias": [{"nombre": "General", "slug": "general", "color": "#175050", "servicios": []}]}'
),
(
  'pestanas-y-cejas',
  'Pestañas, cejas y labios',
  'Catálogo base de estudios de pestañas (servicios originales de Maison Lash).',
  '{"categorias": [
    {"nombre": "Pestañas", "slug": "pestanas", "color": "#175050", "servicios": [
      {"nombre": "Lifting de Pestañas", "descripcion": "Tratamiento que curva y levanta tus pestañas naturales desde la raíz con resultado de 6 a 8 semanas.", "precio": 80000, "duracion_min": 60},
      {"nombre": "Extensiones Clásicas", "descripcion": "Aplicación de una extensión por pestaña natural para una mirada elegante y natural.", "precio": 120000, "duracion_min": 120},
      {"nombre": "Extensiones Volumen", "descripcion": "Técnica de abanicos para un efecto lleno, definido y cómodo.", "precio": 160000, "duracion_min": 150},
      {"nombre": "Tinte de Pestañas", "descripcion": "Coloración profesional que intensifica el tono natural de tus pestañas.", "precio": 45000, "duracion_min": 30},
      {"nombre": "Mantenimiento Express", "descripcion": "Relleno y ajuste de extensiones para conservar una mirada cuidada.", "precio": 70000, "duracion_min": 60}
    ]},
    {"nombre": "Cejas", "slug": "cejas", "color": "#8a5a34", "servicios": [
      {"nombre": "Diseño de Cejas", "descripcion": "Diseño según la morfología del rostro con perfilado y definición.", "precio": 35000, "duracion_min": 45},
      {"nombre": "Laminado de Cejas", "descripcion": "Tratamiento de reestructuración que fija y ordena el vello por varias semanas.", "precio": 90000, "duracion_min": 60},
      {"nombre": "Henna de Cejas", "descripcion": "Coloración natural que aporta profundidad y definición a las cejas.", "precio": 55000, "duracion_min": 45}
    ]},
    {"nombre": "Labios", "slug": "labios", "color": "#b05b74", "servicios": [
      {"nombre": "Hidratación de Labios", "descripcion": "Tratamiento nutritivo con exfoliación y mascarilla hidratante profesional.", "precio": 40000, "duracion_min": 45},
      {"nombre": "Blushed Lips", "descripcion": "Maquillaje semipermanente con acabado natural y color difuminado.", "precio": 180000, "duracion_min": 150}
    ]}
  ]}'
),
(
  'spa-bienestar',
  'Spa y bienestar',
  'Masajes, faciales y tratamientos corporales.',
  '{"categorias": [
    {"nombre": "Masajes", "slug": "masajes", "color": "#247068", "servicios": [
      {"nombre": "Masaje Relajante", "descripcion": "Masaje de cuerpo completo con aceites esenciales.", "precio": 120000, "duracion_min": 60},
      {"nombre": "Masaje de Tejido Profundo", "descripcion": "Presión firme para liberar tensión muscular.", "precio": 140000, "duracion_min": 60},
      {"nombre": "Piedras Calientes", "descripcion": "Masaje con piedras volcánicas para relajación profunda.", "precio": 160000, "duracion_min": 90}
    ]},
    {"nombre": "Faciales", "slug": "faciales", "color": "#b05b74", "servicios": [
      {"nombre": "Limpieza Facial Profunda", "descripcion": "Limpieza, exfoliación, extracción e hidratación.", "precio": 110000, "duracion_min": 75},
      {"nombre": "Facial Hidratante", "descripcion": "Tratamiento de hidratación intensiva para todo tipo de piel.", "precio": 95000, "duracion_min": 60}
    ]},
    {"nombre": "Corporales", "slug": "corporales", "color": "#8a5a34", "servicios": [
      {"nombre": "Exfoliación Corporal", "descripcion": "Renovación de la piel con exfoliante natural.", "precio": 100000, "duracion_min": 60}
    ]}
  ]}'
),
(
  'unas',
  'Uñas',
  'Manicure, pedicure y sistemas de uñas.',
  '{"categorias": [
    {"nombre": "Manos", "slug": "manos", "color": "#b05b74", "servicios": [
      {"nombre": "Manicure Tradicional", "descripcion": "Limpieza, forma y esmaltado tradicional.", "precio": 25000, "duracion_min": 45},
      {"nombre": "Manicure Semipermanente", "descripcion": "Esmaltado en gel de larga duración.", "precio": 45000, "duracion_min": 60}
    ]},
    {"nombre": "Pies", "slug": "pies", "color": "#247068", "servicios": [
      {"nombre": "Pedicure Spa", "descripcion": "Pedicure con exfoliación e hidratación.", "precio": 40000, "duracion_min": 60}
    ]},
    {"nombre": "Sistemas", "slug": "sistemas", "color": "#8a5a34", "servicios": [
      {"nombre": "Uñas Acrílicas", "descripcion": "Aplicación completa de uñas acrílicas.", "precio": 90000, "duracion_min": 120},
      {"nombre": "Retoque de Acrílicas", "descripcion": "Relleno y mantenimiento del sistema.", "precio": 60000, "duracion_min": 90}
    ]}
  ]}'
),
(
  'barberia',
  'Barbería',
  'Cortes, barba y combos.',
  '{"categorias": [
    {"nombre": "Corte", "slug": "corte", "color": "#175050", "servicios": [
      {"nombre": "Corte Clásico", "descripcion": "Corte a máquina y tijera con acabado.", "precio": 25000, "duracion_min": 30},
      {"nombre": "Corte y Lavado", "descripcion": "Corte con lavado y peinado.", "precio": 32000, "duracion_min": 45}
    ]},
    {"nombre": "Barba", "slug": "barba", "color": "#8a5a34", "servicios": [
      {"nombre": "Perfilado de Barba", "descripcion": "Perfilado con navaja y toalla caliente.", "precio": 18000, "duracion_min": 30}
    ]},
    {"nombre": "Combos", "slug": "combos", "color": "#c9a020", "servicios": [
      {"nombre": "Corte + Barba", "descripcion": "Servicio completo de corte y barba.", "precio": 38000, "duracion_min": 60}
    ]}
  ]}'
)
on conflict (clave) do nothing;
