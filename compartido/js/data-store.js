/*
  Maison Lash - almacenamiento compartido.
  Mantiene una unica fuente de datos para servicios, productos, clientes,
  empleados, citas y configuracion usando localStorage.
*/
(function () {
  'use strict';

  const STORAGE_KEYS = {
    services: 'maisonlash_v3',
    products: 'maisonlash_boss_products',
    clients: 'maisonlash_clients',
    employees: 'maisonlash_employees',
    appointments: 'maisonlash_appointments',
    settings: 'maisonlash_settings'
  };

  const DEFAULT_SERVICES = [
    { id: 'svc-1', name: 'Lifting de Pestanas', description: 'Tratamiento que curva y levanta tus pestanas naturales desde la raiz con resultado de 6 a 8 semanas.', price: '$80.000', category: 'pestanas', image: '' },
    { id: 'svc-2', name: 'Extensiones Clasicas', description: 'Aplicacion de una extension por pestana natural para una mirada elegante y natural.', price: '$120.000', category: 'pestanas', image: '' },
    { id: 'svc-3', name: 'Extensiones Volumen', description: 'Tecnica de abanicos para un efecto lleno, definido y comodo.', price: '$160.000', category: 'pestanas', image: '' },
    { id: 'svc-4', name: 'Tinte de Pestanas', description: 'Coloracion profesional que intensifica el tono natural de tus pestanas.', price: '$45.000', category: 'pestanas', image: '' },
    { id: 'svc-5', name: 'Mantenimiento Express', description: 'Relleno y ajuste de extensiones para conservar una mirada cuidada.', price: '$70.000', category: 'pestanas', image: '' },
    { id: 'svc-6', name: 'Diseno de Cejas', description: 'Diseno segun la morfologia del rostro con perfilado y definicion.', price: '$35.000', category: 'cejas', image: '' },
    { id: 'svc-7', name: 'Laminado de Cejas', description: 'Tratamiento de reestructuracion que fija y ordena el vello por varias semanas.', price: '$90.000', category: 'cejas', image: '' },
    { id: 'svc-8', name: 'Henna de Cejas', description: 'Coloracion natural que aporta profundidad y definicion a las cejas.', price: '$55.000', category: 'cejas', image: '' },
    { id: 'svc-9', name: 'Hidratacion de Labios', description: 'Tratamiento nutritivo con exfoliacion y mascarilla hidratante profesional.', price: '$40.000', category: 'labios', image: '' },
    { id: 'svc-10', name: 'Blushed Lips', description: 'Maquillaje semipermanente con acabado natural y color difuminado.', price: '$180.000', category: 'labios', image: '' }
  ];

  const DEFAULT_PRODUCTS = [
    { id: 'prod-1', category: 'cejas', name: 'Shampoo de Cejas', description: 'Limpieza suave para mantener cejas laminadas o pigmentadas en buen estado.', price: '$38.000', image: '' },
    { id: 'prod-2', category: 'pestanas', name: 'Cepillo de Pestanas', description: 'Cepillo de cuidado diario para extensiones y pestanas naturales.', price: '$15.000', image: '' },
    { id: 'prod-3', category: 'labios', name: 'Balsamo Hidratante', description: 'Hidratacion diaria para conservar labios suaves despues de tratamientos.', price: '$28.000', image: '' }
  ];

  const DEFAULT_CLIENTS = [
    { id: 'client-demo', name: 'Cliente', lastName: 'Demo', phone: '3010000000', email: 'cliente@demo.com', password: 'user123', birthday: '1995-01-01' }
  ];

  const DEFAULT_SETTINGS = {
    whatsapp: '',
    instagramEnabled: true,
    instagram: '',
    facebookEnabled: false,
    facebook: '',
    tiktokEnabled: false,
    tiktok: ''
  };

  let state = null;

  /**
   * Carga y normaliza todos los datos persistidos de la aplicacion.
   * @returns {object} Estado completo de Maison Lash.
   */
  function loadState() {
    const services = migrateServices(readStorage(STORAGE_KEYS.services, DEFAULT_SERVICES));
    const products = migrateProducts(readStorage(STORAGE_KEYS.products, DEFAULT_PRODUCTS));
    const clients = migrateClients(readStorage(STORAGE_KEYS.clients, DEFAULT_CLIENTS));
    const employees = migrateEmployees(readStorage(STORAGE_KEYS.employees, getDefaultEmployees(services)), services);
    const appointments = migrateAppointments(readStorage(STORAGE_KEYS.appointments, getDefaultAppointments(services)), services);
    const settings = { ...DEFAULT_SETTINGS, ...readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS) };

    state = { services, products, clients, employees, appointments, settings };
    saveAll();
    return state;
  }

  /**
   * Devuelve el estado actual y lo carga si aun no existe.
   * @returns {object} Estado compartido.
   */
  function getState() {
    return state || loadState();
  }

  /**
   * Lee una llave de localStorage con valor por defecto seguro.
   * @param {string} key Llave de localStorage.
   * @param {unknown} fallbackValue Valor usado si la llave no existe o esta corrupta.
   * @returns {unknown} Valor parseado.
   */
  function readStorage(key, fallbackValue) {
    try {
      const storedValue = localStorage.getItem(key);
      return storedValue ? JSON.parse(storedValue) : cloneData(fallbackValue);
    } catch (error) {
      return cloneData(fallbackValue);
    }
  }

  /**
   * Clona datos simples para evitar mutar las constantes base.
   * @param {unknown} value Valor serializable.
   * @returns {unknown} Copia profunda.
   */
  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** Guarda todo el estado en localStorage. */
  function saveAll() {
    saveServices();
    saveProducts();
    saveClients();
    saveEmployees();
    saveAppointments();
    saveSettings();
  }

  /** Guarda los servicios. */
  function saveServices() {
    localStorage.setItem(STORAGE_KEYS.services, JSON.stringify(getState().services));
  }

  /** Guarda los productos visuales. */
  function saveProducts() {
    localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(getState().products));
  }

  /** Guarda los clientes. */
  function saveClients() {
    localStorage.setItem(STORAGE_KEYS.clients, JSON.stringify(getState().clients));
  }

  /** Guarda los empleados. */
  function saveEmployees() {
    localStorage.setItem(STORAGE_KEYS.employees, JSON.stringify(getState().employees));
  }

  /** Guarda las citas. */
  function saveAppointments() {
    localStorage.setItem(STORAGE_KEYS.appointments, JSON.stringify(getState().appointments));
  }

  /** Guarda la configuracion general. */
  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(getState().settings));
  }

  /**
   * Crea empleados base conectados con todos los servicios.
   * @param {Array<object>} services Servicios disponibles.
   * @returns {Array<object>} Empleados iniciales.
   */
  function getDefaultEmployees(services) {
    return [
      {
        id: 'emp-demo',
        nombre: 'Especialista Demo',
        correo: 'empleado@maisonlash.com',
        celular: '3000000000',
        rol: 'Especialista',
        usuario: 'empleado',
        password: 'empleado123',
        image: '',
        serviceIds: services.map(service => String(service.id)),
        serviceNames: services.map(service => service.name)
      }
    ];
  }

  /**
   * Crea citas base para que los calendarios no inicien vacios.
   * @param {Array<object>} services Servicios disponibles.
   * @returns {Array<object>} Citas iniciales.
   */
  function getDefaultAppointments(services) {
    const firstService = services[0];
    const secondService = services[6] || services[0];
    const today = new Date().toISOString().slice(0, 10);

    return [
      {
        id: createId('apt'),
        clientName: 'Cliente Demo',
        clientEmail: 'cliente@demo.com',
        clientPhone: '3010000000',
        serviceIds: [String(firstService.id), String(secondService.id)],
        serviceNames: [firstService.name, secondService.name],
        categories: [firstService.category, secondService.category],
        employeeId: 'emp-demo',
        date: today,
        time: '10:00',
        status: 'confirmada',
        notes: 'Cita de ejemplo conectada al empleado demo.',
        source: 'jefe',
        createdAt: new Date().toISOString()
      }
    ];
  }

  /**
   * Normaliza servicios antiguos o nuevos.
   * @param {Array<object>} items Servicios sin normalizar.
   * @returns {Array<object>} Servicios normalizados.
   */
  function migrateServices(items) {
    if (!Array.isArray(items) || !items.length) {
      return cloneData(DEFAULT_SERVICES);
    }

    return items.map((service, index) => ({
      id: String(service.id || createId(`svc-${index}`)),
      name: service.name || 'Servicio sin nombre',
      description: service.description || service.desc || '',
      price: service.price || '',
      category: service.category || service.cat || 'pestanas',
      image: service.image || service.img || ''
    }));
  }

  /**
   * Normaliza productos visuales.
   * @param {Array<object>} items Productos sin normalizar.
   * @returns {Array<object>} Productos normalizados.
   */
  function migrateProducts(items) {
    if (!Array.isArray(items) || !items.length) {
      return cloneData(DEFAULT_PRODUCTS);
    }

    return items.map((product, index) => ({
      id: String(product.id || createId(`prod-${index}`)),
      category: product.category || product.cat || 'pestanas',
      name: product.name || 'Producto sin nombre',
      description: product.description || product.desc || '',
      price: product.price || 'Precio por confirmar',
      image: product.image || product.img || ''
    }));
  }

  /**
   * Normaliza clientes registrados.
   * @param {Array<object>} items Clientes sin normalizar.
   * @returns {Array<object>} Clientes normalizados.
   */
  function migrateClients(items) {
    if (!Array.isArray(items) || !items.length) {
      return cloneData(DEFAULT_CLIENTS);
    }

    return items.map((client, index) => ({
      id: String(client.id || createId(`client-${index}`)),
      name: client.name || client.nombre || 'Cliente',
      lastName: client.lastName || client.apellido || '',
      phone: client.phone || client.celular || client.cel || '',
      email: client.email || client.correo || '',
      password: client.password || 'user123',
      birthday: client.birthday || client.cumpleanos || ''
    }));
  }

  /**
   * Normaliza empleados y sincroniza nombres de servicios asignados.
   * @param {Array<object>} items Empleados sin normalizar.
   * @param {Array<object>} services Servicios vigentes.
   * @returns {Array<object>} Empleados normalizados.
   */
  function migrateEmployees(items, services) {
    const sourceItems = Array.isArray(items) && items.length ? items : getDefaultEmployees(services);

    return sourceItems.map((employee, index) => {
      const serviceNames = employee.serviceNames || employee.servicios || [];
      const serviceIds = (employee.serviceIds || getServiceIdsByNames(serviceNames, services)).map(String);

      return {
        id: String(employee.id || createId(`emp-${index}`)),
        nombre: employee.nombre || employee.name || 'Empleado sin nombre',
        correo: employee.correo || employee.email || '',
        celular: employee.celular || employee.cel || employee.phone || '',
        rol: employee.rol || employee.role || 'Especialista',
        usuario: employee.usuario || employee.user || `empleado${index + 1}`,
        password: employee.password || 'empleado123',
        image: employee.image || employee.img || '',
        serviceIds,
        serviceNames: getServiceNamesByIds(serviceIds, services)
      };
    });
  }

  /**
   * Normaliza citas de cualquier version previa.
   * @param {Array<object>} items Citas sin normalizar.
   * @param {Array<object>} services Servicios vigentes.
   * @returns {Array<object>} Citas normalizadas.
   */
  function migrateAppointments(items, services) {
    if (!Array.isArray(items) || !items.length) {
      return getDefaultAppointments(services);
    }

    return items.map((appointment, index) => {
      const serviceIds = (appointment.serviceIds || getServiceIdsByNames(appointment.serviceNames || appointment.servicios || [], services)).map(String);

      return {
        id: String(appointment.id || createId(`apt-${index}`)),
        clientName: appointment.clientName || appointment.nombre || 'Cliente sin nombre',
        clientEmail: appointment.clientEmail || appointment.correo || '',
        clientPhone: appointment.clientPhone || appointment.celular || '',
        serviceIds,
        serviceNames: appointment.serviceNames || appointment.servicios || getServiceNamesByIds(serviceIds, services),
        categories: appointment.categories || getCategoriesByServiceIds(serviceIds, services),
        employeeId: String(appointment.employeeId || ''),
        date: appointment.date || new Date().toISOString().slice(0, 10),
        time: appointment.time || '09:00',
        status: appointment.status || 'pendiente',
        notes: appointment.notes || '',
        source: appointment.source || 'jefe',
        createdAt: appointment.createdAt || new Date().toISOString()
      };
    });
  }

  /**
   * Crea un identificador estable para nuevos registros.
   * @param {string} prefix Prefijo del tipo de entidad.
   * @returns {string} Identificador unico.
   */
  function createId(prefix) {
    const randomPart = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now()}-${randomPart}`;
  }

  /**
   * Busca servicios por ids.
   * @param {Array<string>} serviceIds Identificadores de servicio.
   * @param {Array<object>} services Lista opcional de servicios.
   * @returns {Array<object>} Servicios encontrados.
   */
  function getServicesByIds(serviceIds, services = getState().services) {
    const ids = serviceIds.map(String);
    return services.filter(service => ids.includes(String(service.id)));
  }

  /**
   * Convierte nombres de servicio en ids.
   * @param {Array<string>} serviceNames Nombres conocidos.
   * @param {Array<object>} services Lista opcional de servicios.
   * @returns {Array<string>} Ids encontrados.
   */
  function getServiceIdsByNames(serviceNames, services = getState().services) {
    return serviceNames
      .map(name => services.find(service => service.name === name))
      .filter(Boolean)
      .map(service => String(service.id));
  }

  /**
   * Convierte ids de servicio en nombres.
   * @param {Array<string>} serviceIds Ids de servicio.
   * @param {Array<object>} services Lista opcional de servicios.
   * @returns {Array<string>} Nombres encontrados.
   */
  function getServiceNamesByIds(serviceIds, services = getState().services) {
    return getServicesByIds(serviceIds, services).map(service => service.name);
  }

  /**
   * Obtiene categorias desde ids de servicio.
   * @param {Array<string>} serviceIds Ids de servicio.
   * @param {Array<object>} services Lista opcional de servicios.
   * @returns {Array<string>} Categorias unicas.
   */
  function getCategoriesByServiceIds(serviceIds, services = getState().services) {
    return [...new Set(getServicesByIds(serviceIds, services).map(service => service.category))];
  }

  /**
   * Crea o actualiza un servicio.
   * @param {object} service Servicio de entrada.
   * @returns {object} Servicio guardado.
   */
  function upsertService(service) {
    const currentState = getState();
    const serviceToSave = {
      id: String(service.id || createId('svc')),
      name: service.name.trim(),
      description: service.description.trim(),
      price: service.price.trim(),
      category: service.category,
      image: service.image || ''
    };
    const index = currentState.services.findIndex(item => String(item.id) === String(serviceToSave.id));

    if (index >= 0) {
      currentState.services[index] = serviceToSave;
    } else {
      currentState.services.push(serviceToSave);
    }

    currentState.employees = currentState.employees.map(employee => ({
      ...employee,
      serviceNames: getServiceNamesByIds(employee.serviceIds, currentState.services)
    }));
    currentState.appointments = currentState.appointments.map(appointment => ({
      ...appointment,
      serviceNames: getServiceNamesByIds(appointment.serviceIds, currentState.services),
      categories: getCategoriesByServiceIds(appointment.serviceIds, currentState.services)
    }));
    saveServices();
    saveEmployees();
    saveAppointments();
    return serviceToSave;
  }

  /**
   * Elimina un servicio y limpia sus referencias.
   * @param {string} serviceId Id del servicio.
   */
  function deleteService(serviceId) {
    const currentState = getState();
    currentState.services = currentState.services.filter(service => String(service.id) !== String(serviceId));
    currentState.employees = currentState.employees.map(employee => {
      const serviceIds = employee.serviceIds.filter(id => String(id) !== String(serviceId));
      return { ...employee, serviceIds, serviceNames: getServiceNamesByIds(serviceIds, currentState.services) };
    });
    currentState.appointments = currentState.appointments.map(appointment => {
      const serviceIds = appointment.serviceIds.filter(id => String(id) !== String(serviceId));
      return {
        ...appointment,
        serviceIds,
        serviceNames: getServiceNamesByIds(serviceIds, currentState.services),
        categories: getCategoriesByServiceIds(serviceIds, currentState.services)
      };
    });
    saveAll();
  }

  /**
   * Crea o actualiza un producto visual.
   * @param {object} product Producto de entrada.
   * @returns {object} Producto guardado.
   */
  function upsertProduct(product) {
    const currentState = getState();
    const productToSave = {
      id: String(product.id || createId('prod')),
      category: product.category,
      name: product.name.trim(),
      description: product.description.trim(),
      price: product.price.trim(),
      image: product.image || ''
    };
    const index = currentState.products.findIndex(item => String(item.id) === String(productToSave.id));

    if (index >= 0) {
      currentState.products[index] = productToSave;
    } else {
      currentState.products.push(productToSave);
    }

    saveProducts();
    return productToSave;
  }

  /**
   * Elimina un producto visual.
   * @param {string} productId Id del producto.
   */
  function deleteProduct(productId) {
    const currentState = getState();
    currentState.products = currentState.products.filter(product => String(product.id) !== String(productId));
    saveProducts();
  }

  /**
   * Crea o actualiza un cliente.
   * @param {object} client Cliente de entrada.
   * @returns {object} Cliente guardado.
   */
  function upsertClient(client) {
    const currentState = getState();
    const clientToSave = {
      id: String(client.id || createId('client')),
      name: client.name.trim(),
      lastName: client.lastName.trim(),
      phone: client.phone.trim(),
      email: client.email.trim().toLowerCase(),
      password: client.password,
      birthday: client.birthday || ''
    };
    const index = currentState.clients.findIndex(item => String(item.id) === String(clientToSave.id));

    if (index >= 0) {
      currentState.clients[index] = clientToSave;
    } else {
      currentState.clients.push(clientToSave);
    }

    saveClients();
    return clientToSave;
  }

  /**
   * Crea o actualiza un empleado.
   * @param {object} employee Empleado de entrada.
   * @returns {object} Empleado guardado.
   */
  function upsertEmployee(employee) {
    const currentState = getState();
    const serviceIds = (employee.serviceIds || []).map(String);
    const employeeToSave = {
      id: String(employee.id || createId('emp')),
      nombre: employee.nombre.trim(),
      correo: employee.correo.trim().toLowerCase(),
      celular: employee.celular.trim(),
      rol: employee.rol.trim(),
      usuario: employee.usuario.trim(),
      password: employee.password,
      image: employee.image || '',
      serviceIds,
      serviceNames: getServiceNamesByIds(serviceIds, currentState.services)
    };
    const index = currentState.employees.findIndex(item => String(item.id) === String(employeeToSave.id));

    if (index >= 0) {
      currentState.employees[index] = employeeToSave;
    } else {
      currentState.employees.push(employeeToSave);
    }

    saveEmployees();
    return employeeToSave;
  }

  /**
   * Elimina un empleado y desasigna sus citas futuras.
   * @param {string} employeeId Id del empleado.
   */
  function deleteEmployee(employeeId) {
    const currentState = getState();
    currentState.employees = currentState.employees.filter(employee => String(employee.id) !== String(employeeId));
    currentState.appointments = currentState.appointments.map(appointment => (
      String(appointment.employeeId) === String(employeeId) ? { ...appointment, employeeId: '' } : appointment
    ));
    saveEmployees();
    saveAppointments();
  }

  /**
   * Crea o actualiza una cita.
   * @param {object} appointment Cita de entrada.
   * @returns {object} Cita guardada.
   */
  function upsertAppointment(appointment) {
    const currentState = getState();
    const serviceIds = (appointment.serviceIds || []).map(String);
    const appointmentToSave = {
      id: String(appointment.id || createId('apt')),
      clientName: appointment.clientName.trim(),
      clientEmail: appointment.clientEmail.trim().toLowerCase(),
      clientPhone: appointment.clientPhone.trim(),
      serviceIds,
      serviceNames: getServiceNamesByIds(serviceIds, currentState.services),
      categories: getCategoriesByServiceIds(serviceIds, currentState.services),
      employeeId: String(appointment.employeeId || ''),
      date: appointment.date,
      time: appointment.time,
      status: appointment.status || 'pendiente',
      notes: appointment.notes || '',
      source: appointment.source || 'jefe',
      createdAt: appointment.createdAt || new Date().toISOString()
    };
    const index = currentState.appointments.findIndex(item => String(item.id) === String(appointmentToSave.id));

    if (index >= 0) {
      currentState.appointments[index] = appointmentToSave;
    } else {
      currentState.appointments.push(appointmentToSave);
    }

    saveAppointments();
    return appointmentToSave;
  }

  /**
   * Elimina una cita.
   * @param {string} appointmentId Id de la cita.
   */
  function deleteAppointment(appointmentId) {
    const currentState = getState();
    currentState.appointments = currentState.appointments.filter(appointment => String(appointment.id) !== String(appointmentId));
    saveAppointments();
  }

  /**
   * Indica si un especialista ya tiene una cita en un horario.
   * @param {string} employeeId Id del especialista.
   * @param {string} date Fecha ISO.
   * @param {string} time Hora HH:mm.
   * @param {string} [ignoredAppointmentId] Cita que se omite al editar.
   * @returns {boolean} Verdadero si el cupo esta ocupado.
   */
  function isSlotTaken(employeeId, date, time, ignoredAppointmentId) {
    return getState().appointments.some(appointment => (
      String(appointment.employeeId) === String(employeeId)
      && appointment.date === date
      && appointment.time === time
      && appointment.status !== 'cancelada'
      && String(appointment.id) !== String(ignoredAppointmentId || '')
    ));
  }

  /**
   * Obtiene un empleado por id.
   * @param {string} employeeId Id del empleado.
   * @returns {object|null} Empleado encontrado.
   */
  function getEmployeeById(employeeId) {
    return getState().employees.find(employee => String(employee.id) === String(employeeId)) || null;
  }

  /**
   * Obtiene un cliente por id.
   * @param {string} clientId Id del cliente.
   * @returns {object|null} Cliente encontrado.
   */
  function getClientById(clientId) {
    return getState().clients.find(client => String(client.id) === String(clientId)) || null;
  }

  /**
   * Retorna los proximos dias disponibles para agenda.
   * @param {number} count Cantidad de dias.
   * @returns {Array<string>} Fechas ISO.
   */
  function getNextDays(count) {
    return Array.from({ length: count }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() + index);
      return date.toISOString().slice(0, 10);
    });
  }

  /**
   * Retorna horarios estandar de agenda.
   * @returns {Array<string>} Horarios HH:mm.
   */
  function getTimeSlots() {
    return ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];
  }

  window.MaisonStore = {
    STORAGE_KEYS,
    DEFAULT_SERVICES,
    DEFAULT_PRODUCTS,
    DEFAULT_CLIENTS,
    DEFAULT_SETTINGS,
    loadState,
    getState,
    saveAll,
    saveServices,
    saveProducts,
    saveClients,
    saveEmployees,
    saveAppointments,
    saveSettings,
    createId,
    getServicesByIds,
    getServiceIdsByNames,
    getServiceNamesByIds,
    getCategoriesByServiceIds,
    getEmployeeById,
    getClientById,
    getNextDays,
    getTimeSlots,
    isSlotTaken,
    upsertService,
    deleteService,
    upsertProduct,
    deleteProduct,
    upsertClient,
    upsertEmployee,
    deleteEmployee,
    upsertAppointment,
    deleteAppointment
  };
})();
