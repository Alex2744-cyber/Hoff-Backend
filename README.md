# Backend API - Cleaning App

API REST completa para la aplicación de gestión de servicios de limpieza, construida con Node.js, Express y MySQL.

## 📋 Características

- ✅ Autenticación de administradores y trabajadores
- ✅ Gestión completa de tareas (CRUD)
- ✅ Gestión de trabajadores y clientes
- ✅ Registro de horas trabajadas
- ✅ Gestión de direcciones
- ✅ Búsqueda por dirección
- ✅ Asignación dinámica de trabajadores a tareas
- ✅ Manejo de errores centralizado
- ✅ Conexión optimizada con pool de MySQL

## 🚀 Instalación

### Requisitos Previos

- Node.js 14.x o superior
- MySQL 5.7 o superior
- Base de datos `cleaning_app` ya creada (ver repositorio Hoffsql)

### Paso 1: Instalar dependencias

```bash
cd cleaning-app-backend
npm install
```

### Paso 2: Configurar variables de entorno

Edita el archivo `.env` en la raíz del proyecto (ya existe uno pre-configurado):

```env
# Configuración de MySQL
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password_mysql
DB_NAME=cleaning_app
DB_PORT=3306

# Configuración del servidor
PORT=3000
NODE_ENV=development
```

### Paso 3: Iniciar el servidor

```bash
# Modo producción
npm start

# Modo desarrollo (con nodemon - recarga automática)
npm run dev
```

Deberías ver:

```
✅ Conectado exitosamente a MySQL - Base de datos: cleaning_app
🚀 Servidor iniciado correctamente
📍 URL: http://localhost:3000
```

## 📡 Endpoints de la API

### Base URL
```
http://localhost:3000/api
```

---

## 🔐 Autenticación

### Login Administrador
```http
POST /api/auth/login/admin
Content-Type: application/json

{
  "usuario": "admin",
  "password": "admin123"
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Login exitoso",
  "user": {
    "id": 1,
    "usuario": "admin",
    "nombre": "Carlos Rodríguez",
    "descripcion": "Administrador principal",
    "foto_perfil": null,
    "tipo": "admin"
  }
}
```

### Login Trabajador
```http
POST /api/auth/login/trabajador
Content-Type: application/json

{
  "usuario": "jperez",
  "password": "worker123"
}
```

---

## 📋 Tareas

### Obtener todas las tareas
```http
GET /api/tareas
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "tarea_id": 1,
      "fecha_realizacion": "2025-11-08",
      "estado": "asignada",
      "cliente_nombre": "Tech Solutions S.L.",
      "direccion_completa": "Calle Gran Vía 28, 3º A, Madrid",
      "descripcion_general": "Limpieza de oficinas",
      "valor_servicio": 150.00,
      "trabajadores_asignados": "Ana López, Miguel García"
    }
  ]
}
```

### Obtener tarea por ID
```http
GET /api/tareas/:id
```

### Crear nueva tarea
```http
POST /api/tareas
Content-Type: application/json

{
  "cliente_id": 1,
  "direccion_id": 2,
  "fecha_realizacion": "2025-11-15",
  "descripcion_general": "Limpieza profunda de oficinas",
  "detalles_especificos": "Incluye limpieza de alfombras",
  "numero_horas": 4.5,
  "valor_servicio": 180.00,
  "trabajadores": [1, 2]
}
```

**Nota:** `numero_horas` y `trabajadores` son opcionales.

### Actualizar tarea
```http
PUT /api/tareas/:id
Content-Type: application/json

{
  "fecha_realizacion": "2025-11-20",
  "numero_horas": 5.0,
  "estado": "completada"
}
```

### Eliminar tarea
```http
DELETE /api/tareas/:id
```

### Obtener tareas de un trabajador
```http
GET /api/tareas/trabajador/:trabajadorId
```

### Asignar trabajador a tarea
```http
POST /api/tareas/:tareaId/asignar
Content-Type: application/json

{
  "trabajador_id": 3,
  "notas": "Trabajador con experiencia en este tipo de servicio"
}
```

### Desasignar trabajador de tarea
```http
DELETE /api/tareas/:tareaId/trabajador/:trabajadorId
```

### Buscar tareas por dirección
```http
GET /api/tareas/buscar?busqueda=Gran%20Vía
```

---

## 👷 Trabajadores

### Obtener todos los trabajadores
```http
GET /api/trabajadores
```

### Obtener trabajador por ID
```http
GET /api/trabajadores/:id
```

**Respuesta incluye estadísticas:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "usuario": "jperez",
    "nombre": "Juan Pérez",
    "descripcion": "Especialista en limpieza residencial",
    "estadisticas": {
      "total_tareas": 15,
      "total_horas": 45.50
    }
  }
}
```

### Crear nuevo trabajador
```http
POST /api/trabajadores
Content-Type: application/json

{
  "usuario": "mlopez",
  "password": "password123",
  "nombre": "María López",
  "descripcion": "Limpieza de ventanas"
}
```

### Actualizar trabajador
```http
PUT /api/trabajadores/:id
Content-Type: application/json

{
  "nombre": "Juan Pérez García",
  "descripcion": "Especialista en limpieza residencial y comercial"
}
```

### Cambiar contraseña
```http
PUT /api/trabajadores/:id/password
Content-Type: application/json

{
  "password_actual": "password123",
  "password_nueva": "nueva_password456"
}
```

### Desactivar trabajador
```http
DELETE /api/trabajadores/:id
```

### Obtener horas trabajadas
```http
GET /api/trabajadores/:id/horas

# Con filtros
GET /api/trabajadores/:id/horas?mes=11&anio=2025
```

---

## 👥 Clientes

### Obtener todos los clientes
```http
GET /api/clientes
```

### Obtener cliente por ID
```http
GET /api/clientes/:id
```

**Respuesta incluye estadísticas:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre": "Tech Solutions S.L.",
    "tipo": "empresa",
    "nombre_empresa": "Tech Solutions S.L.",
    "telefono": "+34 912345678",
    "email": "info@techsolutions.es",
    "estadisticas": {
      "total_tareas": 5,
      "tareas_completadas": 3,
      "tareas_pendientes": 2,
      "valor_total": 750.00
    }
  }
}
```

### Crear nuevo cliente
```http
POST /api/clientes
Content-Type: application/json

{
  "nombre": "José García",
  "tipo": "particular",
  "telefono": "+34 666777888",
  "email": "jose@email.com",
  "descripcion": "Cliente residencial"
}
```

**Para empresas:**
```json
{
  "nombre": "Restaurante El Buen Sabor",
  "tipo": "empresa",
  "nombre_empresa": "El Buen Sabor S.L.",
  "telefono": "+34 913456789",
  "email": "contacto@buensabor.es"
}
```

### Actualizar cliente
```http
PUT /api/clientes/:id
Content-Type: application/json

{
  "telefono": "+34 666999888",
  "email": "nuevo@email.com"
}
```

### Desactivar cliente
```http
DELETE /api/clientes/:id
```

### Obtener tareas de un cliente
```http
GET /api/clientes/:id/tareas
```

---

## ⏱️ Horas Trabajadas

### Registrar horas
```http
POST /api/horas
Content-Type: application/json

{
  "tarea_id": 1,
  "trabajador_id": 2,
  "horas": 4.5,
  "descripcion": "Limpieza completa de oficinas"
}
```

### Obtener horas de una tarea
```http
GET /api/horas/tarea/:tareaId
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "tarea_id": 5,
      "trabajador_id": 2,
      "trabajador_nombre": "Ana López",
      "horas": 2.50,
      "descripcion": "Limpieza de consultorios",
      "fecha_registro": "2025-11-06T10:30:00.000Z"
    }
  ],
  "total_horas": 2.50
}
```

### Actualizar registro de horas
```http
PUT /api/horas/:id
Content-Type: application/json

{
  "horas": 5.0,
  "descripcion": "Limpieza completa + ventanas"
}
```

### Eliminar registro de horas
```http
DELETE /api/horas/:id
```

---

## 📍 Direcciones

### Obtener todas las direcciones
```http
GET /api/direcciones
```

### Obtener dirección por ID
```http
GET /api/direcciones/:id
```

### Crear nueva dirección
```http
POST /api/direcciones
Content-Type: application/json

{
  "direccion_completa": "Calle Alcalá 150, 2º B, Madrid, 28028",
  "calle": "Calle Alcalá",
  "numero": "150",
  "piso": "2º B",
  "ciudad": "Madrid",
  "codigo_postal": "28028",
  "provincia": "Madrid",
  "pais": "España"
}
```

### Actualizar dirección
```http
PUT /api/direcciones/:id
Content-Type: application/json

{
  "piso": "3º B",
  "notas": "Portero automático, código 1234"
}
```

### Eliminar dirección
```http
DELETE /api/direcciones/:id
```

### Buscar direcciones
```http
GET /api/direcciones/buscar?busqueda=Alcalá
```

---

## 🧪 Testing de la API

### Con cURL

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login/admin \
  -H "Content-Type: application/json" \
  -d '{"usuario":"admin","password":"admin123"}'

# Obtener tareas
curl http://localhost:3000/api/tareas

# Crear cliente
curl -X POST http://localhost:3000/api/clientes \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test Cliente","tipo":"particular","telefono":"+34666777888"}'
```

### Con Postman

1. Importa la colección desde: [Archivo de colección Postman - opcional]
2. Configura la variable de entorno `base_url` = `http://localhost:3000`

### Con Thunder Client (VS Code)

1. Instala la extensión Thunder Client
2. Crea un nuevo request
3. URL: `http://localhost:3000/api/tareas`
4. Method: `GET`

---

## 📂 Estructura del Proyecto

```
cleaning-app-backend/
├── src/
│   ├── config/
│   │   └── database.js          # Configuración de MySQL
│   ├── controllers/
│   │   ├── authController.js    # Lógica de autenticación
│   │   ├── tareasController.js  # Lógica de tareas
│   │   ├── trabajadoresController.js
│   │   ├── clientesController.js
│   │   ├── horasController.js
│   │   └── direccionesController.js
│   ├── routes/
│   │   ├── auth.js              # Rutas de autenticación
│   │   ├── tareas.js
│   │   ├── trabajadores.js
│   │   ├── clientes.js
│   │   ├── horas.js
│   │   └── direcciones.js
│   └── middleware/
│       ├── errorHandler.js      # Manejo centralizado de errores
│       └── validateRequest.js   # Validación de requests
├── server.js                    # Punto de entrada principal
├── package.json
├── .env                         # Variables de entorno
├── .gitignore
└── README.md
```

---

## 🔧 Configuración Avanzada

### Pool de Conexiones MySQL

El backend usa un pool de conexiones para mejor rendimiento:

```javascript
// En src/config/database.js
const pool = mysql.createPool({
  connectionLimit: 10,  // Máximo 10 conexiones simultáneas
  waitForConnections: true,
  queueLimit: 0
});
```

### Manejo de Errores

Todos los errores son capturados y formateados consistentemente:

```json
{
  "success": false,
  "error": "Mensaje de error descriptivo"
}
```

---

## 🔌 Conectar con React Native

### Ejemplo de uso en React Native:

```javascript
// services/api.js
const API_URL = 'http://localhost:3000/api';  // En emulador Android: http://10.0.2.2:3000/api

export const login = async (usuario, password, tipo) => {
  const response = await fetch(`${API_URL}/auth/login/${tipo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, password })
  });
  return await response.json();
};

export const getTareas = async () => {
  const response = await fetch(`${API_URL}/tareas`);
  return await response.json();
};

export const createTarea = async (tareaData) => {
  const response = await fetch(`${API_URL}/tareas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tareaData)
  });
  return await response.json();
};
```

### Uso en componente:

```javascript
import { login, getTareas } from './services/api';

const LoginScreen = () => {
  const handleLogin = async () => {
    const result = await login('admin', 'admin123', 'admin');
    if (result.success) {
      console.log('Login exitoso:', result.user);
    }
  };

  const loadTareas = async () => {
    const result = await getTareas();
    if (result.success) {
      console.log('Tareas:', result.data);
    }
  };
};
```

---

## 🐛 Solución de Problemas

### Error: Cannot connect to MySQL

```
❌ Error al conectar a MySQL: Access denied for user 'root'@'localhost'
```

**Solución:**
1. Verifica tu contraseña en el archivo `.env`
2. Asegúrate de que MySQL está corriendo: `net start MySQL80`
3. Verifica que la base de datos `cleaning_app` existe

### Error: Port 3000 already in use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solución:**
1. Cambia el puerto en `.env`: `PORT=3001`
2. O mata el proceso que usa el puerto 3000

### Error: Cannot find module

```
Error: Cannot find module 'express'
```

**Solución:**
```bash
npm install
```

---

## 📊 Códigos de Estado HTTP

- `200` - OK (éxito)
- `201` - Created (recurso creado)
- `400` - Bad Request (datos inválidos)
- `401` - Unauthorized (credenciales inválidas)
- `404` - Not Found (recurso no encontrado)
- `500` - Internal Server Error (error del servidor)

---

## 🚦 Próximas Características

- [ ] Autenticación con JWT
- [ ] Upload de fotos
- [ ] Sistema de notificaciones
- [ ] Logs de auditoría
- [ ] Rate limiting
- [ ] Paginación de resultados

---

## 📝 Licencia

Este proyecto es parte de la Cleaning App.

---

## 👨‍💻 Soporte

Si encuentras algún problema o tienes preguntas:
1. Verifica la sección de Solución de Problemas
2. Revisa que MySQL esté corriendo
3. Verifica la configuración del archivo `.env`

---

**Creado con ❤️ para Cleaning App**


#   H o f f - B a c k e n d  
 