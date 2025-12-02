# Álbum de Boda - Web

Este repositorio contiene la **versión final de la web del Álbum de Boda**, desarrollada con V0.  
Permite subir fotos desde tu computadora directamente a Google Drive y mostrarlas a los visitantes del álbum.

---

## 🌟 Características

- Subida de fotos desde tu Mac a un álbum específico en Google Drive (`Álbum Boda 1`).  
- Los visitantes pueden ver todas las fotos **sin necesidad de iniciar sesión en Google**.  
- Compatible con GitHub Pages para publicación pública.  
- Funciona con OAuth 2.0 de Google (Client ID) para autorizar la subida de fotos.  

---

## ⚙️ Requisitos previos

- Tener un **Client ID de Google OAuth 2.0** configurado en Google Cloud.  
- Haber agregado tu correo como **Test User** en la pantalla de consentimiento OAuth.  
- Configurar el **dominio de la app y redirect URIs** correctamente (para GitHub Pages o dominio real).  

> Nota: El Client Secret **no debe compartirse públicamente**. GitHub puede mostrar un aviso de “Secret scanning” si lo incluyes directamente en el repositorio.  
> Para pruebas personales, selecciona “Used in test / false positive”.

---

## 🚀 Cómo usar

1. Abre `admin.html` en tu navegador.  
2. Haz clic en **“Acceder con Google”** y autoriza la app.  
3. Selecciona las fotos desde tu computadora que quieras subir.  
4. Las fotos se guardarán en **Google Drive** en la carpeta `Álbum Boda 1`.  
5. Los visitantes podrán ver las fotos directamente desde la web.  

---

## 📂 Estructura del repositorio