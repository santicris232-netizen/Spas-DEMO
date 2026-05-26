/*
  Maison Lash - controlador del jefe.
  Administra servicios, productos, empleados, citas, configuracion y exportaciones.
*/
(function () {
  'use strict';

  let state = null;
  const imageDrafts = {
    service: '',
    product: '',
    employee: ''
  };

  document.addEventListener('DOMContentLoaded', initBossPage);

  /** Inicializa el panel del jefe. */
  function initBossPage() {
    state = window.MaisonStore.loadState();
    const session = window.MaisonAuth.requireRole(['boss'], '../../');

    if (!session) {
      return;
    }

    document.getElementById('logout-button').addEventListener('click', () => window.MaisonAuth.logout('../../'));
    bindNavigation();
    bindForms();
    bindImageInputs();
    renderAll();
  }

  /** Configura navegacion por secciones moviles. */
  function bindNavigation() {
    document.querySelectorAll('[data-view]').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-view]').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        button.classList.add('active');
        document.getElementById(button.dataset.view).classList.add('active');
      });
    });
  }

  /** Configura formularios principales. */
  function bindForms() {
    document.getElementById('service-form').addEventListener('submit', saveService);
    document.getElementById('product-form').addEventListener('submit', saveProduct);
    document.getElementById('employee-form').addEventListener('submit', saveEmployee);
    document.getElementById('appointment-form').addEventListener('submit', saveAppointment);
    document.getElementById('settings-form').addEventListener('submit', saveSettings);
    document.getElementById('clear-service-form').addEventListener('click', clearServiceForm);
    document.getElementById('clear-product-form').addEventListener('click', clearProductForm);
    document.getElementById('clear-employee-form').addEventListener('click', clearEmployeeForm);
    document.getElementById('clear-appointment-form').addEventListener('click', clearAppointmentForm);
    document.getElementById('appointment-services').addEventListener('change', () => updateAppointmentEmployeeOptions());
    document.getElementById('export-clients').addEventListener('click', exportClients);
    document.getElementById('export-attended').addEventListener('click', exportAttended);

    document.getElementById('services-list').addEventListener('click', handleServicesList);
    document.getElementById('products-list').addEventListener('click', handleProductsList);
    document.getElementById('employees-list').addEventListener('click', handleEmployeesList);
    document.getElementById('appointments-list').addEventListener('click', handleAppointmentsList);
  }

  /** Configura carga de imagenes por entidad. */
  function bindImageInputs() {
    bindImageInput('service-image', 'service-preview', 'service');
    bindImageInput('product-image', 'product-preview', 'product');
    bindImageInput('employee-image', 'employee-preview', 'employee');
  }

  /**
   * Conecta un input file con su vista previa.
   * @param {string} inputId Id del input file.
   * @param {string} previewId Id de la imagen preview.
   * @param {string} draftKey Llave del borrador.
   */
  function bindImageInput(inputId, previewId, draftKey) {
    document.getElementById(inputId).addEventListener('change', async event => {
      try {
        imageDrafts[draftKey] = await window.MaisonUi.readImageInput(event.target);
        setPreview(previewId, imageDrafts[draftKey]);
      } catch (error) {
        event.target.value = '';
        imageDrafts[draftKey] = '';
        setPreview(previewId, '');
        window.MaisonUi.showToast(error.message);
      }
    });
  }

  /** Renderiza todo lo que depende del estado. */
  function renderAll() {
    renderServiceOptions();
    renderServices();
    renderProducts();
    renderEmployees();
    renderAppointments();
    fillSettingsForm();
  }

  /** Renderiza opciones de servicios reutilizadas por formularios. */
  function renderServiceOptions() {
    const options = state.services.map(service => (
      `<option value="${window.MaisonUi.escapeAttr(service.id)}">${window.MaisonUi.escapeHTML(service.name)}</option>`
    )).join('');
    document.getElementById('employee-services').innerHTML = options;
    document.getElementById('appointment-services').innerHTML = options;
    updateAppointmentEmployeeOptions();
  }

  /** Renderiza lista de servicios del jefe. */
  function renderServices() {
    const container = document.getElementById('services-list');

    if (!state.services.length) {
      container.innerHTML = '<div class="empty-state">No hay servicios registrados.</div>';
      return;
    }

    container.innerHTML = state.services.map(service => `
      <article class="card management-card">
        ${window.MaisonUi.visualImage(service.image, service.name)}
        <div class="card-body">
          <div class="management-top">
            <div>
              <h3 class="management-title">${window.MaisonUi.escapeHTML(service.name)}</h3>
              <p class="management-subtitle">${window.MaisonUi.categoryLabel(service.category)}</p>
            </div>
            <strong class="management-price">${window.MaisonUi.escapeHTML(service.price)}</strong>
          </div>
          <p class="card-text">${window.MaisonUi.escapeHTML(service.description)}</p>
          <div class="management-actions">
            <button class="secondary-button" type="button" data-service-edit="${window.MaisonUi.escapeAttr(service.id)}">Editar</button>
            <button class="danger-button" type="button" data-service-delete="${window.MaisonUi.escapeAttr(service.id)}">Borrar</button>
          </div>
        </div>
      </article>
    `).join('');
  }

  /** Renderiza lista de productos visuales. */
  function renderProducts() {
    const container = document.getElementById('products-list');

    if (!state.products.length) {
      container.innerHTML = '<div class="empty-state">No hay productos registrados.</div>';
      return;
    }

    container.innerHTML = state.products.map(product => `
      <article class="card management-card">
        ${window.MaisonUi.visualImage(product.image, product.name)}
        <div class="card-body">
          <div class="management-top">
            <div>
              <h3 class="management-title">${window.MaisonUi.escapeHTML(product.name)}</h3>
              <p class="management-subtitle">${window.MaisonUi.categoryLabel(product.category)}</p>
            </div>
            <strong class="management-price">${window.MaisonUi.escapeHTML(product.price)}</strong>
          </div>
          <p class="card-text">${window.MaisonUi.escapeHTML(product.description)}</p>
          <div class="management-actions">
            <button class="secondary-button" type="button" data-product-edit="${window.MaisonUi.escapeAttr(product.id)}">Editar</button>
            <button class="danger-button" type="button" data-product-delete="${window.MaisonUi.escapeAttr(product.id)}">Borrar</button>
          </div>
        </div>
      </article>
    `).join('');
  }

  /** Renderiza lista de empleados. */
  function renderEmployees() {
    const container = document.getElementById('employees-list');

    if (!state.employees.length) {
      container.innerHTML = '<div class="empty-state">No hay empleados registrados.</div>';
      return;
    }

    container.innerHTML = state.employees.map(employee => `
      <article class="card management-card">
        ${window.MaisonUi.visualImage(employee.image, employee.nombre)}
        <div class="card-body">
          <div class="management-top">
            <div>
              <h3 class="management-title">${window.MaisonUi.escapeHTML(employee.nombre)}</h3>
              <p class="management-subtitle">${window.MaisonUi.escapeHTML(employee.rol)}</p>
            </div>
            <span class="status-pill">${window.MaisonUi.escapeHTML(employee.usuario)}</span>
          </div>
          <p class="card-text">${window.MaisonUi.escapeHTML(employee.serviceNames.join(', ') || 'Sin servicios asignados')}</p>
          <div class="card-meta">
            <span class="meta-chip">${window.MaisonUi.escapeHTML(employee.correo)}</span>
            <span class="meta-chip">${window.MaisonUi.escapeHTML(employee.celular)}</span>
          </div>
          <div class="management-actions">
            <button class="secondary-button" type="button" data-employee-edit="${window.MaisonUi.escapeAttr(employee.id)}">Editar</button>
            <button class="danger-button" type="button" data-employee-delete="${window.MaisonUi.escapeAttr(employee.id)}">Borrar</button>
          </div>
        </div>
      </article>
    `).join('');
  }

  /** Renderiza la agenda global. */
  function renderAppointments() {
    const container = document.getElementById('appointments-list');
    const appointments = [...state.appointments].sort((first, second) => `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`));

    if (!appointments.length) {
      container.innerHTML = '<div class="empty-state">No hay citas registradas.</div>';
      return;
    }

    container.innerHTML = appointments.map(appointment => {
      const employee = window.MaisonStore.getEmployeeById(appointment.employeeId);
      const statusClass = `status-${appointment.status}`;

      return `
        <article class="card management-card ${window.MaisonUi.appointmentClass(appointment.categories)}">
          <div class="management-top">
            <div>
              <h3 class="management-title">${window.MaisonUi.escapeHTML(appointment.clientName)}</h3>
              <p class="management-subtitle">${window.MaisonUi.formatDate(appointment.date)} ${window.MaisonUi.escapeHTML(appointment.time)}</p>
            </div>
            <span class="status-pill ${statusClass}">${window.MaisonUi.escapeHTML(appointment.status)}</span>
          </div>
          <p class="card-text">${window.MaisonUi.escapeHTML(appointment.serviceNames.join(', '))}</p>
          <div class="card-meta">
            <span class="meta-chip">${window.MaisonUi.escapeHTML(employee ? employee.nombre : 'Sin especialista')}</span>
            <span class="meta-chip">${window.MaisonUi.escapeHTML(appointment.clientPhone || 'Sin celular')}</span>
          </div>
          <div class="appointment-actions">
            <button class="secondary-button" type="button" data-appointment-edit="${window.MaisonUi.escapeAttr(appointment.id)}">Editar</button>
            <button class="secondary-button" type="button" data-appointment-confirm="${window.MaisonUi.escapeAttr(appointment.id)}">Confirmar</button>
            <button class="danger-button" type="button" data-appointment-cancel="${window.MaisonUi.escapeAttr(appointment.id)}">Cancelar</button>
            <button class="danger-button" type="button" data-appointment-delete="${window.MaisonUi.escapeAttr(appointment.id)}">Borrar</button>
          </div>
        </article>
      `;
    }).join('');
  }

  /** Guarda un servicio desde el formulario. */
  function saveService(event) {
    event.preventDefault();
    const serviceId = document.getElementById('service-id').value;
    const existing = state.services.find(service => String(service.id) === String(serviceId));

    window.MaisonStore.upsertService({
      id: serviceId,
      category: document.getElementById('service-category').value,
      name: document.getElementById('service-name').value,
      description: document.getElementById('service-description').value,
      price: document.getElementById('service-price').value,
      image: imageDrafts.service || existing?.image || ''
    });

    state = window.MaisonStore.getState();
    clearServiceForm();
    renderAll();
    window.MaisonUi.showToast('Servicio guardado.');
  }

  /** Guarda un producto visual desde el formulario. */
  function saveProduct(event) {
    event.preventDefault();
    const productId = document.getElementById('product-id').value;
    const existing = state.products.find(product => String(product.id) === String(productId));

    window.MaisonStore.upsertProduct({
      id: productId,
      category: document.getElementById('product-category').value,
      name: document.getElementById('product-name').value,
      description: document.getElementById('product-description').value,
      price: document.getElementById('product-price').value,
      image: imageDrafts.product || existing?.image || ''
    });

    state = window.MaisonStore.getState();
    clearProductForm();
    renderAll();
    window.MaisonUi.showToast('Producto guardado.');
  }

  /** Guarda un empleado desde el formulario. */
  function saveEmployee(event) {
    event.preventDefault();
    const employeeId = document.getElementById('employee-id').value;
    const existing = state.employees.find(employee => String(employee.id) === String(employeeId));
    const serviceIds = getSelectedValues('employee-services');

    if (!serviceIds.length) {
      window.MaisonUi.showToast('Selecciona al menos un servicio.');
      return;
    }

    window.MaisonStore.upsertEmployee({
      id: employeeId,
      nombre: document.getElementById('employee-name').value,
      correo: document.getElementById('employee-email').value,
      celular: document.getElementById('employee-phone').value,
      rol: document.getElementById('employee-role').value,
      usuario: document.getElementById('employee-user').value,
      password: document.getElementById('employee-password').value,
      serviceIds,
      image: imageDrafts.employee || existing?.image || ''
    });

    state = window.MaisonStore.getState();
    clearEmployeeForm();
    renderAll();
    window.MaisonUi.showToast('Empleado guardado.');
  }

  /** Guarda una cita desde el calendario del jefe. */
  function saveAppointment(event) {
    event.preventDefault();
    const appointmentId = document.getElementById('appointment-id').value;
    const employeeId = document.getElementById('appointment-employee').value;
    const date = document.getElementById('appointment-date').value;
    const time = document.getElementById('appointment-time').value;
    const serviceIds = getSelectedValues('appointment-services');

    if (!serviceIds.length) {
      window.MaisonUi.showToast('Selecciona al menos un servicio.');
      return;
    }

    if (window.MaisonStore.isSlotTaken(employeeId, date, time, appointmentId)) {
      window.MaisonUi.showToast('Ese especialista ya tiene una cita en ese horario.');
      return;
    }

    window.MaisonStore.upsertAppointment({
      id: appointmentId,
      clientName: document.getElementById('appointment-client-name').value,
      clientEmail: document.getElementById('appointment-client-email').value,
      clientPhone: document.getElementById('appointment-client-phone').value,
      serviceIds,
      employeeId,
      date,
      time,
      status: document.getElementById('appointment-status').value,
      notes: document.getElementById('appointment-notes').value,
      source: 'jefe'
    });

    state = window.MaisonStore.getState();
    clearAppointmentForm();
    renderAppointments();
    window.MaisonUi.showToast('Cita guardada.');
  }

  /** Guarda configuracion social y WhatsApp. */
  function saveSettings(event) {
    event.preventDefault();
    state.settings.whatsapp = document.getElementById('setting-whatsapp').value.trim();
    state.settings.instagramEnabled = document.getElementById('setting-instagram-enabled').checked;
    state.settings.instagram = document.getElementById('setting-instagram').value.trim();
    state.settings.facebookEnabled = document.getElementById('setting-facebook-enabled').checked;
    state.settings.facebook = document.getElementById('setting-facebook').value.trim();
    state.settings.tiktokEnabled = document.getElementById('setting-tiktok-enabled').checked;
    state.settings.tiktok = document.getElementById('setting-tiktok').value.trim();
    window.MaisonStore.saveSettings();
    window.MaisonUi.showToast('Configuracion guardada.');
  }

  /** Llena el formulario de configuracion. */
  function fillSettingsForm() {
    document.getElementById('setting-whatsapp').value = state.settings.whatsapp || '';
    document.getElementById('setting-instagram-enabled').checked = Boolean(state.settings.instagramEnabled);
    document.getElementById('setting-instagram').value = state.settings.instagram || '';
    document.getElementById('setting-facebook-enabled').checked = Boolean(state.settings.facebookEnabled);
    document.getElementById('setting-facebook').value = state.settings.facebook || '';
    document.getElementById('setting-tiktok-enabled').checked = Boolean(state.settings.tiktokEnabled);
    document.getElementById('setting-tiktok').value = state.settings.tiktok || '';
  }

  /** Actualiza especialistas posibles para una cita segun servicios elegidos. */
  function updateAppointmentEmployeeOptions(selectedEmployeeId = '') {
    const serviceIds = getSelectedValues('appointment-services');
    const employees = serviceIds.length
      ? state.employees.filter(employee => employee.serviceIds.some(serviceId => serviceIds.includes(String(serviceId))))
      : state.employees;
    const optionsSource = employees.length ? employees : state.employees;
    const select = document.getElementById('appointment-employee');

    select.innerHTML = optionsSource.map(employee => (
      `<option value="${window.MaisonUi.escapeAttr(employee.id)}">${window.MaisonUi.escapeHTML(employee.nombre)}</option>`
    )).join('');

    if (selectedEmployeeId) {
      select.value = selectedEmployeeId;
    }
  }

  /** Maneja acciones de la lista de servicios. */
  function handleServicesList(event) {
    const editButton = event.target.closest('[data-service-edit]');
    const deleteButton = event.target.closest('[data-service-delete]');

    if (editButton) {
      editService(editButton.dataset.serviceEdit);
    }

    if (deleteButton && confirm('Borrar este servicio?')) {
      window.MaisonStore.deleteService(deleteButton.dataset.serviceDelete);
      state = window.MaisonStore.getState();
      renderAll();
      window.MaisonUi.showToast('Servicio borrado.');
    }
  }

  /** Maneja acciones de la lista de productos. */
  function handleProductsList(event) {
    const editButton = event.target.closest('[data-product-edit]');
    const deleteButton = event.target.closest('[data-product-delete]');

    if (editButton) {
      editProduct(editButton.dataset.productEdit);
    }

    if (deleteButton && confirm('Borrar este producto?')) {
      window.MaisonStore.deleteProduct(deleteButton.dataset.productDelete);
      state = window.MaisonStore.getState();
      renderProducts();
      window.MaisonUi.showToast('Producto borrado.');
    }
  }

  /** Maneja acciones de la lista de empleados. */
  function handleEmployeesList(event) {
    const editButton = event.target.closest('[data-employee-edit]');
    const deleteButton = event.target.closest('[data-employee-delete]');

    if (editButton) {
      editEmployee(editButton.dataset.employeeEdit);
    }

    if (deleteButton && confirm('Borrar este empleado?')) {
      window.MaisonStore.deleteEmployee(deleteButton.dataset.employeeDelete);
      state = window.MaisonStore.getState();
      renderAll();
      window.MaisonUi.showToast('Empleado borrado.');
    }
  }

  /** Maneja acciones de la lista de citas. */
  function handleAppointmentsList(event) {
    const editButton = event.target.closest('[data-appointment-edit]');
    const confirmButton = event.target.closest('[data-appointment-confirm]');
    const cancelButton = event.target.closest('[data-appointment-cancel]');
    const deleteButton = event.target.closest('[data-appointment-delete]');

    if (editButton) {
      editAppointment(editButton.dataset.appointmentEdit);
    }

    if (confirmButton) {
      setAppointmentStatus(confirmButton.dataset.appointmentConfirm, 'confirmada');
    }

    if (cancelButton) {
      setAppointmentStatus(cancelButton.dataset.appointmentCancel, 'cancelada');
    }

    if (deleteButton && confirm('Borrar esta cita?')) {
      window.MaisonStore.deleteAppointment(deleteButton.dataset.appointmentDelete);
      state = window.MaisonStore.getState();
      renderAppointments();
      window.MaisonUi.showToast('Cita borrada.');
    }
  }

  /** Carga un servicio en el formulario. */
  function editService(serviceId) {
    const service = state.services.find(item => String(item.id) === String(serviceId));

    if (!service) {
      return;
    }

    document.getElementById('service-form-title').textContent = 'Editar servicio';
    document.getElementById('service-id').value = service.id;
    document.getElementById('service-category').value = service.category;
    document.getElementById('service-name').value = service.name;
    document.getElementById('service-description').value = service.description;
    document.getElementById('service-price').value = service.price;
    imageDrafts.service = service.image || '';
    setPreview('service-preview', imageDrafts.service);
    document.getElementById('service-form').scrollIntoView({ behavior: 'smooth' });
  }

  /** Carga un producto en el formulario. */
  function editProduct(productId) {
    const product = state.products.find(item => String(item.id) === String(productId));

    if (!product) {
      return;
    }

    document.getElementById('product-form-title').textContent = 'Editar producto';
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-category').value = product.category;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-description').value = product.description;
    document.getElementById('product-price').value = product.price;
    imageDrafts.product = product.image || '';
    setPreview('product-preview', imageDrafts.product);
    document.getElementById('product-form').scrollIntoView({ behavior: 'smooth' });
  }

  /** Carga un empleado en el formulario. */
  function editEmployee(employeeId) {
    const employee = state.employees.find(item => String(item.id) === String(employeeId));

    if (!employee) {
      return;
    }

    document.getElementById('employee-form-title').textContent = 'Editar empleado';
    document.getElementById('employee-id').value = employee.id;
    document.getElementById('employee-name').value = employee.nombre;
    document.getElementById('employee-email').value = employee.correo;
    document.getElementById('employee-phone').value = employee.celular;
    document.getElementById('employee-role').value = employee.rol;
    document.getElementById('employee-user').value = employee.usuario;
    document.getElementById('employee-password').value = employee.password;
    setSelectedValues('employee-services', employee.serviceIds);
    imageDrafts.employee = employee.image || '';
    setPreview('employee-preview', imageDrafts.employee);
    document.getElementById('employee-form').scrollIntoView({ behavior: 'smooth' });
  }

  /** Carga una cita en el formulario. */
  function editAppointment(appointmentId) {
    const appointment = state.appointments.find(item => String(item.id) === String(appointmentId));

    if (!appointment) {
      return;
    }

    document.getElementById('appointment-form-title').textContent = 'Editar cita';
    document.getElementById('appointment-id').value = appointment.id;
    document.getElementById('appointment-client-name').value = appointment.clientName;
    document.getElementById('appointment-client-email').value = appointment.clientEmail;
    document.getElementById('appointment-client-phone').value = appointment.clientPhone;
    setSelectedValues('appointment-services', appointment.serviceIds);
    updateAppointmentEmployeeOptions(appointment.employeeId);
    document.getElementById('appointment-date').value = appointment.date;
    document.getElementById('appointment-time').value = appointment.time;
    document.getElementById('appointment-status').value = appointment.status;
    document.getElementById('appointment-notes').value = appointment.notes;
    document.getElementById('appointment-form').scrollIntoView({ behavior: 'smooth' });
  }

  /**
   * Cambia el estado de una cita.
   * @param {string} appointmentId Id de la cita.
   * @param {string} status Nuevo estado.
   */
  function setAppointmentStatus(appointmentId, status) {
    const appointment = state.appointments.find(item => String(item.id) === String(appointmentId));

    if (!appointment) {
      return;
    }

    window.MaisonStore.upsertAppointment({ ...appointment, status });
    state = window.MaisonStore.getState();
    renderAppointments();
    window.MaisonUi.showToast('Estado actualizado.');
  }

  /** Limpia formulario de servicios. */
  function clearServiceForm() {
    document.getElementById('service-form').reset();
    document.getElementById('service-id').value = '';
    document.getElementById('service-form-title').textContent = 'Nuevo servicio';
    document.getElementById('service-image').value = '';
    imageDrafts.service = '';
    setPreview('service-preview', '');
  }

  /** Limpia formulario de productos. */
  function clearProductForm() {
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('product-form-title').textContent = 'Nuevo producto';
    document.getElementById('product-image').value = '';
    imageDrafts.product = '';
    setPreview('product-preview', '');
  }

  /** Limpia formulario de empleados. */
  function clearEmployeeForm() {
    document.getElementById('employee-form').reset();
    document.getElementById('employee-id').value = '';
    document.getElementById('employee-form-title').textContent = 'Nuevo empleado';
    document.getElementById('employee-image').value = '';
    imageDrafts.employee = '';
    setPreview('employee-preview', '');
  }

  /** Limpia formulario de citas. */
  function clearAppointmentForm() {
    document.getElementById('appointment-form').reset();
    document.getElementById('appointment-id').value = '';
    document.getElementById('appointment-form-title').textContent = 'Nueva cita';
    updateAppointmentEmployeeOptions();
  }

  /**
   * Muestra u oculta una vista previa de imagen.
   * @param {string} previewId Id de la imagen preview.
   * @param {string} image Imagen base64.
   */
  function setPreview(previewId, image) {
    const preview = document.getElementById(previewId);

    if (!image) {
      preview.classList.add('hidden');
      preview.removeAttribute('src');
      return;
    }

    preview.src = image;
    preview.classList.remove('hidden');
  }

  /**
   * Obtiene valores seleccionados de un select multiple.
   * @param {string} selectId Id del select.
   * @returns {Array<string>} Valores seleccionados.
   */
  function getSelectedValues(selectId) {
    return Array.from(document.getElementById(selectId).selectedOptions).map(option => String(option.value));
  }

  /**
   * Define valores seleccionados en un select multiple.
   * @param {string} selectId Id del select.
   * @param {Array<string>} values Valores a seleccionar.
   */
  function setSelectedValues(selectId, values) {
    const normalizedValues = values.map(String);
    Array.from(document.getElementById(selectId).options).forEach(option => {
      option.selected = normalizedValues.includes(String(option.value));
    });
  }

  /** Exporta clientes registrados a CSV. */
  function exportClients() {
    const rows = [
      ['Nombre', 'Apellido', 'Correo', 'Celular', 'Cumpleanos'],
      ...state.clients.map(client => [client.name, client.lastName, client.email, client.phone, client.birthday])
    ];
    window.MaisonUi.downloadCsv('maison-lash-clientes.csv', rows);
  }

  /** Exporta citas completadas a CSV. */
  function exportAttended() {
    const rows = [
      ['Cliente', 'Correo', 'Celular', 'Servicios', 'Especialista', 'Fecha', 'Hora'],
      ...state.appointments
        .filter(appointment => appointment.status === 'completada')
        .map(appointment => {
          const employee = window.MaisonStore.getEmployeeById(appointment.employeeId);
          return [
            appointment.clientName,
            appointment.clientEmail,
            appointment.clientPhone,
            appointment.serviceNames.join(' / '),
            employee ? employee.nombre : '',
            appointment.date,
            appointment.time
          ];
        })
    ];
    window.MaisonUi.downloadCsv('maison-lash-atendidos.csv', rows);
  }
})();
