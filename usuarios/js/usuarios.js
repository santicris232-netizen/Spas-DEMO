/*
  Maison Lash - controlador del usuario final.
  Renderiza citas, catalogo, servicios y flujo de asignacion conectado con empleados.
*/
(function () {
  'use strict';

  let session = null;
  let state = null;
  let currentClient = null;
  let selectedSlot = null;

  document.addEventListener('DOMContentLoaded', initUserPage);

  /** Inicializa la pantalla del cliente. */
  function initUserPage() {
    state = window.MaisonStore.loadState();
    session = window.MaisonAuth.requireRole(['user'], '../../');

    if (!session) {
      return;
    }

    currentClient = getCurrentClient();
    bindNavigation();
    bindBookingSheet();
    document.getElementById('logout-button').addEventListener('click', () => window.MaisonAuth.logout('../../'));
    renderAll();
  }

  /** Renderiza toda la informacion visible del cliente. */
  function renderAll() {
    document.getElementById('client-name-pill').textContent = currentClient.name || 'Cliente';
    document.getElementById('welcome-title').textContent = `Hola, ${currentClient.name || 'Cliente'}`;
    renderAppointments();
    renderProducts();
    renderServices('services-list');
    renderServices('brows-list', 'cejas');
    renderServices('lips-list', 'labios');
    renderServices('lashes-list', 'pestanas');
  }

  /** Activa navegacion por secciones. */
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

  /** Configura eventos de la hoja de agendamiento. */
  function bindBookingSheet() {
    document.getElementById('close-booking').addEventListener('click', closeBookingSheet);
    document.getElementById('booking-employee').addEventListener('change', () => {
      selectedSlot = null;
      renderAvailability();
    });
    document.getElementById('booking-form').addEventListener('submit', saveBooking);
    document.getElementById('booking-availability').addEventListener('click', event => {
      const slotButton = event.target.closest('[data-date][data-time]');

      if (!slotButton || slotButton.disabled) {
        return;
      }

      selectedSlot = { date: slotButton.dataset.date, time: slotButton.dataset.time };
      document.getElementById('booking-date').value = selectedSlot.date;
      document.getElementById('booking-time').value = selectedSlot.time;
      renderAvailability();
    });
  }

  /**
   * Obtiene el cliente conectado a la sesion.
   * @returns {object} Cliente actual.
   */
  function getCurrentClient() {
    const client = window.MaisonStore.getClientById(session.clientId);

    if (client) {
      return client;
    }

    return state.clients.find(item => item.email === session.username) || state.clients[0];
  }

  /** Renderiza banners de citas del cliente. */
  function renderAppointments() {
    const container = document.getElementById('appointments-list');
    const clientAppointments = state.appointments
      .filter(appointment => appointment.clientEmail === currentClient.email || appointment.clientPhone === currentClient.phone)
      .sort((first, second) => `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`));

    if (!clientAppointments.length) {
      container.innerHTML = '<div class="empty-state">Aun no tienes citas asignadas.</div>';
      return;
    }

    container.innerHTML = clientAppointments.map(appointment => {
      const employee = window.MaisonStore.getEmployeeById(appointment.employeeId);
      const days = window.MaisonUi.daysUntil(appointment.date);
      const countdown = days < 0 ? 'Vencida' : `${days}`;
      const countdownLabel = days === 1 ? 'dia' : 'dias';
      const statusClass = `status-${appointment.status}`;

      return `
        <article class="card user-appointment-card ${window.MaisonUi.appointmentClass(appointment.categories)}">
          <div class="user-appointment-top">
            <div>
              <h3 class="user-appointment-title">${window.MaisonUi.escapeHTML(appointment.clientName)}</h3>
              <p class="card-text">${window.MaisonUi.escapeHTML(appointment.serviceNames.join(', '))}</p>
            </div>
            <div class="countdown-box">
              <span class="countdown-number">${window.MaisonUi.escapeHTML(countdown)}</span>
              <span class="countdown-label">${window.MaisonUi.escapeHTML(countdownLabel)}</span>
            </div>
          </div>
          <div class="card-meta">
            <span class="meta-chip">${window.MaisonUi.formatDate(appointment.date)} ${window.MaisonUi.escapeHTML(appointment.time)}</span>
            <span class="meta-chip">${window.MaisonUi.escapeHTML(employee ? employee.nombre : 'Sin especialista')}</span>
            <span class="status-pill ${statusClass}">${window.MaisonUi.escapeHTML(appointment.status)}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  /** Renderiza productos informativos. */
  function renderProducts() {
    const container = document.getElementById('products-list');

    if (!state.products.length) {
      container.innerHTML = '<div class="empty-state">No hay productos publicados.</div>';
      return;
    }

    container.innerHTML = state.products.map(product => `
      <article class="card">
        ${window.MaisonUi.visualImage(product.image, product.name)}
        <div class="card-body">
          <div class="card-meta"><span class="meta-chip">${window.MaisonUi.categoryLabel(product.category)}</span></div>
          <h3 class="card-title">${window.MaisonUi.escapeHTML(product.name)}</h3>
          <p class="card-text">${window.MaisonUi.escapeHTML(product.description)}</p>
          <p class="product-price">${window.MaisonUi.escapeHTML(product.price)}</p>
        </div>
      </article>
    `).join('');
  }

  /**
   * Renderiza servicios generales o por categoria.
   * @param {string} containerId Id del contenedor.
   * @param {string} [category] Categoria opcional.
   */
  function renderServices(containerId, category) {
    const container = document.getElementById(containerId);
    const services = category ? state.services.filter(service => service.category === category) : state.services;

    if (!services.length) {
      container.innerHTML = '<div class="empty-state">No hay servicios disponibles.</div>';
      return;
    }

    container.innerHTML = services.map(service => `
      <article class="card service-card">
        ${window.MaisonUi.visualImage(service.image, service.name)}
        <div class="card-body">
          <div class="card-meta"><span class="meta-chip">${window.MaisonUi.categoryLabel(service.category)}</span></div>
          <h3 class="card-title">${window.MaisonUi.escapeHTML(service.name)}</h3>
          <p class="card-text">${window.MaisonUi.escapeHTML(service.description)}</p>
          <p class="service-price">${window.MaisonUi.escapeHTML(service.price)}</p>
          <button class="primary-button" type="button" data-book-service="${window.MaisonUi.escapeAttr(service.id)}">Asignar cita</button>
        </div>
      </article>
    `).join('');

    container.querySelectorAll('[data-book-service]').forEach(button => {
      button.addEventListener('click', () => openBookingSheet(button.dataset.bookService));
    });
  }

  /**
   * Abre la asignacion de cita para un servicio.
   * @param {string} serviceId Id del servicio.
   */
  function openBookingSheet(serviceId) {
    const service = state.services.find(item => String(item.id) === String(serviceId));

    if (!service) {
      window.MaisonUi.showToast('El servicio no esta disponible.');
      return;
    }

    selectedSlot = null;
    document.getElementById('booking-service-id').value = service.id;
    document.getElementById('booking-date').value = '';
    document.getElementById('booking-time').value = '';
    document.getElementById('booking-title').textContent = service.name;
    document.getElementById('booking-service-summary').innerHTML = `
      <strong>${window.MaisonUi.escapeHTML(service.name)}</strong>
      <span>${window.MaisonUi.escapeHTML(service.description)}</span>
    `;
    fillEmployeeSelect(service.id);
    renderAvailability();
    document.getElementById('booking-sheet').classList.add('active');
    document.getElementById('booking-sheet').setAttribute('aria-hidden', 'false');
  }

  /** Cierra la hoja de asignacion. */
  function closeBookingSheet() {
    document.getElementById('booking-sheet').classList.remove('active');
    document.getElementById('booking-sheet').setAttribute('aria-hidden', 'true');
  }

  /**
   * Llena el selector de especialistas segun servicio.
   * @param {string} serviceId Id del servicio.
   */
  function fillEmployeeSelect(serviceId) {
    const select = document.getElementById('booking-employee');
    const specialists = state.employees.filter(employee => employee.serviceIds.map(String).includes(String(serviceId)));
    const employeeOptions = specialists.length ? specialists : state.employees;

    select.innerHTML = employeeOptions.map(employee => `
      <option value="${window.MaisonUi.escapeAttr(employee.id)}">${window.MaisonUi.escapeHTML(employee.nombre)} - ${window.MaisonUi.escapeHTML(employee.rol)}</option>
    `).join('');
  }

  /** Renderiza horarios y marca ocupados en gris. */
  function renderAvailability() {
    const container = document.getElementById('booking-availability');
    const employeeId = document.getElementById('booking-employee').value;

    if (!employeeId) {
      container.innerHTML = '<div class="empty-state">No hay especialistas disponibles.</div>';
      return;
    }

    container.innerHTML = window.MaisonStore.getNextDays(7).flatMap(date => (
      window.MaisonStore.getTimeSlots().map(time => {
        const occupied = window.MaisonStore.isSlotTaken(employeeId, date, time);
        const selected = selectedSlot && selectedSlot.date === date && selectedSlot.time === time;
        const className = `availability-slot${occupied ? ' occupied' : ''}${selected ? ' selected' : ''}`;
        return `<button class="${className}" type="button" data-date="${date}" data-time="${time}" ${occupied ? 'disabled' : ''}>${window.MaisonUi.formatDate(date)} ${time}</button>`;
      })
    )).join('');
  }

  /**
   * Guarda una cita creada por usuario y abre WhatsApp con mensaje listo.
   * @param {SubmitEvent} event Evento del formulario.
   */
  function saveBooking(event) {
    event.preventDefault();

    const serviceId = document.getElementById('booking-service-id').value;
    const employeeId = document.getElementById('booking-employee').value;
    const date = document.getElementById('booking-date').value;
    const time = document.getElementById('booking-time').value;
    const service = state.services.find(item => String(item.id) === String(serviceId));

    if (!service || !employeeId || !date || !time) {
      window.MaisonUi.showToast('Selecciona especialista, fecha y hora.');
      return;
    }

    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const today = now.toISOString().slice(0, 10);
    if (date < today) {
      window.MaisonUi.showToast('No puedes reservar citas en fechas pasadas.');
      return;
    }

    if (window.MaisonStore.isSlotTaken(employeeId, date, time)) {
      window.MaisonUi.showToast('Ese horario ya esta ocupado.');
      renderAvailability();
      return;
    }

    const appointment = window.MaisonStore.upsertAppointment({
      clientName: `${currentClient.name} ${currentClient.lastName}`.trim(),
      clientEmail: currentClient.email,
      clientPhone: currentClient.phone,
      serviceIds: [service.id],
      employeeId,
      date,
      time,
      status: 'pendiente',
      notes: 'Cita solicitada por usuario final.',
      source: 'usuario'
    });

    state = window.MaisonStore.getState();
    closeBookingSheet();
    renderAppointments();
    openWhatsApp(appointment, service);
    window.MaisonUi.showToast('Cita creada y enviada a WhatsApp.');
  }

  /**
   * Abre WhatsApp con el mensaje predeterminado de la cita.
   * @param {object} appointment Cita creada.
   * @param {object} service Servicio asignado.
   */
  function openWhatsApp(appointment, service) {
    const employee = window.MaisonStore.getEmployeeById(appointment.employeeId);
    const rawPhone = state.settings.whatsapp || employee?.celular || '';
    const phone = rawPhone.replace(/\D/g, '');

    if (!phone) {
      return;
    }

    const message = [
      'Hola Maison Lash, quiero confirmar mi cita.',
      `Cliente: ${appointment.clientName}`,
      `Servicio: ${service.name}`,
      `Especialista: ${employee ? employee.nombre : 'Por confirmar'}`,
      `Fecha: ${appointment.date}`,
      `Hora: ${appointment.time}`
    ].join('\n');
    const url = `https://wa.me/57${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }
})();
