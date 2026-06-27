/*
  Maison Lash - controlador del empleado.
  Muestra un calendario independiente conectado con citas creadas por jefe y usuario.
*/
(function () {
  'use strict';

  let session = null;
  let state = null;
  let currentEmployee = null;

  document.addEventListener('DOMContentLoaded', initEmployeePage);

  /** Inicializa la agenda del empleado. */
  function initEmployeePage() {
    state = window.MaisonStore.loadState();
    session = window.MaisonAuth.requireRole(['employee'], '../../');

    if (!session) {
      return;
    }

    currentEmployee = window.MaisonStore.getEmployeeById(session.employeeId);

    if (!currentEmployee) {
      window.MaisonAuth.logout('../../');
      return;
    }

    document.getElementById('logout-button').addEventListener('click', () => window.MaisonAuth.logout('../../'));
    document.getElementById('filter-date').addEventListener('change', renderAppointments);
    document.getElementById('filter-status').addEventListener('change', renderAppointments);
    document.getElementById('employee-name-pill').textContent = currentEmployee.nombre.split(' ')[0] || 'Empleado';
    document.getElementById('employee-title').textContent = currentEmployee.nombre;
    renderSummary();
    renderAppointments();
    window.addEventListener('maison-store-sync', () => {
      state = window.MaisonStore.getState();
      currentEmployee = window.MaisonStore.getEmployeeById(session.employeeId);
      if (!currentEmployee) {
        window.MaisonAuth.logout('../../');
        return;
      }
      renderSummary();
      renderAppointments();
    });
  }

  /** Renderiza resumen de la agenda del empleado. */
  function renderSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const employeeAppointments = getEmployeeAppointments();
    const todayCount = employeeAppointments.filter(appointment => appointment.date === today).length;
    const pendingCount = employeeAppointments.filter(appointment => appointment.status === 'pendiente' || appointment.status === 'confirmada').length;
    const doneCount = employeeAppointments.filter(appointment => appointment.status === 'completada').length;

    document.getElementById('employee-summary').innerHTML = `
      <div class="summary-item"><strong>${todayCount}</strong><span>Hoy</span></div>
      <div class="summary-item"><strong>${pendingCount}</strong><span>Activas</span></div>
      <div class="summary-item"><strong>${doneCount}</strong><span>Hechas</span></div>
    `;
  }

  /** Renderiza citas filtradas. */
  function renderAppointments() {
    const container = document.getElementById('employee-appointments-list');
    const selectedDate = document.getElementById('filter-date').value;
    const selectedStatus = document.getElementById('filter-status').value;
    let appointments = getEmployeeAppointments();

    if (selectedDate) {
      appointments = appointments.filter(appointment => appointment.date === selectedDate);
    }

    if (selectedStatus !== 'all') {
      appointments = appointments.filter(appointment => appointment.status === selectedStatus);
    }

    appointments.sort((first, second) => `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`));

    if (!appointments.length) {
      container.innerHTML = '<div class="empty-state">No hay citas para este filtro.</div>';
      return;
    }

    container.innerHTML = appointments.map(appointment => {
      const statusClass = `status-${appointment.status}`;
      const canComplete = appointment.status !== 'completada' && appointment.status !== 'cancelada';

      return `
        <article class="card employee-appointment-card ${window.MaisonUi.appointmentClass(appointment.categories)}">
          <div class="employee-card-top">
            <div>
              <h3 class="employee-card-title">${window.MaisonUi.escapeHTML(appointment.clientName)}</h3>
              <p class="card-text">${window.MaisonUi.formatDate(appointment.date)}</p>
            </div>
            <div class="time-badge">${window.MaisonUi.escapeHTML(appointment.time)}</div>
          </div>
          <p class="employee-services">${window.MaisonUi.escapeHTML(appointment.serviceNames.join(', '))}</p>
          <div class="card-meta">
            <span class="meta-chip">${window.MaisonUi.escapeHTML(appointment.clientPhone || 'Sin celular')}</span>
            <span class="status-pill ${statusClass}">${window.MaisonUi.escapeHTML(appointment.status)}</span>
          </div>
          ${canComplete ? `<button class="primary-button" type="button" data-complete="${window.MaisonUi.escapeAttr(appointment.id)}">Marcar realizado</button>` : ''}
        </article>
      `;
    }).join('');

    container.querySelectorAll('[data-complete]').forEach(button => {
      button.addEventListener('click', () => completeAppointment(button.dataset.complete));
    });
  }

  /**
   * Devuelve citas del empleado actual.
   * @returns {Array<object>} Citas del empleado.
   */
  function getEmployeeAppointments() {
    return state.appointments.filter(appointment => String(appointment.employeeId) === String(currentEmployee.id));
  }

  /**
   * Marca una cita como completada.
   * @param {string} appointmentId Id de la cita.
   */
  function completeAppointment(appointmentId) {
    const appointment = state.appointments.find(item => String(item.id) === String(appointmentId));

    if (!appointment) {
      return;
    }

    window.MaisonStore.upsertAppointment({ ...appointment, status: 'completada' });
    state = window.MaisonStore.getState();
    renderSummary();
    renderAppointments();
    window.MaisonUi.showToast('Cita marcada como realizada.');
  }
})();
