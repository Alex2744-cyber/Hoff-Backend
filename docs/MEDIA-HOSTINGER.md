# Imágenes y ficheros en Hostinger (VPS)

## Cómo funciona

1. La app envía `POST /api/media/upload` con `Authorization: Bearer` y cuerpo `multipart/form-data`:
   - campo `tipo`: `cliente_perfil` | `trabajador_perfil` | `admin_perfil` | `tarea_evidencia`
   - campo `file`: imagen (JPEG, PNG o WEBP)
2. El API valida permisos y tipo MIME, guarda el archivo bajo `UPLOADS_DIR/media/` (por defecto `./uploads/media/` en el servidor).
3. La respuesta incluye `data.url` (URL absoluta) que la app guarda en `foto_perfil` u otros campos vía JSON en create/update.
4. Las imágenes se sirven por HTTP sin JWT: `GET /uploads/media/<archivo>` (Express `static` o Nginx apuntando al mismo directorio).

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `ALLOWED_ORIGINS` | Lista de orígenes web permitidos por CORS (separados por coma, sin `/` final). |
| `RATE_LIMIT_GLOBAL_MAX` | Máximo de requests por IP cada 15 min (default 600). |
| `RATE_LIMIT_UPLOAD_MAX` | Máximo de subidas a `/api/media/upload` por IP cada 15 min (default 60). |
| `UPLOADS_DIR` | Ruta absoluta en disco (persistente en el VPS). |
| `PUBLIC_BASE_URL` | Origen público `https://tu-api…` sin `/` final; usado para construir la URL devuelta al cliente. |
| `MAX_UPLOAD_MB` | Límite de tamaño por archivo (default 5). |

En Nginx, si el tráfico pasa por proxy, conviene `proxy_set_header X-Forwarded-Proto $scheme` para que las URLs generadas usen HTTPS.

### Desarrollo (Expo en dispositivo físico)

Si el API corre en `http://192.168.x.y:3000` pero Express ve `Host: localhost`, las URLs de subida pueden salir como `http://localhost:3000/uploads/...` y la imagen no cargará en el móvil. Define entonces `PUBLIC_BASE_URL=http://192.168.x.y:3000` (misma base que uses en `EXPO_PUBLIC_API_URL` sin `/api`).

## Retención (2 meses)

Política acordada en el proyecto: borrar ficheros antiguos periódicamente.

**Opción A – cron en el VPS (recomendada)**

```bash
# Cada domingo 3:15 — borrar imágenes en media/ con más de 60 días
15 3 * * 0 find /var/www/hoff/uploads/media -type f -mtime +60 -delete
```

Ajusta la ruta a la misma que `UPLOADS_DIR` + `/media`.

**Riesgo:** si borras archivos que sigan referenciados en MySQL (`foto_perfil`), en la app se verá imagen rota. Opciones:

- Mantener solo limpieza de una carpeta temporal, no `media/` de producción, hasta tener job que también limpie BD; o
- Registrar fecha de subida en BD y borrar solo huérfanos; o
- Aceptar rotura para fotos muy antiguas según política de negocio.

Documenta la decisión en despliegue y revisa backups antes de activar borrado en caliente.

## Checklist de despliegue

- [ ] Crear directorio `UPLOADS_DIR` con permisos de escritura para el usuario de PM2/node.
- [ ] Definir `ALLOWED_ORIGINS` con los dominios reales de la app web.
- [ ] Definir `PUBLIC_BASE_URL` con el dominio real HTTPS.
- [ ] Comprobar que `GET /uploads/media/...` responde 200 desde el navegador y desde la app.
- [ ] Programar cron de retención o decisión explícita de no borrar hasta segunda fase.

## Troubleshooting rápido (CORS y rate limit)

- Error CORS en navegador: revisa `ALLOWED_ORIGINS` exacto (protocolo, subdominio y sin barra final).
- Si app nativa funciona y web no, normalmente falta incluir el dominio web en `ALLOWED_ORIGINS`.
- Respuesta `429 Too Many Requests`: aumenta temporalmente `RATE_LIMIT_GLOBAL_MAX` o `RATE_LIMIT_UPLOAD_MAX` y vuelve a ajustar según tráfico real.
