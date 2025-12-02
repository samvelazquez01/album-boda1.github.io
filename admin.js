import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js"

let googleAccessToken = null
let driveFolderId = null
let currentUserEmail = null
const ALBUM_FOLDER_NAME = "Album-Boda"

// Declare gapi variable
window.gapi = window.gapi || {}

function initializeGoogleAuth() {
  console.log("[v0] Initializing Google Drive authentication...")

  const connectBtn = document.getElementById("connect-google-btn")
  connectBtn.addEventListener("click", handleGoogleConnect)

  // Verificar si hay token guardado en localStorage
  const savedToken = localStorage.getItem("google_access_token")
  const savedEmail = localStorage.getItem("google_user_email")

  if (savedToken && savedEmail) {
    googleAccessToken = savedToken
    currentUserEmail = savedEmail
    updateGoogleAuthUI(true, savedEmail)
    initializeDriveFolder()
    console.log("[v0] Restored session for:", savedEmail)
  }
}

function handleGoogleConnect() {
  console.log("[v0] Starting Google OAuth 2.0 flow...")

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("client_id", window.googleConfig.clientId)
  authUrl.searchParams.set("redirect_uri", window.googleConfig.redirectUri)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", window.googleConfig.scope)
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent")

  console.log("[v0] Redirecting to Google OAuth:", authUrl.toString())

  // Abrir en popup
  const width = 500
  const height = 600
  const left = (window.innerWidth - width) / 2
  const top = (window.innerHeight - height) / 2

  const popup = window.open(
    authUrl.toString(),
    "google-auth",
    `width=${width},height=${height},left=${left},top=${top}`,
  )

  // Verificar cada 500ms si el popup se cerró
  const checkPopup = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkPopup)
      console.log("[v0] OAuth popup closed, checking for authorization code...")

      // Verificar si hay código en la URL
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get("code")

      if (code) {
        console.log("[v0] Authorization code received:", code)
        exchangeCodeForToken(code)

        // Limpiar URL
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    }
  }, 500)

  // Timeout de 5 minutos
  setTimeout(() => clearInterval(checkPopup), 5 * 60 * 1000)
}

async function exchangeCodeForToken(code) {
  try {
    console.log("[v0] Exchanging authorization code for access token...")

    // IMPORTANTE: Esta solicitud debe ser hecha desde un backend seguro
    // Para demostración local, usamos un endpoint que requiere el client_secret
    // En producción, NUNCA expongas el client_secret en el frontend

    const tokenUrl = "https://oauth2.googleapis.com/token"

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: window.googleConfig.clientId,
        client_secret: window.googleConfig.clientSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: window.googleConfig.redirectUri,
      }).toString(),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Token exchange failed: ${error.error_description || error.error}`)
    }

    const data = await response.json()
    console.log("[v0] Token received successfully")

    // Guardar token
    googleAccessToken = data.access_token

    // Decodificar JWT del id_token para obtener email
    if (data.id_token) {
      const decoded = parseJwt(data.id_token)
      currentUserEmail = decoded.email
      console.log("[v0] User email:", currentUserEmail)
    }

    // Guardar en localStorage para persistencia
    localStorage.setItem("google_access_token", googleAccessToken)
    localStorage.setItem("google_user_email", currentUserEmail)

    // Actualizar UI
    updateGoogleAuthUI(true, currentUserEmail)

    // Inicializar carpeta de Drive
    await initializeDriveFolder()
  } catch (error) {
    console.error("[v0] Error exchanging code for token:", error)
    alert("Error al conectar con Google Drive: " + error.message)
  }
}

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1]
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    )
    return JSON.parse(jsonPayload)
  } catch (error) {
    console.error("[v0] Error parsing JWT:", error)
    return {}
  }
}

function signOutGoogle() {
  console.log("[v0] Signing out from Google...")
  googleAccessToken = null
  currentUserEmail = null
  driveFolderId = null

  // Limpiar localStorage
  localStorage.removeItem("google_access_token")
  localStorage.removeItem("google_user_email")

  updateGoogleAuthUI(false, null)
  alert("Sesión cerrada")
}

function updateGoogleAuthUI(isSignedIn, userEmail) {
  const statusDiv = document.getElementById("google-drive-status")
  const statusContainer = document.getElementById("google-signin-status")
  const connectBtn = document.getElementById("connect-google-btn")

  if (isSignedIn) {
    statusDiv.classList.add("connected")
    statusContainer.innerHTML = `
      <div class="user-info">
        <span class="user-email">${userEmail}</span>
        <button id="logout-btn" class="logout-btn">Desconectar</button>
      </div>
    `
    connectBtn.style.display = "none"
    document.getElementById("logout-btn").addEventListener("click", signOutGoogle)
    console.log("[v0] Google Drive connected for:", userEmail)
  } else {
    statusDiv.classList.remove("connected")
    statusContainer.innerHTML = ""
    connectBtn.style.display = "block"
    console.log("[v0] Google Drive disconnected")
  }
}

async function initializeDriveFolder() {
  try {
    console.log("[v0] Initializing Drive folder...")

    if (!googleAccessToken) {
      throw new Error("No access token available")
    }

    // Buscar carpeta existente
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${ALBUM_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&spaces=drive&pageSize=1`,
      {
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
      },
    )

    if (!response.ok) {
      throw new Error(`Drive API error: ${response.statusText}`)
    }

    const data = await response.json()
    console.log("[v0] Drive API response:", data)

    if (data.files && data.files.length > 0) {
      driveFolderId = data.files[0].id
      document.getElementById("google-drive-status").classList.add("connected")
      console.log("[v0] Found existing folder:", driveFolderId)
    } else {
      console.log("[v0] Creating new Drive folder...")
      // Crear carpeta
      const createResponse = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: ALBUM_FOLDER_NAME,
          mimeType: "application/vnd.google-apps.folder",
        }),
      })

      if (!createResponse.ok) {
        throw new Error(`Failed to create folder: ${createResponse.statusText}`)
      }

      const createData = await createResponse.json()
      driveFolderId = createData.id
      document.getElementById("google-drive-status").classList.add("connected")
      console.log("[v0] Created new folder:", driveFolderId)
    }
  } catch (error) {
    console.error("[v0] Error initializing Drive folder:", error)
    document.getElementById("google-drive-status").classList.remove("connected")
    alert("Error al conectar con Google Drive: " + error.message)
  }
}

async function uploadToGoogleDrive(file, folderPath) {
  try {
    if (!googleAccessToken) {
      alert("Por favor conecta tu cuenta de Google primero")
      return null
    }

    console.log("[v0] Starting upload:", file.name, "Path:", folderPath)

    // Crear ruta de carpetas si es necesaria
    let currentFolderId = driveFolderId
    for (const folderName of folderPath) {
      currentFolderId = await getOrCreateSubfolder(currentFolderId, folderName)
    }

    console.log(`[v0] Uploading ${file.name} to Drive folder ${currentFolderId}`)

    // Preparar metadata
    const metadata = {
      name: file.name,
      parents: [currentFolderId],
    }

    // Crear form data
    const formData = new FormData()
    formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }))
    formData.append("file", file)

    // Subir a Google Drive
    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
        body: formData,
      },
    )

    const data = await response.json()
    console.log("[v0] Upload response:", data)

    if (!response.ok) {
      throw new Error(data.error?.message || "Error al subir a Drive")
    }

    // Generar URL pública
    const fileId = data.id
    const publicUrl = `https://drive.google.com/uc?id=${fileId}&export=download`

    console.log(`[v0] File uploaded: ${fileId} - URL: ${publicUrl}`)

    return {
      id: fileId,
      url: publicUrl,
      name: file.name,
    }
  } catch (error) {
    console.error("[v0] Error uploading to Drive:", error)
    throw error
  }
}

async function getOrCreateSubfolder(parentFolderId, folderName) {
  try {
    // Buscar subcarpeta existente
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&spaces=drive&pageSize=1`,
      {
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
      },
    )

    const data = await response.json()

    if (data.files && data.files.length > 0) {
      return data.files[0].id
    } else {
      // Crear subcarpeta
      const createResponse = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentFolderId],
        }),
      })

      const createData = await createResponse.json()
      return createData.id
    }
  } catch (error) {
    console.error("[v0] Error in getOrCreateSubfolder:", error)
    throw error
  }
}

async function deleteFromGoogleDrive(fileId) {
  try {
    if (!googleAccessToken) return

    console.log("[v0] Deleting file from Drive:", fileId)

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
      },
    })

    if (!response.ok && response.status !== 204) {
      throw new Error("Error al eliminar archivo de Drive")
    }

    console.log("[v0] File deleted from Drive:", fileId)
  } catch (error) {
    console.error("[v0] Error deleting from Drive:", error)
  }
}

const coverInput = document.getElementById("cover-input")
const coverPreview = document.getElementById("cover-preview")
const deleteCoverBtn = document.getElementById("delete-cover-btn")

coverInput.addEventListener("change", async (e) => {
  const file = e.target.files[0]
  if (!file) return

  if (!file.type.match(/^image\/(jpeg|jpg|png|gif|webp)$/i)) {
    alert("Por favor selecciona un archivo de imagen válido (JPG, PNG, GIF, WEBP)")
    return
  }

  if (!googleAccessToken) {
    alert("Por favor conecta tu cuenta de Google primero")
    return
  }

  console.log(
    "[v0] Uploading cover image to Google Drive:",
    file.name,
    "Size:",
    (file.size / 1024 / 1024).toFixed(2),
    "MB",
  )

  try {
    // Show preview
    const reader = new FileReader()
    reader.onload = (e) => {
      coverPreview.innerHTML = `<img src="${e.target.result}" alt="Cover">`
    }
    reader.readAsDataURL(file)

    // Upload to Drive
    const driveFile = await uploadToGoogleDrive(file, ["cover"])

    // Save to Firestore
    await setDoc(doc(window.db, "settings", "cover"), {
      url: driveFile.url,
      driveId: driveFile.id,
      updatedAt: new Date(),
    })

    console.log("[v0] Cover uploaded successfully!")
    deleteCoverBtn.classList.remove("hidden")
    alert("Portada actualizada exitosamente")
  } catch (error) {
    console.error("[v0] Error uploading cover:", error)
    alert("Error al subir la portada: " + error.message)
    coverPreview.innerHTML = '<span class="cover-placeholder">Sin portada</span>'
  }
})

deleteCoverBtn.addEventListener("click", async () => {
  if (!confirm("¿Estás seguro de eliminar la portada?")) return

  try {
    const coverDoc = await getDoc(doc(window.db, "settings", "cover"))
    if (coverDoc.exists() && coverDoc.data().driveId) {
      await deleteFromGoogleDrive(coverDoc.data().driveId)
    }

    await deleteDoc(doc(window.db, "settings", "cover"))
    coverPreview.innerHTML = '<span class="cover-placeholder">Sin portada</span>'
    deleteCoverBtn.classList.add("hidden")
    alert("Portada eliminada")
  } catch (error) {
    console.error("[v0] Error deleting cover:", error)
    alert("Error al eliminar la portada")
  }
})

async function loadCover() {
  try {
    console.log("[v0] Loading cover...")
    const coverDoc = await getDoc(doc(window.db, "settings", "cover"))
    if (coverDoc.exists() && coverDoc.data().url) {
      coverPreview.innerHTML = `<img src="${coverDoc.data().url}" alt="Cover">`
      deleteCoverBtn.classList.remove("hidden")
      console.log("[v0] Cover loaded successfully")
    } else {
      console.log("[v0] No cover found")
    }
  } catch (error) {
    console.error("[v0] Error loading cover:", error)
  }
}

const albumNameInput = document.getElementById("album-name-input")
const createAlbumBtn = document.getElementById("create-album-btn")
const albumsList = document.getElementById("albums-list")
const albumSelect = document.getElementById("album-select")
const filterAlbumSelect = document.getElementById("filter-album-select")

createAlbumBtn.addEventListener("click", async () => {
  const name = albumNameInput.value.trim()
  if (!name) {
    alert("Por favor ingresa un nombre para el momento")
    return
  }

  console.log("[v0] Creating album:", name)

  try {
    const docRef = await addDoc(collection(window.db, "albums"), {
      name: name,
      createdAt: new Date(),
    })

    console.log("[v0] Album created with ID:", docRef.id)
    albumNameInput.value = ""
    await loadAlbums()
    alert("Momento creado exitosamente")
  } catch (error) {
    console.error("[v0] Error creating album:", error)
    alert("Error al crear el momento: " + error.message)
  }
})

async function loadAlbums() {
  try {
    console.log("[v0] Loading albums...")
    const albumsSnapshot = await getDocs(collection(window.db, "albums"))
    console.log("[v0] Albums found:", albumsSnapshot.size)

    if (albumsSnapshot.empty) {
      albumsList.innerHTML = '<div class="loading">No hay momentos creados</div>'
      albumSelect.innerHTML = '<option value="">Selecciona un momento</option>'
      filterAlbumSelect.innerHTML = '<option value="">Todos los momentos</option>'
      return
    }

    albumsList.innerHTML = ""
    albumSelect.innerHTML = '<option value="">Selecciona un momento</option>'
    filterAlbumSelect.innerHTML = '<option value="">Todos los momentos</option>'

    for (const albumDoc of albumsSnapshot.docs) {
      const album = albumDoc.data()
      const albumId = albumDoc.id

      const photosSnapshot = await getDocs(collection(window.db, "photos"))
      const photoCount = photosSnapshot.docs.filter((doc) => doc.data().albumId === albumId).length

      const albumItem = document.createElement("div")
      albumItem.className = "album-item"
      albumItem.innerHTML = `
                <div>
                    <span class="album-item-name">${album.name}</span>
                    <span class="album-item-count">(${photoCount} fotos)</span>
                </div>
                <button class="delete-btn" data-album-id="${albumId}">Eliminar</button>
            `
      albumsList.appendChild(albumItem)

      const option1 = document.createElement("option")
      option1.value = albumId
      option1.textContent = album.name
      albumSelect.appendChild(option1)

      const option2 = document.createElement("option")
      option2.value = albumId
      option2.textContent = album.name
      filterAlbumSelect.appendChild(option2)
    }

    document.querySelectorAll(".album-item .delete-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const albumId = e.target.dataset.albumId
        if (!confirm("¿Estás seguro? Esto eliminará el momento y todas sus fotos.")) return

        try {
          const photosSnapshot = await getDocs(collection(window.db, "photos"))
          const albumPhotos = photosSnapshot.docs.filter((doc) => doc.data().albumId === albumId)

          for (const photoDoc of albumPhotos) {
            const photoData = photoDoc.data()
            if (photoData.driveId) {
              await deleteFromGoogleDrive(photoData.driveId)
            }
            await deleteDoc(doc(window.db, "photos", photoDoc.id))
          }

          await deleteDoc(doc(window.db, "albums", albumId))
          await loadAlbums()
          await loadPhotos()
          alert("Momento eliminado")
        } catch (error) {
          console.error("[v0] Error deleting album:", error)
          alert("Error al eliminar el momento")
        }
      })
    })

    console.log("[v0] Albums loaded successfully")
  } catch (error) {
    console.error("[v0] Error loading albums:", error)
    albumsList.innerHTML = '<div class="loading">Error cargando momentos: ' + error.message + "</div>"
  }
}

const photosInput = document.getElementById("photos-input")
const uploadArea = document.getElementById("upload-area")
const previewGrid = document.getElementById("preview-grid")
const uploadProgress = document.getElementById("upload-progress")

photosInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files)
  const albumId = albumSelect.value

  if (!albumId) {
    alert("Por favor selecciona un momento primero")
    return
  }

  if (!googleAccessToken) {
    alert("Por favor conecta tu cuenta de Google primero")
    return
  }

  if (files.length === 0) return

  const validFiles = files.filter((file) => {
    const isValid = file.type.match(/^image\/(jpeg|jpg|png|gif|webp)$/i)
    if (!isValid) {
      console.warn("[v0] Skipping invalid file:", file.name, file.type)
    }
    return isValid
  })

  if (validFiles.length === 0) {
    alert("No se encontraron archivos de imagen válidos (JPG, PNG, GIF, WEBP)")
    return
  }

  console.log("[v0] Uploading", validFiles.length, "photos to Google Drive")

  previewGrid.innerHTML = ""
  validFiles.forEach((file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const div = document.createElement("div")
      div.className = "preview-item"
      div.innerHTML = `<img src="${e.target.result}" alt="Preview">`
      previewGrid.appendChild(div)
    }
    reader.readAsDataURL(file)
  })

  uploadProgress.classList.remove("hidden")
  const progressFill = uploadProgress.querySelector(".progress-fill")
  const progressText = uploadProgress.querySelector(".progress-text")

  let successCount = 0
  let failCount = 0

  try {
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      const progress = ((i + 1) / validFiles.length) * 100
      progressFill.style.width = `${progress}%`
      progressText.textContent = `Subiendo ${i + 1} de ${validFiles.length} fotos...`

      console.log(
        `[v0] Uploading photo ${i + 1}/${validFiles.length}:`,
        file.name,
        "Size:",
        (file.size / 1024 / 1024).toFixed(2),
        "MB",
      )

      try {
        const driveFile = await uploadToGoogleDrive(file, [albumId])

        await addDoc(collection(window.db, "photos"), {
          url: driveFile.url,
          driveId: driveFile.id,
          albumId: albumId,
          uploadedAt: new Date(),
        })

        successCount++
      } catch (photoError) {
        console.error(`[v0] Failed to upload photo ${i + 1}:`, photoError)
        failCount++
      }
    }

    if (failCount > 0) {
      progressText.textContent = `${successCount} fotos subidas, ${failCount} fallaron`
    } else {
      progressText.textContent = `${successCount} fotos subidas exitosamente`
    }
    console.log(`[v0] Upload complete: ${successCount} succeeded, ${failCount} failed`)

    setTimeout(() => {
      uploadProgress.classList.add("hidden")
      previewGrid.innerHTML = ""
      photosInput.value = ""
    }, 3000)

    await loadPhotos()
    await loadAlbums()
  } catch (error) {
    console.error("[v0] Error uploading photos:", error)
    alert("Error al subir las fotos: " + error.message)
    uploadProgress.classList.add("hidden")
  }
})

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault()
  uploadArea.classList.add("dragover")
})

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover")
})

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault()
  uploadArea.classList.remove("dragover")

  const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith("image/"))
  if (files.length > 0) {
    const dataTransfer = new DataTransfer()
    files.forEach((file) => dataTransfer.items.add(file))
    photosInput.files = dataTransfer.files
    photosInput.dispatchEvent(new Event("change"))
  }
})

const photosList = document.getElementById("photos-list")

filterAlbumSelect.addEventListener("change", loadPhotos)

async function loadPhotos() {
  const filterAlbumId = filterAlbumSelect.value

  try {
    console.log("[v0] Loading photos, filter:", filterAlbumId || "all")
    const photosSnapshot = await getDocs(collection(window.db, "photos"))
    console.log("[v0] Photos found:", photosSnapshot.size)

    let photos = photosSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    if (filterAlbumId) {
      photos = photos.filter((photo) => photo.albumId === filterAlbumId)
    }

    if (photos.length === 0) {
      photosList.innerHTML = '<div class="loading">No hay fotos subidas</div>'
      return
    }

    photosList.innerHTML = ""

    photos.forEach((photo) => {
      const photoItem = document.createElement("div")
      photoItem.className = "photo-item"
      photoItem.innerHTML = `
                <img src="${photo.url}" alt="Photo">
                <div class="photo-item-overlay">
                    <button class="photo-delete-btn" data-photo-id="${photo.id}" data-drive-id="${photo.driveId}">Eliminar</button>
                </div>
            `
      photosList.appendChild(photoItem)
    })

    document.querySelectorAll(".photo-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const photoId = e.target.dataset.photoId
        const driveId = e.target.dataset.driveId

        if (!confirm("¿Estás seguro de eliminar esta foto?")) return

        try {
          if (driveId) {
            await deleteFromGoogleDrive(driveId)
          }

          await deleteDoc(doc(window.db, "photos", photoId))

          await loadPhotos()
          await loadAlbums()
          alert("Foto eliminada")
        } catch (error) {
          console.error("[v0] Error deleting photo:", error)
          alert("Error al eliminar la foto")
        }
      })
    })

    console.log("[v0] Photos loaded successfully")
  } catch (error) {
    console.error("[v0] Error loading photos:", error)
    photosList.innerHTML = '<div class="loading">Error cargando fotos: ' + error.message + "</div>"
  }
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("[v0] Admin panel initializing...")
  console.log("[v0] Firestore instance:", window.db)

  initializeGoogleAuth()

  loadCover()
  loadAlbums()
  loadPhotos()
})
