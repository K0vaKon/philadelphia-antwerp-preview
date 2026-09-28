const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".main-nav");
const adminContent = document.querySelector("#admin-content");
const loginScreen = document.querySelector("#login-screen");
const loginForm = document.querySelector("#login-form");
const logoutButton = document.querySelector("#logout-button");
const adminSessionKey = "philadelphia-admin-auth";
const adminNavigationKey = "philadelphia-admin-navigation";
const adminPassword = "admin";
const adminTabs = document.querySelector("[data-admin-tabs]");
const adminTabStorageKey = "philadelphia-admin-active-tab";

if (adminTabs) {
  const tabs = [...adminTabs.querySelectorAll("[data-admin-tab]")];
  const panels = [...document.querySelectorAll("[data-admin-panel]")];
  const activateTab = (tab, focus = false, scrollToPanel = false) => {
    const panelId = tab.dataset.adminTab;
    const selectedPanel = panels.find((panel) => panel.id === panelId);
    if (!selectedPanel) {
      throw new Error(`Не найден раздел админки: ${panelId}`);
    }

    tabs.forEach((item) => {
      const isActive = item === tab;
      item.setAttribute("aria-selected", String(isActive));
      item.tabIndex = isActive ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.id !== panelId; });
    sessionStorage.setItem(adminTabStorageKey, panelId);
    if (focus) tab.focus();
    if (scrollToPanel) {
      const panelTop = selectedPanel.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, panelTop - adminTabs.offsetHeight - 16), behavior: "instant" });
    }
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab, false, true));
    tab.addEventListener("keydown", (event) => {
      let nextIndex;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex !== undefined) {
        event.preventDefault();
        activateTab(tabs[nextIndex], true, true);
      }
    });
  });

  const savedPanelId = sessionStorage.getItem(adminTabStorageKey);
  const initialTab = tabs.find((tab) => tab.dataset.adminTab === savedPanelId) || tabs.find((tab) => tab.getAttribute("aria-selected") === "true");
  if (initialTab) activateTab(initialTab);
}

const showAdmin = () => {
  if (adminContent) adminContent.hidden = false;
  if (loginScreen) loginScreen.hidden = true;
  if (logoutButton) logoutButton.hidden = false;
};

const readRecords = (storageKey) => {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

if (adminContent && loginScreen) {
  sessionStorage.removeItem(adminNavigationKey);
  if (sessionStorage.getItem(adminSessionKey) === "true") {
    showAdmin();
  } else {
    adminContent.hidden = true;
    loginScreen.hidden = false;
    if (logoutButton) logoutButton.hidden = true;
  }
}

if (loginForm) {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const passwordInput = document.querySelector("#admin-password");
    const error = document.querySelector("#login-error");
    if (passwordInput.value === adminPassword) {
      sessionStorage.setItem(adminSessionKey, "true");
      showAdmin();
      return;
    }
    error.textContent = "Неверный пароль. Попробуйте ещё раз.";
    passwordInput.select();
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    sessionStorage.removeItem(adminSessionKey);
    window.location.reload();
  });
}

if (adminContent && loginScreen) {
  window.addEventListener("pagehide", () => {
    if (sessionStorage.getItem(adminNavigationKey) !== "true") {
      sessionStorage.removeItem(adminSessionKey);
    }
    sessionStorage.removeItem(adminNavigationKey);
  });

  document.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", () => {
      const destination = link.getAttribute("href");
      if (destination && !destination.startsWith("#")) {
        const destinationPage = new URL(destination, window.location.href).pathname.split("/").pop();
        if (destinationPage === "admin.html" || destinationPage === "gallery-admin.html") {
          sessionStorage.setItem(adminNavigationKey, "true");
          return;
        }
        sessionStorage.removeItem(adminSessionKey);
      }
    });
  });
}

if (menuButton && navigation) {
  menuButton.addEventListener("click", () => {
    const isOpen = navigation.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.textContent = isOpen ? "×" : "☰";
  });

  navigation.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navigation.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.textContent = "☰";
    });
  });
}

const videosContainer = document.querySelector("#latest-videos");
const channelId = "UCarf1uXs7OfnPYr9Oc0J8Cw";
const feedUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`)}`;

if (videosContainer) {
  fetch(feedUrl)
    .then((response) => {
      if (!response.ok) throw new Error("Не удалось загрузить видео");
      return response.json();
    })
    .then((data) => {
      if (data.status !== "ok" || !Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("Видео не найдены");
      }

      videosContainer.innerHTML = data.items.slice(0, 3).map((video) => {
        const videoId = video.guid.replace("yt:video:", "");
        const publishedDate = new Date(video.pubDate).toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        return `<article class="video-card">
          <a class="video-thumb" href="${video.link}" target="_blank" rel="noreferrer">
            <img src="https://i.ytimg.com/vi/${videoId}/hqdefault.jpg" alt="${video.title}" loading="lazy" />
            <span class="video-play">▶</span>
          </a>
          <div class="video-info"><p>${publishedDate}</p><h3>${video.title}</h3><a href="${video.link}" target="_blank" rel="noreferrer">Смотреть видео <span>↗</span></a></div>
        </article>`;
      }).join("");
    })
    .catch(() => {
      videosContainer.innerHTML = `<p class="video-status">Видео временно недоступны. <a href="https://www.youtube.com/@Church_P" target="_blank" rel="noreferrer">Открыть канал на YouTube ↗</a></p>`;
    });
}

const eventsList = document.querySelector("#events-list");
const adminEventsList = document.querySelector("#admin-events-list");
const eventForm = document.querySelector("#event-form");
const eventStorageKey = "philadelphia-events";
const leadersPageList = document.querySelector("#leaders-page-list");
const adminLeadersList = document.querySelector("#admin-leaders-list");
const leaderForm = document.querySelector("#leader-form");
const leaderStorageKey = "philadelphia-leaders";
const homeGroupsList = document.querySelector("#home-groups-list");
const homeGroupsPreviewList = document.querySelector("#home-groups-preview");
const adminHomeGroupsList = document.querySelector("#admin-home-groups-list");
const homeGroupForm = document.querySelector("#home-group-form");
const homeGroupStorageKey = "philadelphia-home-groups";
const presbytersList = document.querySelector("#presbyters-list");
const adminPresbytersList = document.querySelector("#admin-presbyters-list");
const presbyterForm = document.querySelector("#presbyter-form");
const presbyterStorageKey = "philadelphia-presbyters";
const galleryList = document.querySelector("#gallery-list");
const galleryForm = document.querySelector("#gallery-form");
const adminGalleryList = document.querySelector("#admin-gallery-list");
const galleryCount = document.querySelector("#gallery-count");
const galleryFormMessage = document.querySelector("#gallery-form-message");
const galleryLoadMoreButton = document.querySelector("#gallery-load-more");
const galleryStorageKey = "philadelphia-gallery";
const contentLanguages = ["nl", "en"];
const galleryBatchSize = 12;
let galleryPhotos = [];
let galleryRenderedCount = 0;
const exportBackupButton = document.querySelector("#export-backup");
const importBackupInput = document.querySelector("#import-backup");
const backupMessage = document.querySelector("#backup-message");
const backupVersion = 1;
const maxBackupSize = 15 * 1024 * 1024;
const maxImageUploadSize = 15 * 1024 * 1024;
const maxImageDimension = 1600;
const maxStoredImageSize = 3 * 1024 * 1024;

const isSafeImage = (value) => typeof value === "string" && (value === "" || value.startsWith("data:image/") || /^https:\/\/[^\s]+$/i.test(value));

const prepareUploadedImage = async (value) => {
  if (!(value instanceof File) || value.size === 0) return "";
  if (!value.type.startsWith("image/")) {
    throw new Error("Выберите файл изображения (например, JPEG, PNG или WebP).");
  }
  if (value.size > maxImageUploadSize) {
    throw new Error("Размер фото превышает 15 МБ. Уменьшите файл и попробуйте снова.");
  }

  const objectUrl = URL.createObjectURL(value);
  try {
    const image = new Image();
    image.src = objectUrl;
    try {
      await image.decode();
    } catch {
      throw new Error("Формат фото не поддерживается или файл повреждён. Попробуйте JPEG, PNG или WebP.");
    }

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("Не удалось прочитать изображение. Выберите другой файл.");
    }

    const scale = Math.min(1, maxImageDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Браузер не смог обработать изображение.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const optimizedImage = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Не удалось обработать изображение.")),
        "image/jpeg",
        0.82,
      );
    });

    if (optimizedImage.size > maxStoredImageSize) {
      throw new Error("Фото слишком большое даже после оптимизации. Выберите изображение поменьше.");
    }

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Не удалось подготовить фото для сохранения."));
      });
      reader.addEventListener("error", () => reject(new Error("Не удалось прочитать фото. Попробуйте другой файл.")));
      reader.readAsDataURL(optimizedImage);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const saveAdminRecord = (storageKey, record, messageElement, successMessage, render) => {
  const previousValue = localStorage.getItem(storageKey);
  try {
    const records = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(records)) throw new Error("Сохранённые данные повреждены. Сначала скачайте резервную копию.");
    localStorage.setItem(storageKey, JSON.stringify([record, ...records]));
  } catch (error) {
    const isStorageFull = error instanceof DOMException
      && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
    messageElement.textContent = isStorageFull
      ? "Не удалось сохранить: в браузере закончилось место. Удалите старые события, фотографии или лидеров либо освободите место и попробуйте снова."
      : `Не удалось сохранить: ${error instanceof Error ? error.message : "неизвестная ошибка браузера."}`;
    messageElement.classList.add("form-message-error");
    return false;
  }

  try {
    render();
  } catch (error) {
    if (previousValue === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, previousValue);
    messageElement.textContent = `Не удалось отобразить сохранённую запись: ${error instanceof Error ? error.message : "неизвестная ошибка."}`;
    messageElement.classList.add("form-message-error");
    return false;
  }
  messageElement.classList.remove("form-message-error");
  messageElement.textContent = successMessage;
  return true;
};

const normalizeBackupItems = (items, type) => {
  if (!Array.isArray(items) || items.length > 500) throw new Error(`Некорректные данные ${type}.`);
  return items.map((item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.title !== "string") throw new Error(`Некорректная запись ${type}.`);
    const normalized = { ...item };
    ["id", "title", "tag", "description", "date", "time", "image"].forEach((key) => {
      if (normalized[key] !== undefined && typeof normalized[key] !== "string") throw new Error(`Некорректное поле ${key}.`);
      if (typeof normalized[key] === "string" && normalized[key].length > 1000000) throw new Error("Слишком большое текстовое поле.");
    });
    if (!isSafeImage(normalized.image || "")) throw new Error("Разрешены только изображения и безопасные HTTPS-ссылки.");
    return normalized;
  });
};

const normalizeGalleryBackupItems = (items) => {
  if (items === undefined) return [];
  if (!Array.isArray(items) || items.length > 500) throw new Error("Некорректные данные галереи.");
  return items.map((photo) => {
    if (!photo || typeof photo !== "object" || typeof photo.id !== "string" || typeof photo.createdAt !== "string") {
      throw new Error("Некорректная запись галереи.");
    }
    if (photo.id.length > 200 || photo.createdAt.length > 50 || !isSafeImage(photo.image)) {
      throw new Error("Некорректная фотография в резервной копии.");
    }
    if (Number.isNaN(Date.parse(photo.createdAt))) throw new Error("Некорректная дата фотографии в резервной копии.");
    return { id: photo.id, createdAt: photo.createdAt, image: photo.image };
  });
};

const normalizeDirectoryBackupItems = (items, type, storageKey) => {
  if (items === undefined) return readRecords(storageKey);
  return normalizeBackupItems(items, type);
};

const createBackup = () => JSON.stringify({
  format: "philadelphia-site-backup",
  version: backupVersion,
  exportedAt: new Date().toISOString(),
  events: readEvents(),
  leaders: readLeaders(),
  homeGroups: readRecords(homeGroupStorageKey),
  presbyters: readRecords(presbyterStorageKey),
  gallery: readGalleryPhotos(),
}, null, 2);

const downloadBackup = (automatic = false) => {
  const blob = new Blob([createBackup()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `philadelphia-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  if (!automatic && backupMessage) backupMessage.textContent = "Резервная копия скачана.";
};


const readEvents = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(eventStorageKey) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const readLeaders = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(leaderStorageKey) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const readGalleryPhotos = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(galleryStorageKey) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const renderGallery = () => {
  if (galleryList) {
    galleryPhotos = readGalleryPhotos().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    galleryRenderedCount = 0;
    galleryList.replaceChildren();

    if (galleryPhotos.length) {
      renderNextGalleryBatch();
    } else {
      galleryList.innerHTML = '<p class="gallery-empty">Пока в галерее нет фотографий.</p>';
      if (galleryLoadMoreButton) galleryLoadMoreButton.hidden = true;
    }
  }

  if (adminGalleryList) {
    const photos = readGalleryPhotos().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const language = localStorage.getItem("philadelphia-language") || "ru";
    const photoLabel = language === "nl" ? "foto's" : language === "en" ? "photos" : "фото";
    if (galleryCount) galleryCount.textContent = `${photos.length} ${photoLabel}`;
    adminGalleryList.innerHTML = photos.length
      ? photos.map((photo) => {
        const locale = language === "nl" ? "nl-BE" : language === "en" ? "en-GB" : "ru-RU";
        const date = new Date(photo.createdAt).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
        return `<article class="admin-event admin-gallery-photo"><img src="${escapeHtml(photo.image)}" alt="Предпросмотр фотографии" loading="lazy" /><div><strong>Фотография</strong><span><span>Добавлена</span> ${date}</span></div><button type="button" data-delete-gallery-photo="${escapeHtml(photo.id)}">Удалить</button></article>`;
      }).join("")
      : "<p>Пока нет добавленных фотографий.</p>";

    adminGalleryList.querySelectorAll("[data-delete-gallery-photo]").forEach((button) => {
      button.addEventListener("click", () => {
        localStorage.setItem(galleryStorageKey, JSON.stringify(readGalleryPhotos().filter((photo) => photo.id !== button.dataset.deleteGalleryPhoto)));
        renderGallery();
      });
    });
  }
};

const renderNextGalleryBatch = () => {
  if (!galleryList) return;

  const nextPhotos = galleryPhotos.slice(galleryRenderedCount, galleryRenderedCount + galleryBatchSize);
  const items = nextPhotos.map((photo) => {
    const figure = document.createElement("figure");
    figure.className = "gallery-photo";
    const image = document.createElement("img");
    image.src = photo.image;
    image.alt = "Фотография из жизни церкви";
    image.tabIndex = 0;
    image.draggable = false;
    image.loading = "lazy";
    image.decoding = "async";
    figure.append(image);
    const menu = document.createElement("div");
    menu.className = "gallery-photo-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", getDynamicLabel("photoActions"));
    menu.hidden = true;
    [["download", "downloadPhoto"], ["share", "sharePhoto"]].forEach(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gallery-photo-menu-button";
      button.dataset.photoAction = action;
      button.setAttribute("role", "menuitem");
      const icon = document.createElement("span");
      icon.className = "gallery-photo-action-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = action === "download" ? "↓" : "↗";
      const text = document.createElement("span");
      text.className = "gallery-photo-action-label";
      text.textContent = getDynamicLabel(label);
      button.append(icon, text);
      menu.append(button);
    });
    figure.append(menu);
    return figure;
  });
  galleryList.append(...items);
  galleryRenderedCount += nextPhotos.length;

  if (galleryLoadMoreButton) {
    galleryLoadMoreButton.hidden = galleryRenderedCount >= galleryPhotos.length;
  }
};

const galleryLoadObserver = galleryLoadMoreButton && "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) renderNextGalleryBatch();
  }, { rootMargin: "500px 0px" })
  : null;

if (galleryLoadObserver && galleryLoadMoreButton) {
  galleryLoadObserver.observe(galleryLoadMoreButton);
}

if (galleryLoadMoreButton) {
  galleryLoadMoreButton.addEventListener("click", renderNextGalleryBatch);
}

const getCurrentLanguage = () => {
  const language = localStorage.getItem("philadelphia-language");
  return ["ru", "nl", "en"].includes(language) ? language : "ru";
};

const getLocalizedRecordField = (record, field) => {
  const language = getCurrentLanguage();
  return language === "ru"
    ? record[field] || ""
    : record.translations?.[language]?.[field] || record[field] || "";
};

const getDynamicLabel = (key) => {
  const language = getCurrentLanguage();
  const labels = {
    service: { ru: "Служение", nl: "Bediening", en: "Ministry" },
    homeGroup: { ru: "Домашняя группа", nl: "Huiskring", en: "Home group" },
    leader: { ru: "Лидер", nl: "Leider", en: "Leader" },
    location: { ru: "Место/район", nl: "Locatie/buurt", en: "Location/area" },
    dayOfWeek: { ru: "День недели", nl: "Dag van de week", en: "Day of the week" },
    selectDay: { ru: "Выберите день", nl: "Kies een dag", en: "Select a day" },
    monday: { ru: "Понедельник", nl: "Maandag", en: "Monday" },
    tuesday: { ru: "Вторник", nl: "Dinsdag", en: "Tuesday" },
    wednesday: { ru: "Среда", nl: "Woensdag", en: "Wednesday" },
    thursday: { ru: "Четверг", nl: "Donderdag", en: "Thursday" },
    friday: { ru: "Пятница", nl: "Vrijdag", en: "Friday" },
    saturday: { ru: "Суббота", nl: "Zaterdag", en: "Saturday" },
    sunday: { ru: "Воскресенье", nl: "Zondag", en: "Sunday" },
    presbyter: { ru: "Пресвитер", nl: "Ouderling", en: "Presbyter" },
    event: { ru: "Событие", nl: "Evenement", en: "Event" },
    remove: { ru: "Удалить", nl: "Verwijderen", en: "Delete" },
    moveUp: { ru: "Переместить выше", nl: "Omhoog verplaatsen", en: "Move up" },
    moveDown: { ru: "Переместить ниже", nl: "Omlaag verplaatsen", en: "Move down" },
    photoActions: { ru: "Действия с фотографией", nl: "Acties voor foto", en: "Photo actions" },
    downloadPhoto: { ru: "Скачать фото", nl: "Foto downloaden", en: "Download photo" },
    sharePhoto: { ru: "Поделиться фото", nl: "Foto delen", en: "Share photo" },
    photoDownloaded: { ru: "Фото скачивается.", nl: "De foto wordt gedownload.", en: "Photo download started." },
    photoShared: { ru: "Фото отправлено.", nl: "De foto is gedeeld.", en: "Photo shared." },
    photoLinkCopied: { ru: "Ссылка на фото скопирована.", nl: "De fotolink is gekopieerd.", en: "Photo link copied." },
    photoDownloadFailed: { ru: "Не удалось скачать фото.", nl: "De foto kon niet worden gedownload.", en: "Could not download the photo." },
    photoShareFailed: { ru: "Не удалось поделиться фото.", nl: "De foto kon niet worden gedeeld.", en: "Could not share the photo." },
    photoShareTitle: { ru: "Фото церкви Филадельфия", nl: "Foto van Philadelphia-kerk", en: "Philadelphia Church photo" },
    photoPreview: { ru: "Просмотр фотографии", nl: "Foto bekijken", en: "Photo preview" },
    closePhotoPreview: { ru: "Закрыть просмотр фото", nl: "Fotovoorbeeld sluiten", en: "Close photo preview" },
    editRecord: { ru: "Редактировать", nl: "Bewerken", en: "Edit" },
    saveRecord: { ru: "Сохранить изменения", nl: "Wijzigingen opslaan", en: "Save changes" },
    saved: { ru: "Изменения сохранены.", nl: "Wijzigingen opgeslagen.", en: "Changes saved." },
    source: { ru: "Исходный текст (русский)", nl: "Brontekst (Russisch)", en: "Source text (Russian)" },
    title: { ru: "Название", nl: "Titel", en: "Title" },
    category: { ru: "Категория", nl: "Categorie", en: "Category" },
    description: { ru: "Описание", nl: "Beschrijving", en: "Description" },
    shortDescription: { ru: "Небольшое описание", nl: "Korte beschrijving", en: "Short description" },
    date: { ru: "Дата", nl: "Datum", en: "Date" },
    time: { ru: "Время", nl: "Tijd", en: "Time" },
    image: { ru: "Фотография", nl: "Foto", en: "Photo" },
    noLeaders: { ru: "Пока нет добавленных лидеров служения.", nl: "Er zijn nog geen bedieningsleiders toegevoegd.", en: "No ministry leaders have been added yet." },
    noAdminRecords: { ru: "Пока нет записей.", nl: "Er zijn nog geen items.", en: "There are no entries yet." },
    noHomeGroups: { ru: "Домашние группы пока не добавлены.", nl: "Er zijn nog geen huiskringen toegevoegd.", en: "No home groups have been added yet." },
    noPresbyters: { ru: "Пресвитеры пока не добавлены.", nl: "Er zijn nog geen ouderlingen toegevoegd.", en: "No presbyters have been added yet." },
    createRecordError: { ru: "Не удалось добавить запись.", nl: "De invoer kon niet worden toegevoegd.", en: "Could not add the entry." },
    homeGroupAdded: { ru: "Домашняя группа добавлена.", nl: "Huiskring toegevoegd.", en: "Home group added." },
    presbyterAdded: { ru: "Пресвитер добавлен.", nl: "Ouderling toegevoegd.", en: "Presbyter added." },
    noEvents: { ru: "Сейчас нет событий ближайшие 3 месяца.", nl: "Er zijn de komende 3 maanden geen evenementen.", en: "There are no events in the next 3 months." },
  };
  return labels[key]?.[language] || "";
};

const setupGalleryPhotoActions = () => {
  if (!galleryList) return;

  const status = document.createElement("p");
  status.className = "gallery-photo-action-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  galleryList.parentElement?.append(status);

  const lightbox = document.createElement("div");
  lightbox.className = "gallery-lightbox";
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("tabindex", "-1");
  lightbox.hidden = true;
  const lightboxImage = document.createElement("img");
  lightboxImage.className = "gallery-lightbox-image";
  const closeLightboxButton = document.createElement("button");
  closeLightboxButton.className = "gallery-lightbox-close";
  closeLightboxButton.type = "button";
  closeLightboxButton.textContent = "×";
  lightbox.append(lightboxImage, closeLightboxButton);
  document.body.append(lightbox);

  let activeImage = null;
  let activeMenu = null;
  let lightboxSourceImage = null;
  let pressTimer = 0;
  let pressOrigin = null;
  let ignoreNextImageClick = false;

  const closeLightbox = (restoreFocus = false) => {
    if (lightbox.hidden) return;
    const previousImage = lightboxSourceImage;
    lightbox.hidden = true;
    lightboxImage.removeAttribute("src");
    document.body.classList.remove("has-gallery-lightbox");
    lightboxSourceImage = null;
    if (restoreFocus) previousImage?.focus();
  };

  const showLightbox = (image) => {
    closeMenu();
    lightboxSourceImage = image;
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt;
    lightbox.setAttribute("aria-label", getDynamicLabel("photoPreview"));
    closeLightboxButton.setAttribute("aria-label", getDynamicLabel("closePhotoPreview"));
    lightbox.hidden = false;
    document.body.classList.add("has-gallery-lightbox");
    closeLightboxButton.focus();
  };

  const closeMenu = (restoreFocus = false) => {
    const previousImage = activeImage;
    if (activeMenu) {
      activeMenu.hidden = true;
      activeMenu.closest(".gallery-photo")?.classList.remove("is-actions-open");
    }
    activeImage = null;
    activeMenu = null;
    if (restoreFocus) previousImage?.focus();
  };

  const showMenu = (image) => {
    const figure = image.closest(".gallery-photo");
    const menu = figure?.querySelector(".gallery-photo-menu");
    if (!(menu instanceof HTMLElement)) return;
    closeMenu();
    activeImage = image;
    activeMenu = menu;
    figure.classList.add("is-actions-open");
    menu.setAttribute("aria-label", getDynamicLabel("photoActions"));
    menu.querySelector('[data-photo-action="download"] .gallery-photo-action-label').textContent = getDynamicLabel("downloadPhoto");
    menu.querySelector('[data-photo-action="share"] .gallery-photo-action-label').textContent = getDynamicLabel("sharePhoto");
    menu.hidden = false;
    menu.querySelector("button")?.focus();
  };

  const clearPressTimer = () => {
    window.clearTimeout(pressTimer);
    pressTimer = 0;
    pressOrigin = null;
  };

  const showStatus = (message) => {
    status.textContent = message;
    status.hidden = false;
  };

  const getPhotoBlob = async (image) => {
    const response = await fetch(image.currentSrc || image.src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.blob();
  };

  const getPhotoFile = (blob) => {
    const mimeType = blob.type || "image/jpeg";
    const extension = {
      "image/avif": "avif",
      "image/gif": "gif",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[mimeType] || "jpg";
    return new File([blob], `philadelphia-photo.${extension}`, { type: mimeType });
  };

  const downloadPhoto = async (image) => {
    try {
      const blob = await getPhotoBlob(image);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getPhotoFile(blob).name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus(getDynamicLabel("photoDownloaded"));
    } catch (error) {
      showStatus(`${getDynamicLabel("photoDownloadFailed")} ${error instanceof Error ? error.message : ""}`.trim());
    }
  };

  const copyPhotoLink = async (image) => {
    const photoUrl = image.currentSrc || image.src;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(photoUrl);
        showStatus(getDynamicLabel("photoLinkCopied"));
        return;
      } catch {
        // Fall back to a temporary text field when clipboard permissions are unavailable.
      }
    }

    const input = document.createElement("textarea");
    input.value = photoUrl;
    input.setAttribute("readonly", "");
    input.className = "gallery-photo-copy-field";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("Clipboard access is unavailable.");
    showStatus(getDynamicLabel("photoLinkCopied"));
  };

  const sharePhoto = async (image) => {
    let blob;
    try {
      blob = await getPhotoBlob(image);
    } catch {
      try {
        await copyPhotoLink(image);
      } catch (error) {
        showStatus(`${getDynamicLabel("photoShareFailed")} ${error instanceof Error ? error.message : ""}`.trim());
      }
      return;
    }

    try {
      const file = getPhotoFile(blob);
      const canShareFile = typeof navigator.share === "function"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [file] });
      if (canShareFile) {
        try {
          await navigator.share({ files: [file], title: getDynamicLabel("photoShareTitle") });
          showStatus(getDynamicLabel("photoShared"));
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          await copyPhotoLink(image);
          return;
        }
      }

      await copyPhotoLink(image);
    } catch (error) {
      showStatus(`${getDynamicLabel("photoShareFailed")} ${error instanceof Error ? error.message : ""}`.trim());
    }
  };

  galleryList.addEventListener("contextmenu", (event) => {
    const image = event.target instanceof Element ? event.target.closest(".gallery-photo img") : null;
    if (!(image instanceof HTMLImageElement)) return;
    event.preventDefault();
    showMenu(image);
  });

  galleryList.addEventListener("keydown", (event) => {
    const image = event.target instanceof Element ? event.target.closest(".gallery-photo img") : null;
    if (!(image instanceof HTMLImageElement) || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;
    event.preventDefault();
    showMenu(image);
  });

  galleryList.addEventListener("pointerdown", (event) => {
    const image = event.target instanceof Element ? event.target.closest(".gallery-photo img") : null;
    if (!(image instanceof HTMLImageElement) || event.pointerType === "mouse") return;
    clearPressTimer();
    pressOrigin = { x: event.clientX, y: event.clientY };
    pressTimer = window.setTimeout(() => {
      ignoreNextImageClick = true;
      window.setTimeout(() => { ignoreNextImageClick = false; }, 1200);
      pressTimer = 0;
      showMenu(image);
    }, 550);
  });

  galleryList.addEventListener("pointermove", (event) => {
    if (!pressOrigin) return;
    if (Math.abs(event.clientX - pressOrigin.x) > 12 || Math.abs(event.clientY - pressOrigin.y) > 12) {
      clearPressTimer();
    }
  });
  galleryList.addEventListener("pointerup", clearPressTimer);
  galleryList.addEventListener("pointercancel", clearPressTimer);
  galleryList.addEventListener("pointerleave", clearPressTimer);
  galleryList.addEventListener("click", (event) => {
    const image = event.target instanceof Element ? event.target.closest(".gallery-photo img") : null;
    if (image instanceof HTMLImageElement) {
      if (ignoreNextImageClick) {
        ignoreNextImageClick = false;
        return;
      }
      closeMenu();
    }
  });

  galleryList.addEventListener("dblclick", (event) => {
    const image = event.target instanceof Element ? event.target.closest(".gallery-photo img") : null;
    if (!(image instanceof HTMLImageElement)) return;
    event.preventDefault();
    showLightbox(image);
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox || event.target === closeLightboxButton) closeLightbox(true);
  });
  lightbox.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      closeLightboxButton.focus();
    }
  });

  galleryList.addEventListener("click", (event) => {
    if (event.target === activeMenu) {
      closeMenu();
      return;
    }
    const button = event.target instanceof Element ? event.target.closest("[data-photo-action]") : null;
    if (!(button instanceof HTMLButtonElement) || !activeImage) return;
    const image = activeImage;
    closeMenu(true);
    if (button.dataset.photoAction === "download") void downloadPhoto(image);
    if (button.dataset.photoAction === "share") void sharePhoto(image);
  });

  document.addEventListener("pointerdown", (event) => {
    if (activeMenu && event.target instanceof Node && !activeMenu.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!lightbox.hidden) closeLightbox(true);
    else if (activeMenu) closeMenu(true);
  });
  window.addEventListener("resize", closeMenu);
  galleryList.addEventListener("scroll", closeMenu, { passive: true });
};

const formatAdminRecordCount = (count, type) => {
  const language = getCurrentLanguage();
  const labels = {
    event: { ru: ["событие", "события", "событий"], nl: "evenementen", en: ["event", "events"] },
    homeGroup: { ru: ["домашняя группа", "домашние группы", "домашних групп"], nl: "huiskringen", en: ["home group", "home groups"] },
    presbyter: { ru: ["пресвитер", "пресвитера", "пресвитеров"], nl: "ouderlingen", en: ["presbyter", "presbyters"] },
    leader: { ru: ["лидер", "лидера", "лидеров"], nl: "leiders", en: ["leader", "leaders"] },
  };
  const names = labels[type];
  if (language === "ru") {
    const remainder100 = count % 100;
    const remainder10 = count % 10;
    const form = remainder100 >= 11 && remainder100 <= 14 ? 2 : remainder10 === 1 ? 0 : remainder10 >= 2 && remainder10 <= 4 ? 1 : 2;
    return `${count} ${names.ru[form]}`;
  }
  const name = language === "nl" ? names.nl : names.en[count === 1 ? 0 : 1];
  return `${count} ${name}`;
};

const updateAdminRecordCount = (container, count, type) => {
  const countElement = container?.closest(".admin-records")?.querySelector(".events-count");
  if (countElement) countElement.textContent = formatAdminRecordCount(count, type);
};

const createRecordTranslations = (formData, translatableFields = ["title", "tag", "description"]) => Object.fromEntries(contentLanguages.map((language) => {
  const fields = Object.fromEntries(translatableFields.map((field) => [
    field,
    String(formData.get(`translations.${language}.${field}`) || "").trim(),
  ]));
  return [language, fields];
}).filter(([, fields]) => Object.values(fields).some(Boolean)));

const recordEditorMarkup = (record, type) => {
  const isHomeGroup = type === "homeGroup";
  const fieldLabels = {
    title: getDynamicLabel("title"),
    tag: getDynamicLabel("category"),
    description: getDynamicLabel("description"),
    leader: getDynamicLabel("leader"),
    location: getDynamicLabel("location"),
    day: getDynamicLabel("dayOfWeek"),
  };
  const sourceFields = isHomeGroup
    ? `<fieldset><legend>${getDynamicLabel("source")}</legend>
      <label>${fieldLabels.leader}<input name="leader" value="${escapeHtml(record.leader || record.title || "")}" required /></label>
      <label>${fieldLabels.location}<input name="location" value="${escapeHtml(record.location || record.tag || "")}" required /></label>
      <label>${fieldLabels.day}${getWeekdaySelect(record.day)}</label>
      <label>${getDynamicLabel("shortDescription")}<textarea name="description" rows="3" required>${escapeHtml(record.description || "")}</textarea></label>
    </fieldset>`
    : `<fieldset><legend>${getDynamicLabel("source")}</legend>
    <label>${fieldLabels.title}<input name="title" value="${escapeHtml(record.title || "")}" required /></label>
    ${type === "event" ? `<label>${getDynamicLabel("date")}<input name="date" type="date" value="${escapeHtml(record.date || "")}" required /></label><label>${getDynamicLabel("time")}<input name="time" type="time" value="${escapeHtml(formatEventTime(record.time || ""))}" required /></label>` : ""}
    <label>${fieldLabels.tag}<input name="tag" value="${escapeHtml(record.tag || "")}" /></label>
    <label>${fieldLabels.description}<textarea name="description" rows="3">${escapeHtml(record.description || "")}</textarea></label>
  </fieldset>`;
  const translationKeys = isHomeGroup ? ["leader", "location", "description"] : ["title", "tag", "description"];
  const translationLabels = isHomeGroup ? fieldLabels : { ...fieldLabels, description: getDynamicLabel("description") };
  const translationFields = contentLanguages.map((language) => {
    const values = record.translations?.[language] || {};
    return `<fieldset><legend>${language === "nl" ? "Nederlands" : "English"}</legend>${translationKeys.map((field) => {
      const legacyField = field === "leader" ? "title" : field === "location" ? "tag" : field;
      const value = escapeHtml(values[field] || (isHomeGroup ? values[legacyField] : "") || "");
      const input = field === "description"
        ? `<textarea name="translations.${language}.${field}">${value}</textarea>`
        : `<input name="translations.${language}.${field}" value="${value}" />`;
      return `<label>${translationLabels[field]}${input}</label>`;
    }).join("")}</fieldset>`;
  }).join("");
  return `<details class="admin-record-editor"><summary>${getDynamicLabel("editRecord")}</summary><form data-record-editor="${type}" data-record-id="${escapeHtml(record.id)}">${sourceFields}${translationFields}<label>${getDynamicLabel("image")}<input name="image" type="file" accept="image/*" /></label><img class="admin-edit-image" src="${escapeHtml(record.image || "")}" alt="${getDynamicLabel("image")}" loading="lazy" /><button class="button button-dark" type="submit">${getDynamicLabel("saveRecord")}</button><p class="record-save-message" role="status"></p></form></details>`;
};

const bindRecordEditors = (container, storageKey, type, render) => {
  container.querySelectorAll("form[data-record-editor]").forEach((form) => {
    form.addEventListener("submit", async (submitEvent) => {
      submitEvent.preventDefault();
      const message = form.querySelector(".record-save-message");
      try {
        const records = JSON.parse(localStorage.getItem(storageKey) || "[]");
        if (!Array.isArray(records)) throw new Error("Сохранённые записи имеют неверный формат.");
        const record = records.find((item) => item.id === form.dataset.recordId);
        if (!record) throw new Error("Запись не найдена. Обновите страницу и попробуйте снова.");

        const formData = new FormData(form);
        const image = await prepareUploadedImage(formData.get("image"));
        const updatedRecord = {
          ...record,
          description: String(formData.get("description") || "").trim(),
          translations: createRecordTranslations(formData, type === "homeGroup" ? ["leader", "location", "description"] : undefined),
          image: image || record.image,
        };
        if (type === "homeGroup") {
          updatedRecord.leader = String(formData.get("leader") || "").trim();
          updatedRecord.location = String(formData.get("location") || "").trim();
          updatedRecord.day = String(formData.get("day") || "");
        } else {
          updatedRecord.title = String(formData.get("title") || "").trim();
          updatedRecord.tag = String(formData.get("tag") || "").trim();
        }
        if (type === "event") {
          updatedRecord.date = String(formData.get("date") || "");
          updatedRecord.time = String(formData.get("time") || "");
        }
        if ((type === "homeGroup" && (!updatedRecord.leader || !updatedRecord.location || !updatedRecord.day || !updatedRecord.description))
          || (type !== "homeGroup" && (!updatedRecord.title || (type === "event" && (!updatedRecord.date || !updatedRecord.time))))) {
          throw new Error("Заполните все обязательные поля.");
        }

        const updatedRecords = records.map((item) => item.id === updatedRecord.id ? updatedRecord : item);
        localStorage.setItem(storageKey, JSON.stringify(updatedRecords));
        render();
        const updatedForm = [...container.querySelectorAll("form[data-record-editor]")]
          .find((item) => item.dataset.recordId === updatedRecord.id);
        const updatedMessage = updatedForm?.querySelector(".record-save-message");
        if (updatedForm) updatedForm.closest("details").open = true;
        if (updatedMessage) updatedMessage.textContent = getDynamicLabel("saved");
      } catch (error) {
        if (message) message.textContent = error instanceof Error ? error.message : "Не удалось сохранить изменения.";
      }
    });
  });
};

const leaderCardMarkup = (leader, compact = false, fallbackLabel = "service") => {
  const cardClass = compact ? "leader-preview-card" : "leader-card";
  const photoClass = compact ? "leader-preview-photo" : "leader-photo";
  const infoClass = compact ? "leader-preview-info" : "leader-info";
  const destination = fallbackLabel === "homeGroup" ? "leaders.html#home-groups" : "leaders.html";
  return `<article class="${cardClass}"><div class="${photoClass}" style="background-image:url('${escapeHtml(leader.image)}')"></div><div class="${infoClass}"><div><p>${escapeHtml(getLocalizedRecordField(leader, "tag") || getDynamicLabel(fallbackLabel))}</p><h3>${escapeHtml(getLocalizedRecordField(leader, "title"))}</h3>${compact ? `<a href="${destination}">Подробнее <span>→</span></a>` : `<small>${escapeHtml(getLocalizedRecordField(leader, "description"))}</small>`}</div>${compact ? "" : "<span>↗</span>"}</div></article>`;
};

const getLocalizedHomeGroupField = (record, field) => {
  const legacyField = field === "leader" ? "title" : field === "location" ? "tag" : "";
  const value = record[field] || (legacyField && record[legacyField]) || "";
  const language = getCurrentLanguage();
  if (language === "ru") return value;
  const translations = record.translations?.[language] || {};
  return translations[field] || (legacyField && translations[legacyField]) || value;
};

const getWeekdaySelect = (selectedDay = "") => {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  return `<select name="day" required><option value="">${getDynamicLabel("selectDay")}</option>${days.map((day) => `<option value="${day}"${day === selectedDay ? " selected" : ""}>${getDynamicLabel(day)}</option>`).join("")}</select>`;
};

const homeGroupCardMarkup = (record, compact) => {
  const leader = getLocalizedHomeGroupField(record, "leader");
  const location = getLocalizedHomeGroupField(record, "location");
  const day = record.day ? getDynamicLabel(record.day) : "";
  const description = getLocalizedRecordField(record, "description");
  return `<article class="home-group-card${compact ? " home-group-card-compact" : ""}">
    <div class="home-group-orbit" aria-hidden="true">
      <div class="home-group-photo" style="background-image:url('${escapeHtml(record.image)}')"></div>
    </div>
    <div class="home-group-info">
      <p class="home-group-tag">${escapeHtml(location || getDynamicLabel("homeGroup"))}</p>
      <p class="home-group-leader-label">${getDynamicLabel("leader")}</p>
      <h3>${escapeHtml(leader)}</h3>
      ${day ? `<p class="home-group-day">${day}</p>` : ""}
      ${description ? `<p class="home-group-description">${escapeHtml(description)}</p>` : ""}
    </div>
  </article>`;
};

const renderDirectory = (records, list, emptyLabel, type, compact = false) => {
  if (!list) return;
  list.innerHTML = records.length
    ? records.map((record) => type === "homeGroup"
      ? homeGroupCardMarkup(record, compact)
      : leaderCardMarkup(record, compact, type)).join("")
    : `<p class="directory-empty">${getDynamicLabel(emptyLabel)}</p>`;
};

const renderAdminDirectory = (records, container, storageKey, type, render) => {
  if (!container) return;
  updateAdminRecordCount(container, records.length, type);
  container.innerHTML = records.length
    ? records.map((record, index) => {
      const title = type === "homeGroup" ? getLocalizedHomeGroupField(record, "leader") : getLocalizedRecordField(record, "title");
      const details = type === "homeGroup"
        ? [getLocalizedHomeGroupField(record, "location"), record.day ? getDynamicLabel(record.day) : ""].filter(Boolean).join(" · ")
        : getLocalizedRecordField(record, "tag") || getDynamicLabel(type);
      const orderControls = type === "homeGroup"
        ? `<div class="admin-record-order"><button type="button" data-move-home-group="up" data-record-id="${escapeHtml(record.id)}" aria-label="${getDynamicLabel("moveUp")}" title="${getDynamicLabel("moveUp")}"${index === 0 ? " disabled" : ""}>↑</button><button type="button" data-move-home-group="down" data-record-id="${escapeHtml(record.id)}" aria-label="${getDynamicLabel("moveDown")}" title="${getDynamicLabel("moveDown")}"${index === records.length - 1 ? " disabled" : ""}>↓</button></div>`
        : "";
      const orderMessage = type === "homeGroup" ? '<p class="record-order-message" role="status" hidden></p>' : "";
      return `<article class="admin-event"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(details)}</span></div>${orderControls}<button type="button" data-delete-record="${escapeHtml(record.id)}">${getDynamicLabel("remove")}</button>${recordEditorMarkup(record, type)}${orderMessage}</article>`;
    }).join("")
    : `<p class="admin-record-empty">${getDynamicLabel("noAdminRecords")}</p>`;
  bindRecordEditors(container, storageKey, type, render);
  if (type === "homeGroup") {
    container.querySelectorAll("[data-move-home-group]").forEach((button) => {
      button.addEventListener("click", () => {
        const storedRecords = readRecords(storageKey);
        const currentIndex = storedRecords.findIndex((record) => record.id === button.dataset.recordId);
        const direction = button.dataset.moveHomeGroup === "up" ? -1 : 1;
        const nextIndex = currentIndex + direction;
        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= storedRecords.length) return;

        [storedRecords[currentIndex], storedRecords[nextIndex]] = [storedRecords[nextIndex], storedRecords[currentIndex]];
        try {
          localStorage.setItem(storageKey, JSON.stringify(storedRecords));
        } catch (error) {
          const message = button.closest(".admin-event")?.querySelector(".record-order-message");
          if (message) {
            message.hidden = false;
            message.textContent = `Не удалось сохранить порядок домашних групп: ${error instanceof Error ? error.message : "ошибка браузера."}`;
          }
          return;
        }

        render();
        const movedRecord = [...container.querySelectorAll(".admin-event")]
          .find((item) => item.querySelector("[data-record-id]")?.dataset.recordId === button.dataset.recordId);
        const focusButton = [...(movedRecord?.querySelectorAll("[data-move-home-group]") || [])]
          .find((item) => item.dataset.moveHomeGroup === button.dataset.moveHomeGroup && !item.disabled)
          || [...(movedRecord?.querySelectorAll("[data-move-home-group]") || [])].find((item) => !item.disabled);
        focusButton?.focus();
      });
    });
  }
  container.querySelectorAll("[data-delete-record]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem(storageKey, JSON.stringify(readRecords(storageKey).filter((record) => record.id !== button.dataset.deleteRecord)));
      render();
    });
  });
};

const renderHomeGroups = () => {
  const records = readRecords(homeGroupStorageKey);
  renderDirectory(records, homeGroupsList, "noHomeGroups", "homeGroup");
  renderDirectory(records, homeGroupsPreviewList, "noHomeGroups", "homeGroup", true);
  renderAdminDirectory(records, adminHomeGroupsList, homeGroupStorageKey, "homeGroup", renderHomeGroups);
};

const renderPresbyters = () => {
  const records = readRecords(presbyterStorageKey);
  renderDirectory(records, presbytersList, "noPresbyters", "presbyter");
  renderAdminDirectory(records, adminPresbytersList, presbyterStorageKey, "presbyter", renderPresbyters);
};

const renderLeaders = () => {
  const leaders = readLeaders();
  if (leadersPageList) {
    leadersPageList.innerHTML = leaders.length ? leaders.map((leader) => leaderCardMarkup(leader)).join("") : `<div class="leader-empty">${getDynamicLabel("noLeaders")}</div>`;
  }
  if (adminLeadersList) {
    updateAdminRecordCount(adminLeadersList, leaders.length, "leader");
    adminLeadersList.innerHTML = leaders.length ? leaders.map((leader) => `<article class="admin-event"><div><strong>${escapeHtml(getLocalizedRecordField(leader, "title"))}</strong><span>${escapeHtml(getLocalizedRecordField(leader, "tag") || getDynamicLabel("service"))}</span></div><button type="button" data-delete-leader="${escapeHtml(leader.id)}">${getDynamicLabel("remove")}</button>${recordEditorMarkup(leader, "leader")}</article>`).join("") : `<p class="admin-record-empty">${getDynamicLabel("noAdminRecords")}</p>`;
    bindRecordEditors(adminLeadersList, leaderStorageKey, "leader", renderLeaders);
    adminLeadersList.querySelectorAll("[data-delete-leader]").forEach((button) => {
      button.addEventListener("click", () => {
        localStorage.setItem(leaderStorageKey, JSON.stringify(readLeaders().filter((leader) => leader.id !== button.dataset.deleteLeader)));
        renderLeaders();
      });
    });
  }
};

const formatEventDate = (date) => {
  const parsed = new Date(`${date}T00:00:00`);
  const locale = { ru: "ru-RU", nl: "nl-BE", en: "en-GB" }[getCurrentLanguage()];
  return {
    day: parsed.toLocaleDateString(locale, { day: "2-digit" }),
    month: parsed.toLocaleDateString(locale, { month: "short" }).replace(".", "").toUpperCase(),
  };
};

const formatEventTime = (time) => {
  const value = String(time || "").trim();
  const twelveHourTime = value.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
  if (!twelveHourTime) return value;
  const hour = Number(twelveHourTime[1]) % 12 + (twelveHourTime[3].toUpperCase() === "PM" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${twelveHourTime[2]}`;
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

const compareEventsByDate = (a, b) => (
  a.date.localeCompare(b.date) || formatEventTime(a.time).localeCompare(formatEventTime(b.time))
);

const getUpcomingEvents = () => {
  const now = new Date();
  const maxDate = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());

  return readEvents()
    .filter((event) => {
      if (!event.date) return false;
      const eventDate = new Date(`${event.date}T00:00:00`);
      return eventDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && eventDate <= maxDate;
    })
    .sort(compareEventsByDate)
    .slice(0, 3);
};

const renderEvents = () => {
  const events = getUpcomingEvents();

  if (eventsList) {
    eventsList.innerHTML = "";

    if (!events.length) {
      eventsList.innerHTML = `<div class="event-empty">${getDynamicLabel("noEvents")}</div>`;
    } else {
      events.forEach((event) => {
        const date = formatEventDate(event.date);
        const card = document.createElement("article");
        card.className = "event-card event-card-cover custom-event";
        card.innerHTML = `<img class="event-cover-image" src="${escapeHtml(event.image)}" alt="${escapeHtml(getLocalizedRecordField(event, "title"))}" loading="lazy" /><span class="event-cover-date">${date.day} ${date.month}</span><div class="event-cover-content"><p class="tag">${escapeHtml(getLocalizedRecordField(event, "tag") || getDynamicLabel("event"))}</p><h3>${escapeHtml(getLocalizedRecordField(event, "title"))}</h3><p class="event-description">${escapeHtml(getLocalizedRecordField(event, "description"))}</p><p class="event-meta">${escapeHtml(formatEventTime(event.time))}</p></div>`;
        eventsList.append(card);
      });
    }
  }

  if (adminEventsList) {
    const allEvents = readEvents().sort(compareEventsByDate);
    updateAdminRecordCount(adminEventsList, allEvents.length, "event");
    adminEventsList.innerHTML = allEvents.length
      ? allEvents.map((event) => `<article class="admin-event"><div><strong>${escapeHtml(getLocalizedRecordField(event, "title"))}</strong><span>${escapeHtml(event.date)} · ${escapeHtml(formatEventTime(event.time))}</span></div><button type="button" data-delete-event="${escapeHtml(event.id)}">${getDynamicLabel("remove")}</button>${recordEditorMarkup(event, "event")}</article>`).join("")
      : `<p class="admin-record-empty">${getDynamicLabel("noAdminRecords")}</p>`;

    bindRecordEditors(adminEventsList, eventStorageKey, "event", renderEvents);
    adminEventsList.querySelectorAll("[data-delete-event]").forEach((button) => {
      button.addEventListener("click", () => {
        localStorage.setItem(eventStorageKey, JSON.stringify(readEvents().filter((event) => event.id !== button.dataset.deleteEvent)));
        renderEvents();
      });
    });
  }

};

if (leaderForm) {
  leaderForm.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const messageElement = document.querySelector("#leader-form-message");
    if (!(messageElement instanceof HTMLElement)) return;
    messageElement.classList.remove("form-message-error");
    messageElement.textContent = "";

    const formData = new FormData(leaderForm);
    try {
      const image = await prepareUploadedImage(formData.get("image"));
      const leader = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: String(formData.get("title") || "").trim(),
        tag: String(formData.get("tag") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        translations: createRecordTranslations(formData),
        image: image || "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80",
      };
      if (saveAdminRecord(leaderStorageKey, leader, messageElement, "Лидер добавлен на сайт.", renderLeaders)) {
        leaderForm.reset();
      }
    } catch (error) {
      messageElement.classList.add("form-message-error");
      messageElement.textContent = error instanceof Error ? error.message : "Не удалось добавить лидера. Проверьте фото и попробуйте снова.";
    }
  });
}

const bindDirectoryForm = (form, storageKey, messageId, render, type) => {
  if (!form) return;
  form.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const message = document.querySelector(`#${messageId}`);
    if (!(message instanceof HTMLElement)) return;
    message.classList.remove("form-message-error");
    message.textContent = "";

    const formData = new FormData(form);
    try {
      const image = await prepareUploadedImage(formData.get("image"));
      const record = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        description: String(formData.get("description") || "").trim(),
        translations: createRecordTranslations(formData, type === "homeGroup" ? ["leader", "location", "description"] : undefined),
        image: image || "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80",
      };
      if (type === "homeGroup") {
        record.leader = String(formData.get("leader") || "").trim();
        record.location = String(formData.get("location") || "").trim();
        record.day = String(formData.get("day") || "");
        if (!record.leader || !record.location || !record.day || !record.description) {
          throw new Error("Заполните имя лидера, место/район, день недели и описание.");
        }
      } else {
        record.title = String(formData.get("title") || "").trim();
        record.tag = String(formData.get("tag") || "").trim();
        if (!record.title || !record.description) throw new Error("Заполните название и описание.");
      }
      const successMessage = type === "homeGroup" ? getDynamicLabel("homeGroupAdded") : getDynamicLabel("presbyterAdded");
      if (saveAdminRecord(storageKey, record, message, successMessage, render)) form.reset();
    } catch (error) {
      message.classList.add("form-message-error");
      message.textContent = error instanceof Error ? error.message : `${getDynamicLabel("createRecordError")} ${getDynamicLabel(type)}.`;
    }
  });
};

bindDirectoryForm(homeGroupForm, homeGroupStorageKey, "home-group-form-message", renderHomeGroups, "homeGroup");
bindDirectoryForm(presbyterForm, presbyterStorageKey, "presbyter-form-message", renderPresbyters, "presbyter");

if (eventForm) {
  eventForm.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    const messageElement = document.querySelector("#form-message");
    if (!(messageElement instanceof HTMLElement)) return;
    messageElement.classList.remove("form-message-error");
    messageElement.textContent = "";

    const formData = new FormData(eventForm);
    try {
      const image = await prepareUploadedImage(formData.get("image"));
      const event = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: String(formData.get("title") || "").trim(),
        date: String(formData.get("date") || ""),
        time: String(formData.get("time") || ""),
        tag: String(formData.get("tag") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        translations: createRecordTranslations(formData),
        image: image || "https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=900&q=80",
      };
      if (saveAdminRecord(eventStorageKey, event, messageElement, "Событие опубликовано на главной странице.", renderEvents)) {
        eventForm.reset();
      }
    } catch (error) {
      messageElement.classList.add("form-message-error");
      messageElement.textContent = error instanceof Error ? error.message : "Не удалось создать событие. Проверьте фото и попробуйте снова.";
    }
  });
}

if (galleryForm && galleryFormMessage) {
  galleryForm.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    galleryFormMessage.classList.remove("form-message-error");
    galleryFormMessage.textContent = "";

    const fileInput = galleryForm.querySelector('input[type="file"]');
    try {
      const image = await prepareUploadedImage(fileInput?.files?.[0]);
      if (!image) throw new Error("Выберите фотографию перед добавлением.");

      const photo = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(),
        image,
      };
      if (saveAdminRecord(galleryStorageKey, photo, galleryFormMessage, "Фотография добавлена в галерею.", renderGallery)) {
        galleryForm.reset();
      }
    } catch (error) {
      galleryFormMessage.classList.add("form-message-error");
      galleryFormMessage.textContent = error instanceof Error ? error.message : "Не удалось добавить фотографию. Проверьте файл и попробуйте снова.";
    }
  });
}

if (exportBackupButton) exportBackupButton.addEventListener("click", () => downloadBackup());

if (importBackupInput) {
  importBackupInput.addEventListener("change", () => {
    const file = importBackupInput.files?.[0];
    importBackupInput.value = "";
    if (!file) return;
    if (file.size > maxBackupSize) {
      if (backupMessage) backupMessage.textContent = "Файл слишком большой. Максимальный размер — 15 МБ.";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const backup = JSON.parse(String(reader.result));
        if (backup.format !== "philadelphia-site-backup" || backup.version !== backupVersion) throw new Error("Файл создан в несовместимом формате.");
        const events = normalizeBackupItems(backup.events, "событий");
        const leaders = normalizeBackupItems(backup.leaders, "лидеров");
        const homeGroups = normalizeDirectoryBackupItems(backup.homeGroups, "домашних групп", homeGroupStorageKey);
        const presbyters = normalizeDirectoryBackupItems(backup.presbyters, "пресвитеров", presbyterStorageKey);
        const gallery = normalizeGalleryBackupItems(backup.gallery);
        if (!window.confirm(`Заменить текущие данные?\n\nСобытия: ${events.length}\nЛидеры: ${leaders.length}\nДомашние группы: ${homeGroups.length}\nПресвитеры: ${presbyters.length}\nФотографии галереи: ${gallery.length}\n\nПеред заменой текущая копия будет скачана.`)) return;
        downloadBackup(true);
        localStorage.setItem(eventStorageKey, JSON.stringify(events));
        localStorage.setItem(leaderStorageKey, JSON.stringify(leaders));
        localStorage.setItem(homeGroupStorageKey, JSON.stringify(homeGroups));
        localStorage.setItem(presbyterStorageKey, JSON.stringify(presbyters));
        localStorage.setItem(galleryStorageKey, JSON.stringify(gallery));
        renderEvents();
        renderLeaders();
        renderHomeGroups();
        renderPresbyters();
        renderGallery();
        if (backupMessage) backupMessage.textContent = "Данные успешно восстановлены.";
      } catch (error) {
        if (backupMessage) backupMessage.textContent = error instanceof Error ? error.message : "Не удалось импортировать файл.";
      }
    });
    reader.readAsText(file);
  });
}

renderEvents();
renderLeaders();
renderHomeGroups();
renderPresbyters();
renderGallery();
setupGalleryPhotoActions();
