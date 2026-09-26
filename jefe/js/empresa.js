/*
  CristaSpa - "Mi empresa": enlace y QR, marca (con vista previa y control de contraste),
  contacto y redes, horario de atención, reglas de agenda y mensaje de WhatsApp.
*/
import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';
import { actualizarMarca, guardarConfig, obtenerEmpresa } from '../../compartido/js/repos/empresa.js';
import { guardarHorarios, listarHorarios } from '../../compartido/js/repos/equipo.js';
import { aplicarMarca, contraste, guardarEmpresa, luminancia, urlDeEmpresa } from '../../compartido/js/tenant.js';
import { urlPublica } from '../../compartido/js/supabase.js';
import { comprimirImagen, conCarga, crudo, html, rellenarPlantilla, toast } from '../../compartido/js/ui.js';
import { app, leerFormulario, recargarConfig } from './estado.js';
import { conectarEditorHorario, editorHorario, leerEditorHorario } from './horario-editor.js';

export async function iniciarEmpresa() {
  const [horarios, completa] = await Promise.all([listarHorarios(app.empresa.id), obtenerEmpresa(app.empresa.id)]);
  app.empresa = { ...app.empresa, ...completa };
  const franjas = horarios.filter(franja => !franja.empleado_id);
  const enlace = urlDeEmpresa(app.empresa.slug);
  const config = app.config;
  const empresa = app.empresa;

  document.getElementById('empresa-secciones').innerHTML = html`
    <section class="form-card">
      <h3 class="form-title">Enlace para tus clientes</h3>
      <div class="qr-enlace">
        <img id="empresa-qr" alt="Código QR del enlace de reservas">
        <input class="enlace-empresa" id="empresa-enlace" value="${enlace}" readonly aria-label="Enlace de reservas">
        <div class="acciones-fila">
          <button class="secondary-button" type="button" id="copiar-enlace">Copiar enlace</button>
          <a class="secondary-button" id="descargar-qr" download="${empresa.slug}-qr.png">Descargar QR</a>
        </div>
      </div>
    </section>

    <form class="form-card" id="form-marca" novalidate>
      <h3 class="form-title">Marca</h3>
      <div class="field-group"><label for="marca-nombre">Nombre comercial</label><input id="marca-nombre" name="nombre" required minlength="2" maxlength="80" value="${empresa.nombre}"></div>
      <div class="field-group"><label for="marca-logo">Logo</label><div class="file-field">
        <input type="file" id="marca-logo" name="logo" accept="image/*">
        ${empresa.logo_path ? crudo(html`<img class="image-preview" src="${urlPublica(empresa.logo_path)}" alt="Logo actual">`) : ''}
      </div></div>
      <div class="color-fila">
        <div class="field-group"><label for="marca-primario">Principal</label><input type="color" id="marca-primario" name="color_primario" value="${empresa.color_primario}"></div>
        <div class="field-group"><label for="marca-secundario">Fondo</label><input type="color" id="marca-secundario" name="color_secundario" value="${empresa.color_secundario}"></div>
        <div class="field-group"><label for="marca-acento">Acento</label><input type="color" id="marca-acento" name="color_acento" value="${empresa.color_acento}"></div>
      </div>
      <p class="aviso hidden" id="marca-aviso" role="alert"></p>
      <div class="field-row two">
        <div class="field-group"><label for="marca-correo">Correo de contacto</label><input id="marca-correo" name="correo_contacto" type="email" value="${empresa.correo_contacto || ''}"></div>
        <div class="field-group"><label for="marca-telefono">Teléfono</label><input id="marca-telefono" name="telefono_contacto" type="tel" value="${empresa.telefono_contacto || ''}"></div>
      </div>
      <div class="acciones-fila" data-escritura>
        <button class="primary-button" type="submit">Guardar marca</button>
        <button class="secondary-button" type="button" id="marca-restablecer">Deshacer vista previa</button>
      </div>
    </form>

    <form class="form-card" id="form-contacto" novalidate>
      <h3 class="form-title">WhatsApp y redes</h3>
      <div class="field-group"><label for="cfg-whatsapp">WhatsApp para confirmar citas</label><input id="cfg-whatsapp" name="whatsapp" type="tel" inputmode="numeric" placeholder="3001234567" value="${config.whatsapp || ''}"></div>
      ${crudo(['instagram', 'facebook', 'tiktok'].map(red => html`
        <div class="toggle-field">
          <label><input type="checkbox" name="${red}_activo" ${config[`${red}_activo`] ? crudo('checked') : ''}> ${red[0].toUpperCase() + red.slice(1)}</label>
          <input name="${red}" placeholder="Usuario o enlace" value="${config[red] || ''}" aria-label="${red}">
        </div>`).join(''))}
      <button class="primary-button" type="submit" data-escritura>Guardar contacto</button>
    </form>

    <form class="form-card" id="form-horario-empresa" novalidate>
      <h3 class="form-title">Horario de atención</h3>
      <p class="muted-text">Se usa para todos los especialistas que no tengan horario propio.</p>
      ${crudo(editorHorario(franjas))}
      <button class="primary-button" type="submit" data-escritura>Guardar horario</button>
    </form>

    <form class="form-card" id="form-reglas" novalidate>
      <h3 class="form-title">Reglas de la agenda</h3>
      <div class="field-row two">
        <div class="field-group"><label for="cfg-intervalo">Mostrar horarios cada</label>
          <select id="cfg-intervalo" name="intervalo_agenda_min">
            ${crudo([10, 15, 20, 30, 45, 60].map(minutos => html`<option value="${minutos}" ${minutos === config.intervalo_agenda_min ? crudo('selected') : ''}>${minutos} min</option>`).join(''))}
          </select></div>
        <div class="field-group"><label for="cfg-anticipacion">Anticipación mínima (horas)</label><input id="cfg-anticipacion" name="anticipacion_min_horas" type="number" min="0" max="168" value="${config.anticipacion_min_horas}"></div>
      </div>
      <div class="field-row two">
        <div class="field-group"><label for="cfg-dias">Reservar hasta (días)</label><input id="cfg-dias" name="dias_reserva_max" type="number" min="1" max="365" value="${config.dias_reserva_max}"></div>
        <div class="field-group"><label for="cfg-limite">Límite para cambios (horas antes)</label><input id="cfg-limite" name="horas_limite_cancelacion" type="number" min="0" max="168" value="${config.horas_limite_cancelacion}"></div>
      </div>
      <label class="check-field"><input type="checkbox" name="usuario_puede_cancelar" ${config.usuario_puede_cancelar ? crudo('checked') : ''}> Los clientes pueden cancelar sus citas</label>
      <label class="check-field"><input type="checkbox" name="usuario_puede_reprogramar" ${config.usuario_puede_reprogramar ? crudo('checked') : ''}> Los clientes pueden reprogramar sus citas</label>
      <label class="check-field"><input type="checkbox" name="empleado_ve_precios" ${config.empleado_ve_precios ? crudo('checked') : ''}> Los especialistas ven el precio de sus citas</label>
      <button class="primary-button" type="submit" data-escritura>Guardar reglas</button>
    </form>

    <form class="form-card" id="form-mensaje" novalidate>
      <h3 class="form-title">Mensaje de WhatsApp</h3>
      <p class="muted-text">Variables: {empresa} {cliente} {servicio} {especialista} {fecha} {hora}</p>
      <div class="field-group"><label for="cfg-mensaje">Mensaje que envía el cliente al reservar</label><textarea id="cfg-mensaje" name="mensaje_whatsapp" rows="6" maxlength="600">${config.mensaje_whatsapp}</textarea></div>
      <div class="field-group"><label>Vista previa</label><p class="booking-service-summary" id="mensaje-vista" style="white-space: pre-line"></p></div>
      <button class="primary-button" type="submit" data-escritura>Guardar mensaje</button>
    </form>`;

  prepararEnlace(enlace);
  prepararMarca();
  prepararConfig('form-contacto', datos => datos, 'Contacto guardado.');
  prepararConfig('form-reglas', datos => ({
    ...datos,
    intervalo_agenda_min: Number(datos.intervalo_agenda_min),
    anticipacion_min_horas: Number(datos.anticipacion_min_horas),
    dias_reserva_max: Number(datos.dias_reserva_max),
    horas_limite_cancelacion: Number(datos.horas_limite_cancelacion)
  }), 'Reglas guardadas.');
  prepararConfig('form-mensaje', datos => datos, 'Mensaje guardado.');
  prepararHorario();
  prepararVistaMensaje();
}

async function prepararEnlace(enlace) {
  const imagenQr = await QRCode.toDataURL(enlace, { width: 360, margin: 1 });
  document.getElementById('empresa-qr').src = imagenQr;
  document.getElementById('descargar-qr').href = imagenQr;
  document.getElementById('copiar-enlace').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      toast('Enlace copiado.');
    } catch {
      document.getElementById('empresa-enlace').select();
      toast('Selecciona y copia el enlace.');
    }
  });
}

/** Valida legibilidad de la paleta; devuelve un mensaje si no es aceptable. */
function problemaDeContraste(primario, secundario) {
  if (luminancia(secundario) < 0.55) {
    return 'El color de fondo es muy oscuro: los textos no se leerían. Elige un fondo claro.';
  }
  if (contraste(primario, secundario) < 3) {
    return 'El color principal y el fondo se parecen demasiado: botones y enlaces no se distinguirían.';
  }
  return null;
}

function prepararMarca() {
  const formulario = document.getElementById('form-marca');
  const aviso = document.getElementById('marca-aviso');
  const vistaPrevia = () => {
    const datos = leerFormulario(formulario);
    aplicarMarca({ ...app.empresa, ...datos, logo_path: app.empresa.logo_path }, { titulo: 'Panel' });
    const problema = problemaDeContraste(datos.color_primario, datos.color_secundario);
    aviso.textContent = problema || '';
    aviso.classList.toggle('hidden', !problema);
  };
  formulario.addEventListener('input', evento => {
    if (evento.target.type === 'color' || evento.target.name === 'nombre') {
      vistaPrevia();
    }
  });
  document.getElementById('marca-restablecer').addEventListener('click', () => {
    formulario.reset();
    aplicarMarca(app.empresa, { titulo: 'Panel' });
    aviso.classList.add('hidden');
  });
  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    const datos = leerFormulario(formulario);
    const problema = problemaDeContraste(datos.color_primario, datos.color_secundario);
    if (!datos.nombre || datos.nombre.length < 2) {
      toast('Escribe el nombre comercial.');
      return;
    }
    if (problema) {
      toast(problema);
      return;
    }
    await conCarga(evento.submitter, async () => {
      const logo = datos.logo ? await comprimirImagen(datos.logo) : null;
      const actualizada = await actualizarMarca(app.empresa.id, datos, logo);
      app.empresa = { ...app.empresa, ...actualizada };
      guardarEmpresa(app.empresa);
      aplicarMarca(app.empresa, { titulo: 'Panel' });
      toast('Marca guardada.');
    });
  });
}

/**
 * Conecta un formulario que guarda en empresa_config.
 * @param {string} id Id del formulario.
 * @param {(datos: object) => object} transformar Convierte los valores.
 * @param {string} mensaje Mensaje de éxito.
 */
function prepararConfig(id, transformar, mensaje) {
  const formulario = document.getElementById(id);
  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (!formulario.checkValidity()) {
      toast('Revisa los valores del formulario.');
      return;
    }
    await conCarga(evento.submitter, async () => {
      await guardarConfig(app.empresa.id, transformar(leerFormulario(formulario)));
      await recargarConfig();
      toast(mensaje);
    });
  });
}

function prepararHorario() {
  const formulario = document.getElementById('form-horario-empresa');
  conectarEditorHorario(formulario);
  formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    await conCarga(evento.submitter, async () => {
      await guardarHorarios(app.empresa.id, null, leerEditorHorario(formulario));
      toast('Horario guardado.');
    });
  });
}

function prepararVistaMensaje() {
  const campo = document.getElementById('cfg-mensaje');
  const actualizar = () => {
    document.getElementById('mensaje-vista').textContent = rellenarPlantilla(campo.value, {
      empresa: app.empresa.nombre, cliente: 'Ana Pérez', servicio: 'Lifting de Pestañas', especialista: 'Valentina',
      fecha: 'martes 6 de octubre', hora: '10:00 a. m.'
    });
  };
  campo.addEventListener('input', actualizar);
  actualizar();
}
