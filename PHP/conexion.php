<?php
// Configuración para Hostinger
$host = "localhost";
$db_name = "u123456789_maison_db"; // Cambia esto por el nombre real en tu panel
$username = "u123456789_admin";    // Usuario creado en MySQL
$password = "Segura123";

try {
    // Usamos PDO por ser más seguro contra inyecciones SQL
    $pdo = new PDO("mysql:host=$host;dbname=$db_name;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Error de conexión: " . $e->getMessage());
}
?>