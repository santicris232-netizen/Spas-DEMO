/*
  Maison Lash - autenticacion compartida.
  Gestiona usuarios base, clientes registrados, empleados y rutas por rol.
*/
(function () {
  'use strict';

  const SESSION_KEY = 'maisonlash_session';

  const BASE_USERS = [
    { username: 'usuario', password: 'user123', role: 'user', clientId: 'client-demo', displayName: 'Cliente Demo' },
    { username: 'jefe', password: 'jefe123', role: 'boss', displayName: 'Dueno Maison Lash' },
    { username: 'admin', password: 'admin123', role: 'boss', displayName: 'Administrador Maison Lash' }
  ];

  const ROLE_ROUTES = {
    user: 'usuarios/html/index.html',
    boss: 'jefe/html/index.html',
    employee: 'empleado/html/index.html'
  };

  /**
   * Devuelve todos los perfiles que pueden iniciar sesion.
   * @returns {Array<object>} Usuarios de acceso.
   */
  function getAllUsers() {
    const state = window.MaisonStore.getState();
    const clients = state.clients.map(client => ({
      username: client.email,
      password: client.password,
      role: 'user',
      clientId: client.id,
      displayName: `${client.name} ${client.lastName}`.trim(),
      email: client.email
    }));
    const employees = state.employees.map(employee => ({
      username: employee.usuario,
      email: employee.correo,
      password: employee.password,
      role: 'employee',
      employeeId: employee.id,
      displayName: employee.nombre
    }));

    return [...BASE_USERS, ...clients, ...employees];
  }

  /**
   * Intenta iniciar sesion con usuario/correo y contrasena.
   * @param {string} identifier Usuario o correo.
   * @param {string} password Contrasena.
   * @returns {object|null} Sesion creada o null si no coincide.
   */
  function login(identifier, password) {
    const normalizedIdentifier = normalize(identifier);
    const user = getAllUsers().find(candidate => {
      const usernameMatches = normalize(candidate.username) === normalizedIdentifier;
      const emailMatches = candidate.email && normalize(candidate.email) === normalizedIdentifier;
      return (usernameMatches || emailMatches) && candidate.password === password;
    });

    if (!user) {
      return null;
    }

    const session = {
      role: user.role,
      username: user.username,
      displayName: user.displayName,
      clientId: user.clientId || '',
      employeeId: user.employeeId || '',
      createdAt: new Date().toISOString()
    };
    saveSession(session);
    return session;
  }

  /**
   * Guarda la sesion activa.
   * @param {object} session Datos de sesion.
   */
  function saveSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  /**
   * Obtiene la sesion activa si existe.
   * @returns {object|null} Sesion activa.
   */
  function getSession() {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      return session ? JSON.parse(session) : null;
    } catch (error) {
      return null;
    }
  }

  /** Cierra sesion y vuelve al login. */
  function logout(rootPrefix = '') {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = `${rootPrefix}index.html`;
  }

  /**
   * Protege una pagina por rol y redirige cuando no corresponde.
   * @param {Array<string>} allowedRoles Roles admitidos.
   * @param {string} rootPrefix Prefijo relativo hacia la raiz.
   * @returns {object|null} Sesion permitida.
   */
  function requireRole(allowedRoles, rootPrefix = '../../') {
    const session = getSession();

    if (!session) {
      window.location.href = `${rootPrefix}index.html`;
      return null;
    }

    if (!allowedRoles.includes(session.role)) {
      window.location.href = getRouteForRole(session.role, rootPrefix);
      return null;
    }

    return session;
  }

  /**
   * Redirige desde login si ya existe una sesion valida.
   * @param {string} rootPrefix Prefijo relativo hacia la raiz.
   */
  function redirectIfLoggedIn(rootPrefix = '') {
    const session = getSession();

    if (session) {
      window.location.href = getRouteForRole(session.role, rootPrefix);
    }
  }

  /**
   * Obtiene la ruta de una pantalla por rol.
   * @param {string} role Rol de usuario.
   * @param {string} rootPrefix Prefijo relativo hacia la raiz.
   * @returns {string} Ruta calculada.
   */
  function getRouteForRole(role, rootPrefix = '') {
    return `${rootPrefix}${ROLE_ROUTES[role] || ROLE_ROUTES.user}`;
  }

  /**
   * Normaliza texto para comparar credenciales.
   * @param {string} value Texto de entrada.
   * @returns {string} Texto normalizado.
   */
  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  window.MaisonAuth = {
    SESSION_KEY,
    BASE_USERS,
    ROLE_ROUTES,
    getAllUsers,
    login,
    saveSession,
    getSession,
    logout,
    requireRole,
    redirectIfLoggedIn,
    getRouteForRole
  };
})();
