# 📱 Integración con React Native

Guía completa para conectar tu app React Native con este backend.

## 🔧 Configuración Inicial

### 1. Crear servicio de API

Crea el archivo `services/api.js` en tu proyecto React Native:

```javascript
// services/api.js

// Configurar URL base según el entorno
const getBaseUrl = () => {
  if (__DEV__) {
    // En desarrollo
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3000/api';  // Emulador Android
    } else {
      return 'http://localhost:3000/api';  // iOS Simulator
    }
  }
  // En producción
  return 'https://tu-servidor.com/api';
};

const API_URL = getBaseUrl();

// Función helper para hacer peticiones
const apiRequest = async (endpoint, options = {}) => {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error en la petición');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

export default {
  // ==================== AUTENTICACIÓN ====================
  
  loginAdmin: (usuario, password) => 
    apiRequest('/auth/login/admin', {
      method: 'POST',
      body: JSON.stringify({ usuario, password }),
    }),

  loginTrabajador: (usuario, password) => 
    apiRequest('/auth/login/trabajador', {
      method: 'POST',
      body: JSON.stringify({ usuario, password }),
    }),

  // ==================== TAREAS ====================
  
  getTareas: () => 
    apiRequest('/tareas'),

  getTareaById: (id) => 
    apiRequest(`/tareas/${id}`),

  createTarea: (tareaData) => 
    apiRequest('/tareas', {
      method: 'POST',
      body: JSON.stringify(tareaData),
    }),

  updateTarea: (id, tareaData) => 
    apiRequest(`/tareas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(tareaData),
    }),

  deleteTarea: (id) => 
    apiRequest(`/tareas/${id}`, {
      method: 'DELETE',
    }),

  getTareasByTrabajador: (trabajadorId) => 
    apiRequest(`/tareas/trabajador/${trabajadorId}`),

  buscarTareasPorDireccion: (busqueda) => 
    apiRequest(`/tareas/buscar?busqueda=${encodeURIComponent(busqueda)}`),

  asignarTrabajador: (tareaId, trabajadorId, notas) => 
    apiRequest(`/tareas/${tareaId}/asignar`, {
      method: 'POST',
      body: JSON.stringify({ trabajador_id: trabajadorId, notas }),
    }),

  // ==================== TRABAJADORES ====================
  
  getTrabajadores: () => 
    apiRequest('/trabajadores'),

  getTrabajadorById: (id) => 
    apiRequest(`/trabajadores/${id}`),

  createTrabajador: (trabajadorData) => 
    apiRequest('/trabajadores', {
      method: 'POST',
      body: JSON.stringify(trabajadorData),
    }),

  updateTrabajador: (id, trabajadorData) => 
    apiRequest(`/trabajadores/${id}`, {
      method: 'PUT',
      body: JSON.stringify(trabajadorData),
    }),

  // ==================== CLIENTES ====================
  
  getClientes: () => 
    apiRequest('/clientes'),

  getClienteById: (id) => 
    apiRequest(`/clientes/${id}`),

  createCliente: (clienteData) => 
    apiRequest('/clientes', {
      method: 'POST',
      body: JSON.stringify(clienteData),
    }),

  updateCliente: (id, clienteData) => 
    apiRequest(`/clientes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(clienteData),
    }),

  getTareasCliente: (id) => 
    apiRequest(`/clientes/${id}/tareas`),

  // ==================== HORAS ====================
  
  registrarHoras: (horasData) => 
    apiRequest('/horas', {
      method: 'POST',
      body: JSON.stringify(horasData),
    }),

  getHorasByTarea: (tareaId) => 
    apiRequest(`/horas/tarea/${tareaId}`),

  // ==================== DIRECCIONES ====================
  
  getDirecciones: () => 
    apiRequest('/direcciones'),

  createDireccion: (direccionData) => 
    apiRequest('/direcciones', {
      method: 'POST',
      body: JSON.stringify(direccionData),
    }),

  buscarDirecciones: (busqueda) => 
    apiRequest(`/direcciones/buscar?busqueda=${encodeURIComponent(busqueda)}`),
};
```

---

## 📝 Ejemplos de Uso en Componentes

### Login Screen

```javascript
import React, { useState } from 'react';
import { View, TextInput, Button, Alert } from 'react-native';
import api from '../services/api';

const LoginScreen = ({ navigation }) => {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [tipo, setTipo] = useState('trabajador'); // 'admin' o 'trabajador'

  const handleLogin = async () => {
    try {
      let result;
      if (tipo === 'admin') {
        result = await api.loginAdmin(usuario, password);
      } else {
        result = await api.loginTrabajador(usuario, password);
      }

      if (result.success) {
        // Guardar usuario en AsyncStorage o Context
        Alert.alert('Éxito', `Bienvenido ${result.user.nombre}`);
        
        // Navegar según el tipo de usuario
        if (tipo === 'admin') {
          navigation.navigate('AdminDashboard', { user: result.user });
        } else {
          navigation.navigate('TrabajadorDashboard', { user: result.user });
        }
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View>
      <TextInput
        placeholder="Usuario"
        value={usuario}
        onChangeText={setUsuario}
      />
      <TextInput
        placeholder="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button title="Iniciar Sesión" onPress={handleLogin} />
    </View>
  );
};

export default LoginScreen;
```

### Lista de Tareas

```javascript
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import api from '../services/api';

const TareasScreen = ({ route }) => {
  const [tareas, setTareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const trabajadorId = route.params?.user?.id;

  useEffect(() => {
    cargarTareas();
  }, []);

  const cargarTareas = async () => {
    try {
      setLoading(true);
      let result;
      
      if (trabajadorId) {
        // Si es trabajador, mostrar solo sus tareas
        result = await api.getTareasByTrabajador(trabajadorId);
      } else {
        // Si es admin, mostrar todas las tareas
        result = await api.getTareas();
      }

      if (result.success) {
        setTareas(result.data);
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar las tareas');
    } finally {
      setLoading(false);
    }
  };

  const renderTarea = ({ item }) => (
    <View style={styles.tareaCard}>
      <Text style={styles.titulo}>{item.descripcion_general}</Text>
      <Text>Cliente: {item.cliente_nombre}</Text>
      <Text>Fecha: {item.fecha_realizacion}</Text>
      <Text>Estado: {item.estado}</Text>
      <Text>Valor: €{item.valor_servicio}</Text>
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="large" />;
  }

  return (
    <FlatList
      data={tareas}
      keyExtractor={(item) => item.tarea_id?.toString() || item.id?.toString()}
      renderItem={renderTarea}
      refreshing={loading}
      onRefresh={cargarTareas}
    />
  );
};
```

### Crear Nueva Tarea

```javascript
import React, { useState, useEffect } from 'react';
import { View, TextInput, Button, Picker, Alert } from 'react-native';
import api from '../services/api';

const CrearTareaScreen = ({ navigation }) => {
  const [clientes, setClientes] = useState([]);
  const [direcciones, setDirecciones] = useState([]);
  const [trabajadores, setTrabajadores] = useState([]);
  
  const [formData, setFormData] = useState({
    cliente_id: '',
    direccion_id: '',
    fecha_realizacion: '',
    descripcion_general: '',
    detalles_especificos: '',
    numero_horas: '',
    valor_servicio: '',
    trabajadores: []
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const [clientesRes, direccionesRes, trabajadoresRes] = await Promise.all([
        api.getClientes(),
        api.getDirecciones(),
        api.getTrabajadores()
      ]);

      if (clientesRes.success) setClientes(clientesRes.data);
      if (direccionesRes.success) setDirecciones(direccionesRes.data);
      if (trabajadoresRes.success) setTrabajadores(trabajadoresRes.data);
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar los datos');
    }
  };

  const handleSubmit = async () => {
    try {
      const result = await api.createTarea({
        ...formData,
        numero_horas: formData.numero_horas ? parseFloat(formData.numero_horas) : null,
        valor_servicio: parseFloat(formData.valor_servicio)
      });

      if (result.success) {
        Alert.alert('Éxito', 'Tarea creada correctamente');
        navigation.goBack();
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View>
      <Picker
        selectedValue={formData.cliente_id}
        onValueChange={(value) => setFormData({...formData, cliente_id: value})}
      >
        <Picker.Item label="Seleccionar cliente..." value="" />
        {clientes.map(cliente => (
          <Picker.Item 
            key={cliente.id} 
            label={cliente.nombre} 
            value={cliente.id} 
          />
        ))}
      </Picker>

      <TextInput
        placeholder="Descripción general"
        value={formData.descripcion_general}
        onChangeText={(text) => setFormData({...formData, descripcion_general: text})}
      />

      <TextInput
        placeholder="Valor del servicio"
        keyboardType="numeric"
        value={formData.valor_servicio}
        onChangeText={(text) => setFormData({...formData, valor_servicio: text})}
      />

      <Button title="Crear Tarea" onPress={handleSubmit} />
    </View>
  );
};
```

### Registrar Horas Trabajadas

```javascript
import React, { useState } from 'react';
import { View, TextInput, Button, Alert } from 'react-native';
import api from '../services/api';

const RegistrarHorasScreen = ({ route, navigation }) => {
  const { tareaId, trabajadorId } = route.params;
  const [horas, setHoras] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const handleRegistrar = async () => {
    try {
      const result = await api.registrarHoras({
        tarea_id: tareaId,
        trabajador_id: trabajadorId,
        horas: parseFloat(horas),
        descripcion
      });

      if (result.success) {
        Alert.alert('Éxito', 'Horas registradas correctamente');
        navigation.goBack();
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View>
      <TextInput
        placeholder="Número de horas"
        keyboardType="decimal-pad"
        value={horas}
        onChangeText={setHoras}
      />
      <TextInput
        placeholder="Descripción del trabajo realizado"
        multiline
        value={descripcion}
        onChangeText={setDescripcion}
      />
      <Button title="Registrar Horas" onPress={handleRegistrar} />
    </View>
  );
};
```

---

## 🔄 Context API para Estado Global

```javascript
// contexts/AuthContext.js
import React, { createContext, useState, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = async (usuario, password, tipo) => {
    setLoading(true);
    try {
      let result;
      if (tipo === 'admin') {
        result = await api.loginAdmin(usuario, password);
      } else {
        result = await api.loginTrabajador(usuario, password);
      }

      if (result.success) {
        setUser(result.user);
        await AsyncStorage.setItem('user', JSON.stringify(result.user));
        return true;
      }
      return false;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setUser(null);
    await AsyncStorage.removeItem('user');
  };

  const loadUser = async () => {
    const userData = await AsyncStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

---

## 📦 Dependencias Necesarias

```bash
# Navegación
npm install @react-navigation/native @react-navigation/stack

# AsyncStorage para persistencia
npm install @react-native-async-storage/async-storage

# Date picker (para fechas)
npm install react-native-date-picker
```

---

## 🚨 Manejo de Errores

```javascript
// utils/errorHandler.js
export const handleApiError = (error) => {
  if (error.message) {
    return error.message;
  }
  
  if (error.response) {
    // Error de respuesta del servidor
    return error.response.data?.error || 'Error del servidor';
  }
  
  if (error.request) {
    // No se recibió respuesta
    return 'No se pudo conectar con el servidor. Verifica tu conexión.';
  }
  
  return 'Ocurrió un error inesperado';
};

// Uso en componentes:
try {
  const result = await api.getTareas();
} catch (error) {
  Alert.alert('Error', handleApiError(error));
}
```

---

## 🔐 Buenas Prácticas

1. **Siempre valida los inputs antes de enviarlos**
2. **Maneja los estados de carga (loading)**
3. **Muestra mensajes de error claros al usuario**
4. **Usa AsyncStorage para persistir la sesión**
5. **Implementa refresh en las listas (pull to refresh)**
6. **Maneja la pérdida de conexión**

---

## 📍 URLs según el entorno

```javascript
// Desarrollo local
Android Emulator: http://10.0.2.2:3000/api
iOS Simulator:    http://localhost:3000/api
Dispositivo físico (misma red): http://192.168.1.XXX:3000/api

// Producción
Servidor en la nube: https://tu-dominio.com/api
```

---

¡Listo! Con estos ejemplos puedes integrar completamente tu app React Native con el backend. 🚀


