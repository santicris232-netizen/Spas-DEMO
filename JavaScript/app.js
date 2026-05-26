/*
  Maison Lash - acceso principal.
  La raiz solo autentica y registra clientes; cada rol vive en su propia carpeta.
*/
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', initAuthPage);

  /** Inicializa login y registro. */
  function initAuthPage() {
    window.MaisonStore.loadState();
    window.MaisonAuth.redirectIfLoggedIn('');
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('show-register-button').addEventListener('click', showRegister);
    document.getElementById('cancel-register-button').addEventListener('click', showLogin);
  }

  /**
   * Procesa el inicio de sesion y redirige por rol.
   * @param {SubmitEvent} event Evento de formulario.
   */
  function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const session = window.MaisonAuth.login(username, password);

    if (!session) {
      setError('login-error', 'Usuario o contrasena incorrectos.');
      return;
    }

    window.location.href = window.MaisonAuth.getRouteForRole(session.role, '');
  }

  /**
   * Registra un cliente nuevo y abre su modulo de usuario.
   * @param {SubmitEvent} event Evento de formulario.
   */
  function handleRegister(event) {
    event.preventDefault();
    const state = window.MaisonStore.getState();
    const email = document.getElementById('register-email').value.trim().toLowerCase();

    if (state.clients.some(client => client.email.toLowerCase() === email)) {
      setError('register-error', 'Este correo ya esta registrado.');
      return;
    }

    const client = window.MaisonStore.upsertClient({
      name: document.getElementById('register-name').value,
      lastName: document.getElementById('register-lastname').value,
      phone: document.getElementById('register-phone').value,
      email,
      password: document.getElementById('register-password').value,
      birthday: document.getElementById('register-birthday').value
    });

    window.MaisonAuth.saveSession({
      role: 'user',
      username: client.email,
      displayName: `${client.name} ${client.lastName}`.trim(),
      clientId: client.id,
      employeeId: '',
      createdAt: new Date().toISOString()
    });

    window.location.href = 'usuarios/html/index.html';
  }

  /** Muestra el formulario de registro. */
  function showRegister() {
    clearErrors();
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
  }

  /** Muestra el formulario de login. */
  function showLogin() {
    clearErrors();
    document.getElementById('register-form').reset();
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
  }

  /** Limpia errores visibles. */
  function clearErrors() {
    document.querySelectorAll('.form-error').forEach(error => {
      error.textContent = '';
      error.classList.remove('active');
    });
  }

  /**
   * Muestra un error en formulario.
   * @param {string} id Id del contenedor.
   * @param {string} message Mensaje a mostrar.
   */
  function setError(id, message) {
    const error = document.getElementById(id);
    error.textContent = message;
    error.classList.add('active');
  }
})();
