import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js"

let currentAlbum = null
let currentPhotoIndex = 0
let currentPhotos = []

document.getElementById("view-album-btn").addEventListener("click", () => {
  document.getElementById("landing-section").style.display = "none"
  document.getElementById("main-content").classList.remove("hidden")
  loadCoverImage()
})

async function loadCoverImage() {
  try {
    const coverDoc = await getDoc(doc(window.db, "settings", "cover"))
    if (coverDoc.exists() && coverDoc.data().url) {
      const landingSection = document.getElementById("landing-section")
      landingSection.style.backgroundImage = `url(${coverDoc.data().url})`
    }
  } catch (error) {
    console.error("[v0] Error loading cover:", error)
  }
}

async function loadAlbums() {
  const albumsGrid = document.getElementById("albums-grid")

  try {
    const albumsSnapshot = await getDocs(collection(window.db, "albums"))

    if (albumsSnapshot.empty) {
      albumsGrid.innerHTML = '<div class="loading">No hay momentos creados aún</div>'
      return
    }

    albumsGrid.innerHTML = ""

    for (const albumDoc of albumsSnapshot.docs) {
      const album = albumDoc.data()
      const albumId = albumDoc.id

      // Get photos count
      const photosSnapshot = await getDocs(collection(window.db, "photos"))
      const albumPhotos = photosSnapshot.docs.filter((doc) => doc.data().albumId === albumId)
      const photoCount = albumPhotos.length

      // Get first photo as thumbnail
      let thumbnailUrl = "/wedding-moment-elegant.jpg"
      if (albumPhotos.length > 0) {
        thumbnailUrl = albumPhotos[0].data().url
      }

      const albumCard = document.createElement("div")
      albumCard.className = "album-card"
      albumCard.innerHTML = `
                <img src="${thumbnailUrl}" alt="${album.name}" class="album-card-bg">
                <div class="album-card-overlay">
                    <h3 class="album-card-title">${album.name}</h3>
                    <p class="album-card-count">${photoCount} fotos</p>
                </div>
            `

      albumCard.addEventListener("click", () => openAlbum(albumId, album.name))
      albumsGrid.appendChild(albumCard)
    }
  } catch (error) {
    console.error("[v0] Error loading albums:", error)
    albumsGrid.innerHTML = '<div class="loading">Error cargando momentos</div>'
  }
}

async function openAlbum(albumId, albumName) {
  currentAlbum = albumId

  document.querySelector(".section:first-of-type").classList.add("hidden")
  document.getElementById("gallery-section").classList.remove("hidden")
  document.getElementById("gallery-title").textContent = albumName

  await loadAlbumPhotos(albumId)
}

async function loadAlbumPhotos(albumId) {
  const galleryGrid = document.getElementById("gallery-grid")
  galleryGrid.innerHTML = '<div class="loading">Cargando fotos...</div>'

  try {
    const photosSnapshot = await getDocs(collection(window.db, "photos"))
    const albumPhotos = photosSnapshot.docs.filter((doc) => doc.data().albumId === albumId).map((doc) => doc.data())

    if (albumPhotos.length === 0) {
      galleryGrid.innerHTML = '<div class="loading">Este momento aún no tiene fotos</div>'
      return
    }

    currentPhotos = albumPhotos
    galleryGrid.innerHTML = ""

    albumPhotos.forEach((photo, index) => {
      const item = document.createElement("div")
      item.className = "gallery-item"
      const optimizedUrl = photo.url.replace("/upload/", "/upload/w_400,c_limit,q_auto:good/")
      item.innerHTML = `<img src="${optimizedUrl}" alt="Foto ${index + 1}" class="gallery-item-img" loading="lazy">`
      item.addEventListener("click", () => openLightbox(index))
      galleryGrid.appendChild(item)
    })
  } catch (error) {
    console.error("[v0] Error loading photos:", error)
    galleryGrid.innerHTML = '<div class="loading">Error cargando fotos</div>'
  }
}

// Back button
document.getElementById("back-btn").addEventListener("click", () => {
  document.getElementById("gallery-section").classList.add("hidden")
  document.querySelector(".section:first-of-type").classList.remove("hidden")
  currentAlbum = null
})

// Lightbox functionality
function openLightbox(index) {
  currentPhotoIndex = index
  updateLightbox()
  document.getElementById("lightbox").classList.remove("hidden")
}

function closeLightbox() {
  document.getElementById("lightbox").classList.add("hidden")
}

function updateLightbox() {
  const lightbox = document.getElementById("lightbox")
  const img = lightbox.querySelector(".lightbox-img")
  const counter = lightbox.querySelector(".lightbox-counter")

  img.src = currentPhotos[currentPhotoIndex].url
  counter.textContent = `${currentPhotoIndex + 1} / ${currentPhotos.length}`
}

function nextPhoto() {
  currentPhotoIndex = (currentPhotoIndex + 1) % currentPhotos.length
  updateLightbox()
}

function prevPhoto() {
  currentPhotoIndex = (currentPhotoIndex - 1 + currentPhotos.length) % currentPhotos.length
  updateLightbox()
}

// Lightbox controls
document.querySelector(".lightbox-close").addEventListener("click", closeLightbox)
document.querySelector(".lightbox-next").addEventListener("click", nextPhoto)
document.querySelector(".lightbox-prev").addEventListener("click", prevPhoto)

// Keyboard navigation
document.addEventListener("keydown", (e) => {
  const lightbox = document.getElementById("lightbox")
  if (!lightbox.classList.contains("hidden")) {
    if (e.key === "Escape") closeLightbox()
    if (e.key === "ArrowRight") nextPhoto()
    if (e.key === "ArrowLeft") prevPhoto()
  }
})

const downloadBtn = document.querySelector(".lightbox-download")
if (downloadBtn) {
  downloadBtn.addEventListener("click", async () => {
    const currentUrl = currentPhotos[currentPhotoIndex].url
    try {
      // Fetch image and download
      const response = await fetch(currentUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `foto-boda-${currentPhotoIndex + 1}.jpg`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("[v0] Error downloading photo:", error)
      // Fallback: open in new tab
      window.open(currentUrl, "_blank")
    }
  })
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("[v0] Public site initializing...")
  loadCoverImage()
  loadAlbums()
})
