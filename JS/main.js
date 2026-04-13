// Seleccionamos todas las páginas
const pages = document.querySelectorAll('.page');
let currentPage = 0;

// Función para pasar la página
function nextPage() {
    if (currentPage < pages.length) {
        pages[currentPage].classList.add('flipped');
        currentPage++;
    }
}

// Función para volver atrás
function prevPage() {
    if (currentPage > 0) {
        currentPage--;
        pages[currentPage].classList.remove('flipped');
    }
}

// Evento de clic en el libro para pasar páginas
document.getElementById('book').addEventListener('click', (e) => {
    // Si no es un botón de agendar, pasamos la página
    if (!e.target.classList.contains('btn-agendar')) {
        nextPage();
    }
});

// Función para abrir el formulario de agendamiento
function abrirModal(servicio) {
    console.log("Abriendo agenda para: " + servicio);
    // Aquí conectaremos luego con el calendario
    alert("Pronto agendaremos tu cita para: " + servicio);
}