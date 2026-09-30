const navigationType = performance.getEntriesByType("navigation")[0]?.type;
if (navigationType === "reload") {
  history.scrollRestoration = "manual";
  window.addEventListener("load", () => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, { once: true });
}

const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".main-nav");
const adminContent = document.querySelector("#admin-content");
const loginScreen = document.querySelector("#login-screen");
const loginForm = document.querySelector("#login-form");
const logoutButton = document.querySelector("#logout-button");
const setupScreen = document.querySelector("#setup-screen");
const setupForm = document.querySelector("#setup-form");
let adminCsrfToken = "";
const adminTabs = document.querySelector("[data-admin-tabs]");
const adminTabStorageKey = "philadelphia-admin-active-tab";
const requestApi = async (endpoint, options = {}) => {
  const method = options.method || "GET";
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (method !== "GET" && adminCsrfToken) headers.set("X-CSRF-Token", adminCsrfToken);

  const response = await fetch(`api/${endpoint}`, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Сервер вернул некорректный ответ (${response.status}). Проверьте, что на хостинге включён PHP.`);
  }
  if (!response.ok) throw new Error(payload.error || `Ошибка сервера: ${response.status}`);
  return payload;
};

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
  if (adminContent) adminContent.hidden = true;
  if (loginScreen) loginScreen.hidden = true;
  if (setupScreen) setupScreen.hidden = true;
  if (logoutButton) logoutButton.hidden = false;
  sharedContentReady = loadSharedContent(true)
    .then(() => {
      sharedContentLoadError = null;
      renderLeaders();
      renderHomeGroups();
      renderPresbyters();
    })
    .catch((error) => {
      sharedContentLoadError = error instanceof Error ? error : new Error("Не удалось загрузить общее содержимое сайта.");
      renderLeaders();
      renderHomeGroups();
      renderPresbyters();
      console.error("Не удалось загрузить общее содержимое сайта.", sharedContentLoadError);
    });
  sharedGalleryReady = loadSharedGallery(true)
    .then(() => renderGallery())
    .catch((error) => {
      sharedGalleryLoadError = error instanceof Error ? error : new Error("Не удалось загрузить общую галерею.");
      renderGallery();
      console.error("Не удалось загрузить общую галерею с сервера.", sharedGalleryLoadError);
    });
  Promise.all([sharedContentReady, sharedGalleryReady]).finally(() => {
    if (adminContent) adminContent.hidden = false;
  });
};

const readLegacyRecords = (storageKey) => {
  const value = localStorage.getItem(storageKey);
  if (value === null) return [];
  try {
    const stored = JSON.parse(value);
    if (!Array.isArray(stored)) throw new Error("Старые данные в браузере имеют неверный формат.");
    return stored;
  } catch (error) {
    throw new Error(`Не удалось прочитать старые данные из браузера: ${error instanceof Error ? error.message : "неизвестная ошибка."}`);
  }
};

if (adminContent && loginScreen) {
  adminContent.hidden = true;
  loginScreen.hidden = true;
  if (setupScreen) setupScreen.hidden = true;
  if (logoutButton) logoutButton.hidden = true;

  requestApi("auth.php")
    .then((session) => {
      adminCsrfToken = session.csrfToken || "";
      if (session.authenticated) {
        showAdmin();
      } else if (session.configured) {
        loginScreen.hidden = false;
      } else if (setupScreen) {
        setupScreen.hidden = false;
      }
    })
    .catch((error) => {
      loginScreen.hidden = false;
      const loginError = document.querySelector("#login-error");
      if (loginError) {
        loginError.textContent = `Серверная админка недоступна. ${error.message}`;
        loginError.classList.add("form-message-error");
      }
      console.error("Не удалось проверить серверный сеанс администратора.", error);
    });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passwordInput = document.querySelector("#admin-password");
    const error = document.querySelector("#login-error");
    error.textContent = "";
    error.classList.remove("form-message-error");
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const session = await requestApi("auth.php", {
        method: "POST",
        body: JSON.stringify({ password: passwordInput.value }),
      });
      adminCsrfToken = session.csrfToken;
      showAdmin();
    } catch (requestError) {
      error.textContent = requestError instanceof Error ? requestError.message : "Не удалось войти в админку.";
      passwordInput.select();
    } finally {
      submitButton.disabled = false;
    }
  });
}

if (setupForm) {
  setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.querySelector("#setup-error");
    const setupCode = document.querySelector("#setup-code");
    const newPassword = document.querySelector("#new-admin-password");
    const submitButton = setupForm.querySelector('button[type="submit"]');
    error.textContent = "";
    submitButton.disabled = true;
    try {
      const session = await requestApi("auth.php", {
        method: "POST",
        body: JSON.stringify({ setupCode: setupCode.value, newPassword: newPassword.value }),
      });
      adminCsrfToken = session.csrfToken;
      setupCode.value = "";
      newPassword.value = "";
      showAdmin();
    } catch (requestError) {
      error.textContent = requestError instanceof Error ? requestError.message : "Не удалось создать пароль администратора.";
    } finally {
      submitButton.disabled = false;
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await requestApi("auth.php", { method: "DELETE" });
      adminCsrfToken = "";
      window.location.reload();
    } catch (error) {
      console.error("Не удалось завершить серверный сеанс.", error);
      window.alert(error instanceof Error ? error.message : "Не удалось выйти из админки.");
      logoutButton.disabled = false;
    }
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
const pageLanguage = ["ru", "nl", "en"].includes(localStorage.getItem("philadelphia-language"))
  ? localStorage.getItem("philadelphia-language")
  : "ru";

const pageVisibilityPages = {
  about: {
    file: "about.html",
    label: { ru: "О нас", nl: "Over ons", en: "About us" },
  },
  leaders: {
    file: "leaders.html",
    label: { ru: "Служения", nl: "Bedieningen", en: "Ministries" },
  },
  gallery: {
    file: "gallery.html",
    label: { ru: "Галерея", nl: "Galerij", en: "Gallery" },
  },
};
const pageVisibilityMessages = {
  saved: {
    ru: "Настройки сохранены на сервере и уже применяются для всех посетителей.",
    nl: "De instellingen zijn opgeslagen op de server en zijn nu actief voor alle bezoekers.",
    en: "Settings are saved on the server and are now active for all visitors.",
  },
  error: {
    ru: "Не удалось сохранить настройки на сервере. Попробуйте ещё раз.",
    nl: "De instellingen konden niet op de server worden opgeslagen. Probeer het opnieuw.",
    en: "Could not save the settings on the server. Please try again.",
  },
};
const normalizePageVisibility = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Некорректный формат настроек видимости страниц.");
  }
  return Object.fromEntries(Object.keys(pageVisibilityPages).map((key) => {
    const isVisible = value[key] ?? true;
    if (typeof isVisible !== "boolean") {
      throw new Error(`Некорректное значение видимости страницы: ${key}`);
    }
    return [key, isVisible];
  }));
};

const initializePageVisibility = async () => {
  const isAdminPage = document.body.classList.contains("admin-page");
  const visibilityList = document.querySelector("#page-visibility-list");
  const saveButton = document.querySelector("#save-page-visibility");
  const statusMessage = document.querySelector("#page-visibility-message");
  if (isAdminPage && !visibilityList) return;
  const pageVisibilityStylesheet = document.createElement("link");
  pageVisibilityStylesheet.rel = "stylesheet";
  pageVisibilityStylesheet.href = "page-visibility.css?v=page-visibility-v1";
  document.head.append(pageVisibilityStylesheet);

  let publishedVisibility = Object.fromEntries(Object.keys(pageVisibilityPages).map((key) => [key, true]));
  try {
    const settings = await requestApi("content.php?collection=pageVisibility");
    publishedVisibility = normalizePageVisibility(settings.pageVisibility);
    sharedContent.pageVisibility = publishedVisibility;
  } catch (error) {
    console.error("Настройки видимости страниц не загружены с сервера; используется опубликованный файл.", error);
    try {
      const response = await fetch("page-visibility.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`Не удалось загрузить page-visibility.json: HTTP ${response.status}`);
      publishedVisibility = normalizePageVisibility(await response.json());
    } catch (fallbackError) {
      console.error("Опубликованный файл видимости страниц также не загружен; страницы оставлены доступными.", fallbackError);
    }
  }
  sharedContent.pageVisibility = publishedVisibility;

  if (isAdminPage && visibilityList && saveButton && statusMessage) {
    visibilityList.replaceChildren(...Object.entries(pageVisibilityPages).map(([key, page]) => {
      const label = document.createElement("label");
      label.className = "page-visibility-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = publishedVisibility[key];
      input.dataset.pageVisibility = key;
      const name = document.createElement("span");
      name.textContent = page.label[pageLanguage];
      label.append(input, name);
      return label;
    }));
    const readDraft = () => Object.fromEntries([...visibilityList.querySelectorAll("[data-page-visibility]")].map((input) => [
      input.dataset.pageVisibility,
      input.checked,
    ]));
    visibilityList.addEventListener("change", () => {
      statusMessage.textContent = "";
    });
    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        const result = await requestApi("content.php?collection=pageVisibility", {
          method: "PUT",
          body: JSON.stringify({ pageVisibility: readDraft() }),
        });
        publishedVisibility = normalizePageVisibility(result.pageVisibility);
        statusMessage.classList.remove("form-message-error");
        statusMessage.textContent = pageVisibilityMessages.saved[pageLanguage];
      } catch (error) {
        console.error("Не удалось сохранить настройки видимости страниц.", error);
        statusMessage.classList.add("form-message-error");
        statusMessage.textContent = pageVisibilityMessages.error[pageLanguage];
      } finally {
        saveButton.disabled = false;
      }
    });
    return;
  }
  if (isAdminPage) return;

  const currentPage = Object.entries(pageVisibilityPages).find(([, page]) => page.file === location.pathname.split("/").pop());
  if (currentPage && !publishedVisibility[currentPage[0]]) {
    const main = document.querySelector("main");
    if (main) {
      const messages = {
        ru: ["Эта страница пока готовится", "Загляните позже — мы скоро обновим её.", "На главную"],
        nl: ["Deze pagina wordt voorbereid", "Kom later terug — we werken deze pagina binnenkort bij.", "Naar de startpagina"],
        en: ["This page is being prepared", "Please check back later — we will update this page soon.", "Home"],
      };
      const [title, description, home] = messages[pageLanguage];
      const notice = document.createElement("section");
      notice.className = "page-unavailable";
      const heading = document.createElement("h1");
      heading.textContent = title;
      const text = document.createElement("p");
      text.textContent = description;
      const link = document.createElement("a");
      link.href = "index.html";
      link.textContent = home;
      notice.append(heading, text, link);
      main.replaceChildren(notice);
    }
  }

  document.querySelectorAll("a[href]").forEach((link) => {
    let destination;
    try {
      destination = new URL(link.href, location.href).pathname.split("/").pop();
    } catch (error) {
      console.error("Не удалось определить адрес ссылки при настройке видимости страниц.", error);
      return;
    }
    const hiddenPage = Object.entries(pageVisibilityPages).find(([key, page]) => page.file === destination && !publishedVisibility[key]);
    if (hiddenPage) link.hidden = true;
  });
};

initializePageVisibility();

if (videosContainer) {
  fetch("latest-videos.json")
    .then((response) => {
      if (!response.ok) throw new Error("Не удалось загрузить видео");
      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data.videos) || data.videos.length < 3) {
        throw new Error("Видео не найдены");
      }

      const watchLabel = { ru: "Смотреть видео", nl: "Video bekijken", en: "Watch video" }[pageLanguage];
      const videoTitleTranslations = {
        nl: {
          "Соответствуй тому, кто ты есть, христианин.": "Wees wie je als christen bent.",
          "Молитвенное поклонение": "Gebed en aanbidding",
          "Ищите славу, которая от Единого Бога": "Zoek de eer die van de enige God komt",
          "Может ли антихрист обмануть церковь?": "Kan de antichrist de kerk misleiden?",
        },
        en: {
          "Соответствуй тому, кто ты есть, христианин.": "Be who you are called to be as a Christian.",
          "Молитвенное поклонение": "Prayer and worship",
          "Ищите славу, которая от Единого Бога": "Seek the glory that comes from the only God",
          "Может ли антихрист обмануть церковь?": "Can the Antichrist deceive the church?",
        },
      };
      const latestVideos = data.videos.slice(0, 3);
      if (latestVideos.some((video) => !/^[\w-]{11}$/.test(video.id) || typeof video.title !== "string")) {
        throw new Error("Некорректные данные видео");
      }

      videosContainer.replaceChildren(...latestVideos.map((video) => {
        const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;
        const title = videoTitleTranslations[pageLanguage]?.[video.title] || video.title;
        const card = document.createElement("article");
        card.className = "video-card";

        const thumbnailLink = document.createElement("a");
        thumbnailLink.className = "video-thumb";
        thumbnailLink.href = videoUrl;
        thumbnailLink.target = "_blank";
        thumbnailLink.rel = "noreferrer";

        const thumbnail = document.createElement("img");
        thumbnail.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
        thumbnail.alt = title;
        thumbnail.loading = "lazy";

        const playIcon = document.createElement("span");
        playIcon.className = "video-play";
        playIcon.textContent = "▶";
        thumbnailLink.append(thumbnail, playIcon);

        const info = document.createElement("div");
        info.className = "video-info";

        const heading = document.createElement("h3");
        heading.textContent = title;

        const watchLink = document.createElement("a");
        watchLink.href = videoUrl;
        watchLink.target = "_blank";
        watchLink.rel = "noreferrer";
        watchLink.textContent = `${watchLabel} ↗`;

        info.append(heading, watchLink);
        card.append(thumbnailLink, info);
        return card;
      }));
    })
    .catch(() => {
      const unavailable = {
        ru: "Не удалось загрузить последние видео.",
        nl: "De nieuwste video's konden niet worden geladen.",
        en: "The latest videos could not be loaded.",
      }[pageLanguage];
      const channelLabel = {
        ru: "Открыть канал на YouTube",
        nl: "Kanaal openen op YouTube",
        en: "Open the YouTube channel",
      }[pageLanguage];
      const status = document.createElement("p");
      status.className = "video-status";
      status.textContent = `${unavailable} `;
      const channelLink = document.createElement("a");
      channelLink.href = "https://www.youtube.com/@Church_P";
      channelLink.target = "_blank";
      channelLink.rel = "noreferrer";
      channelLink.textContent = `${channelLabel} ↗`;
      status.append(channelLink);
      videosContainer.replaceChildren(status);
    });
}

const eventsList = document.querySelector("#events-list");
const adminEventsList = document.querySelector("#admin-events-list");
const eventForm = document.querySelector("#event-form");
let sharedEvents = [];
let sharedEventsLoadError = null;
let sharedEventsLoaded = false;
let sharedEventsReady = Promise.resolve(false);
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
const contentCollectionByStorageKey = new Map([
  [leaderStorageKey, "leaders"],
  [homeGroupStorageKey, "homeGroups"],
  [presbyterStorageKey, "presbyters"],
]);
let sharedContent = {
  leaders: [],
  homeGroups: [],
  presbyters: [],
  pageVisibility: { about: true, leaders: true, gallery: true },
};
let sharedContentLoadError = null;
let sharedContentReady = Promise.resolve();
const readRecords = (storageKey) => {
  const collection = contentCollectionByStorageKey.get(storageKey);
  if (!collection) throw new Error("Неизвестный раздел содержимого сайта.");
  return sharedContent[collection];
};
const galleryBatchSize = 12;
let galleryPhotos = [];
let galleryRenderedCount = 0;
let sharedGalleryPhotos = [];
let sharedGalleryLoadError = null;
let sharedGalleryReady = Promise.resolve();
const exportBackupButton = document.querySelector("#export-backup");
const importBackupInput = document.querySelector("#import-backup");
const backupMessage = document.querySelector("#backup-message");
const backupVersion = 1;
const maxBackupSize = 100 * 1024 * 1024;
const maxImageUploadSize = 15 * 1024 * 1024;
const maxImageDimension = 1600;
const maxStoredImageSize = 3 * 1024 * 1024;

const isSafeImage = (value) => typeof value === "string" && (value === "" || value.startsWith("data:image/") || /^https:\/\/[^\s]+$/i.test(value));

const prepareUploadedImage = async (value) => {
  if (!(value instanceof File) || value.size === 0) return { dataUrl: "", aspectRatio: null };
  if (!value.type.startsWith("image/")) {
    throw new Error("Выберите файл изображения (например, JPEG, PNG или WebP).");
  }
  if (value.size > maxImageUploadSize) {
    throw new Error("Размер фото превышает 15 МБ. Уменьшите файл и попробуйте снова.");
  }

  const objectUrl = URL.createObjectURL(value);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", () => reject(new Error("Формат фото не поддерживается или файл повреждён. Попробуйте JPEG, PNG или WebP.")), { once: true });
      image.src = objectUrl;
    });

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

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Не удалось подготовить фото для сохранения."));
      });
      reader.addEventListener("error", () => reject(new Error("Не удалось прочитать фото. Попробуйте другой файл.")));
      reader.readAsDataURL(optimizedImage);
    });
    return { dataUrl, aspectRatio: canvas.width / canvas.height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const saveAdminRecord = async (storageKey, record, messageElement, successMessage, render) => {
  const collection = contentCollectionByStorageKey.get(storageKey);
  if (!collection) throw new Error("Неизвестный раздел содержимого сайта.");
  try {
    await sharedContentReady;
    if (sharedContentLoadError) throw sharedContentLoadError;
    const result = await requestApi(`content.php?collection=${collection}`, {
      method: "POST",
      body: JSON.stringify(record),
    });
    if (!Array.isArray(result.items)) throw new Error("Сервер вернул некорректный список записей.");
    sharedContent[collection] = result.items;
  } catch (error) {
    messageElement.textContent = error instanceof Error ? error.message : "Не удалось сохранить запись на сервере.";
    messageElement.classList.add("form-message-error");
    return false;
  }

  try {
    render();
  } catch (error) {
    console.error("Запись сохранена на сервере, но не удалось обновить её отображение.", error);
    messageElement.textContent = `Запись сохранена, но список не удалось обновить: ${error instanceof Error ? error.message : "неизвестная ошибка."}`;
    messageElement.classList.add("form-message-error");
    return true;
  }
  messageElement.classList.remove("form-message-error");
  messageElement.textContent = successMessage;
  return true;
};

const replaceSharedRecords = async (storageKey, records, reorderOnly = false) => {
  const collection = contentCollectionByStorageKey.get(storageKey);
  if (!collection) throw new Error("Неизвестный раздел содержимого сайта.");
  if (reorderOnly) {
    const ordered = await requestApi(`content.php?collection=${collection}&action=order`, {
      method: "PUT",
      body: JSON.stringify({ ids: records.map((record) => record.id) }),
    });
    if (!Array.isArray(ordered.items)) throw new Error("Сервер вернул некорректный порядок записей.");
    sharedContent[collection] = ordered.items;
    return;
  }

  const desiredIds = new Set(records.map((record) => record.id));
  for (const record of records) {
    const exists = sharedContent[collection].some((item) => item.id === record.id);
    const result = await requestApi(
      `content.php?collection=${collection}${exists ? `&id=${encodeURIComponent(record.id)}` : ""}`,
      { method: exists ? "PUT" : "POST", body: JSON.stringify(record) },
    );
    if (!Array.isArray(result.items)) throw new Error("Сервер вернул некорректный список записей.");
    sharedContent[collection] = result.items;
  }
  for (const record of [...sharedContent[collection]]) {
    if (desiredIds.has(record.id)) continue;
    const result = await requestApi(`content.php?collection=${collection}&id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
    if (!Array.isArray(result.items)) throw new Error("Сервер вернул некорректный список записей.");
    sharedContent[collection] = result.items;
  }
  const result = await requestApi(`content.php?collection=${collection}&action=order`, {
    method: "PUT",
    body: JSON.stringify({ ids: records.map((record) => record.id) }),
  });
  if (!Array.isArray(result.items)) throw new Error("Сервер вернул некорректный список записей.");
  sharedContent[collection] = result.items;
};

const normalizeBackupItems = (items, type) => {
  if (!Array.isArray(items) || items.length > 500) throw new Error(`Некорректные данные ${type}.`);
  return items.map((item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string") throw new Error(`Некорректная запись ${type}.`);
    const normalized = { ...item };
    ["id", "title", "tag", "description", "date", "time", "image", "spouseImage", "husbandFirstName", "husbandLastName", "wifeFirstName", "wifeLastName", "leader", "location", "day"].forEach((key) => {
      if (normalized[key] !== undefined && typeof normalized[key] !== "string") throw new Error(`Некорректное поле ${key}.`);
      const limit = ["image", "spouseImage"].includes(key) ? 5 * 1024 * 1024 : 12000;
      if (typeof normalized[key] === "string" && normalized[key].length > limit) throw new Error("Слишком большое текстовое поле.");
    });
    if (!isSafeImage(normalized.image || "") || !isSafeImage(normalized.spouseImage || "")) {
      throw new Error("Разрешены только изображения и безопасные HTTPS-ссылки.");
    }
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
    if (photo.id.length > 100 || photo.createdAt.length > 50 || typeof photo.image !== "string"
      || photo.image.length > maxStoredImageSize * 1.5 || !isSafeImage(photo.image)) {
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

const galleryImageAsDataUrl = async (image) => {
  if (typeof image !== "string") throw new Error("В резервной копии найдено некорректное фото.");
  if (image.startsWith("data:image/jpeg;base64,")) return image;
  const imageUrl = new URL(image, location.href);
  if (imageUrl.origin !== location.origin || !imageUrl.pathname.endsWith("/api/gallery-image.php")) {
    throw new Error("Не удалось безопасно прочитать фото галереи. Используйте резервную копию с этого сайта.");
  }
  const response = await fetch(imageUrl, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось скачать фотографию для резервной копии.");
  const blob = await response.blob();
  if (blob.type !== "image/jpeg" || blob.size > maxStoredImageSize) {
    throw new Error("Фото галереи имеет неподдерживаемый формат или слишком большой размер.");
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Не удалось подготовить фото для резервной копии."));
    });
    reader.addEventListener("error", () => reject(new Error("Не удалось прочитать фото для резервной копии.")));
    reader.readAsDataURL(blob);
  });
};

const createBackup = async () => JSON.stringify({
  format: "philadelphia-site-backup",
  version: backupVersion,
  exportedAt: new Date().toISOString(),
  events: readEvents(),
  leaders: readLeaders(),
  homeGroups: readRecords(homeGroupStorageKey),
  presbyters: readRecords(presbyterStorageKey),
  pageVisibility: sharedContent.pageVisibility,
  gallery: await Promise.all(readGalleryPhotos().map(async (photo) => ({
    ...photo,
    image: await galleryImageAsDataUrl(photo.image),
  }))),
}, null, 2);

const downloadBackup = async (automatic = false) => {
  try {
    const blob = new Blob([await createBackup()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `philadelphia-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (!automatic && backupMessage) backupMessage.textContent = "Резервная копия скачана.";
    return true;
  } catch (error) {
    console.error("Не удалось скачать резервную копию сайта.", error);
    if (backupMessage) {
      backupMessage.classList.add("form-message-error");
      backupMessage.textContent = error instanceof Error ? error.message : "Не удалось подготовить резервную копию.";
    }
    return false;
  }
};


const readEvents = () => {
  return sharedEvents;
};

const readLeaders = () => {
  return sharedContent.leaders;
};

const updatePageVisibilityControls = () => {
  document.querySelectorAll("#page-visibility-list [data-page-visibility]").forEach((input) => {
    const page = input.dataset.pageVisibility;
    if (page && Object.hasOwn(sharedContent.pageVisibility, page)) {
      input.checked = sharedContent.pageVisibility[page];
    }
  });
};

const loadSharedContent = async (migrateLegacyRecords = false) => {
  const allCollections = [...contentCollectionByStorageKey.values()];
  const collectionsToLoad = migrateLegacyRecords || leadersPageList || adminLeadersList
    ? allCollections
    : homeGroupsPreviewList ? ["homeGroups"] : [];
  for (const collection of collectionsToLoad) {
    const result = await requestApi(`content.php?collection=${collection}`);
    if (!Array.isArray(result.items)) throw new Error("Сервер вернул некорректное содержимое сайта.");
    sharedContent[collection] = result.items;
  }

  if (migrateLegacyRecords) {
    const legacyVisibilityDraft = localStorage.getItem("philadelphia-page-visibility-draft");
    if (legacyVisibilityDraft !== null) {
      let parsedDraft;
      try {
        parsedDraft = JSON.parse(legacyVisibilityDraft);
      } catch {
        throw new Error("Черновик видимости страниц в браузере повреждён. Не удалось перенести его на сервер.");
      }
      const draftVisibility = normalizePageVisibility(parsedDraft);
      const currentVisibility = await requestApi("content.php?collection=pageVisibility");
      if (typeof currentVisibility.stored !== "boolean") {
        throw new Error("Сервер не сообщил, сохранены ли настройки видимости страниц.");
      }
      if (!currentVisibility.stored) {
        const migratedVisibility = await requestApi("content.php?collection=pageVisibility", {
          method: "PUT",
          body: JSON.stringify({ pageVisibility: draftVisibility }),
        });
        sharedContent.pageVisibility = normalizePageVisibility(migratedVisibility.pageVisibility);
        updatePageVisibilityControls();
      }
    }

    for (const [storageKey, collection] of contentCollectionByStorageKey) {
      const legacyRecords = readLegacyRecords(storageKey);
      const existingIds = new Set(sharedContent[collection].map((record) => record.id));
      for (const record of legacyRecords) {
        if (!record || typeof record.id !== "string") {
          throw new Error("В старых данных браузера найдена запись без идентификатора. Сначала скачайте резервную копию и обратитесь за помощью.");
        }
        if (existingIds.has(record.id)) continue;
        const migrated = await requestApi(`content.php?collection=${collection}`, {
          method: "POST",
          body: JSON.stringify(record),
        });
        if (!Array.isArray(migrated.items)) throw new Error("Сервер вернул некорректный список записей.");
        sharedContent[collection] = migrated.items;
        existingIds.add(record.id);
      }
    }
    for (const storageKey of contentCollectionByStorageKey.keys()) localStorage.removeItem(storageKey);
    localStorage.removeItem("philadelphia-page-visibility-draft");
  }
  return sharedContent;
};

const readGalleryPhotos = () => {
  return sharedGalleryPhotos;
};

const replaceSharedGalleryPhotos = async (photos) => {
  const desiredIds = new Set(photos.map((photo) => photo.id));
  for (const photo of photos) {
    const image = await galleryImageAsDataUrl(photo.image);
    const existing = sharedGalleryPhotos.some((item) => item.id === photo.id);
    const result = await requestApi(
      existing ? `gallery.php?id=${encodeURIComponent(photo.id)}` : "gallery.php",
      {
        method: existing ? "PUT" : "POST",
        body: JSON.stringify({ ...photo, image }),
      },
    );
    if (!Array.isArray(result.photos)) throw new Error("Сервер вернул некорректный список фотографий.");
    sharedGalleryPhotos = result.photos;
  }

  for (const photo of [...sharedGalleryPhotos]) {
    if (desiredIds.has(photo.id)) continue;
    const result = await requestApi(`gallery.php?id=${encodeURIComponent(photo.id)}`, { method: "DELETE" });
    if (!Array.isArray(result.photos)) throw new Error("Сервер вернул некорректный список фотографий.");
    sharedGalleryPhotos = result.photos;
  }
};

const loadSharedGallery = async (migrateLegacyPhotos = false) => {
  const result = await requestApi("gallery.php");
  if (!Array.isArray(result.photos)) throw new Error("Сервер вернул некорректный список фотографий.");
  sharedGalleryPhotos = result.photos;
  sharedGalleryLoadError = null;

  if (migrateLegacyPhotos) {
    const legacyPhotos = readLegacyRecords(galleryStorageKey);
    const existingIds = new Set(sharedGalleryPhotos.map((photo) => photo.id));
    const photosToMigrate = legacyPhotos.filter((photo) => !existingIds.has(photo.id));
    for (const photo of photosToMigrate) {
      if (typeof photo.image !== "string" || !photo.image.startsWith("data:image/jpeg;base64,")) {
        throw new Error("В старой галерее есть фото неподдерживаемого формата. Скачайте резервную копию и обратитесь за помощью.");
      }
      const migrated = await requestApi("gallery.php", {
        method: "POST",
        body: JSON.stringify(photo),
      });
      if (!Array.isArray(migrated.photos)) throw new Error("Сервер вернул некорректный список фотографий.");
      sharedGalleryPhotos = migrated.photos;
      existingIds.add(photo.id);
    }
    if (photosToMigrate.length > 0) {
      localStorage.removeItem(galleryStorageKey);
      if (galleryFormMessage) {
        galleryFormMessage.textContent = `Перенесено на сервер фотографий: ${photosToMigrate.length}. Теперь они доступны всем посетителям.`;
      }
    }
  }
  return sharedGalleryPhotos;
};

const renderGallery = () => {
  if (galleryList) {
    galleryPhotos = readGalleryPhotos().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    galleryRenderedCount = 0;
    galleryList.replaceChildren();

    if (sharedGalleryLoadError) {
      galleryList.innerHTML = `<p class="gallery-empty">${escapeHtml(sharedGalleryLoadError.message)}</p>`;
      if (galleryLoadMoreButton) galleryLoadMoreButton.hidden = true;
    } else if (galleryPhotos.length) {
      renderNextGalleryBatch();
    } else if (galleryLoadMoreButton) {
      galleryList.innerHTML = '<p class="gallery-empty">Пока в галерее нет фотографий.</p>';
      galleryLoadMoreButton.hidden = true;
    } else {
      galleryList.innerHTML = '<p class="gallery-empty">Пока в галерее нет фотографий.</p>';
    }
  }

  if (adminGalleryList) {
    const photos = readGalleryPhotos().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const language = localStorage.getItem("philadelphia-language") || "ru";
    const photoLabel = language === "nl" ? "foto's" : language === "en" ? "photos" : "фото";
    if (galleryCount) galleryCount.textContent = `${photos.length} ${photoLabel}`;
    adminGalleryList.innerHTML = sharedGalleryLoadError
      ? `<p class="admin-record-empty form-message-error">${escapeHtml(sharedGalleryLoadError.message)}</p>`
      : photos.length
      ? photos.map((photo) => {
        const locale = language === "nl" ? "nl-BE" : language === "en" ? "en-GB" : "ru-RU";
        const date = new Date(photo.createdAt).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
        return `<article class="admin-event admin-gallery-photo"><img src="${escapeHtml(photo.image)}" alt="Предпросмотр фотографии" loading="lazy" /><div><strong>Фотография</strong><span><span>Добавлена</span> ${date}</span></div><button type="button" data-delete-gallery-photo="${escapeHtml(photo.id)}">Удалить</button></article>`;
      }).join("")
      : "<p>Пока нет добавленных фотографий.</p>";

    adminGalleryList.querySelectorAll("[data-delete-gallery-photo]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const result = await requestApi(`gallery.php?id=${encodeURIComponent(button.dataset.deleteGalleryPhoto)}`, { method: "DELETE" });
          if (!Array.isArray(result.photos)) throw new Error("Сервер вернул некорректный список фотографий.");
          sharedGalleryPhotos = result.photos;
          sharedGalleryLoadError = null;
          renderGallery();
        } catch (error) {
          console.error("Не удалось удалить фотографию с сервера.", error);
          button.disabled = false;
          const row = button.closest(".admin-gallery-photo");
          const message = document.createElement("p");
          message.className = "record-save-message form-message-error";
          message.textContent = error instanceof Error ? error.message : "Не удалось удалить фотографию.";
          row?.append(message);
        }
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
    const menuTrigger = document.createElement("button");
    menuTrigger.type = "button";
    menuTrigger.className = "gallery-photo-menu-trigger";
    menuTrigger.dataset.photoMenuTrigger = "";
    menuTrigger.setAttribute("aria-label", getDynamicLabel("photoActions"));
    menuTrigger.setAttribute("aria-haspopup", "menu");
    menuTrigger.setAttribute("aria-expanded", "false");
    const menuTriggerDots = document.createElement("span");
    menuTriggerDots.className = "gallery-photo-menu-trigger-dots";
    menuTriggerDots.setAttribute("aria-hidden", "true");
    menuTrigger.append(menuTriggerDots);
    figure.append(menuTrigger);
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
    dimEventImage: { ru: "Затемнять фотографию под текстом", nl: "Foto onder de tekst donkerder maken", en: "Darken the photo behind text" },
    image: { ru: "Фотография", nl: "Foto", en: "Photo" },
    noLeaders: { ru: "Пока нет добавленных лидеров служения.", nl: "Er zijn nog geen bedieningsleiders toegevoegd.", en: "No ministry leaders have been added yet." },
    noAdminRecords: { ru: "Пока нет записей.", nl: "Er zijn nog geen items.", en: "There are no entries yet." },
    noHomeGroups: { ru: "Домашние группы пока не добавлены.", nl: "Er zijn nog geen huiskringen toegevoegd.", en: "No home groups have been added yet." },
    noPresbyters: { ru: "Пресвитеры пока не добавлены.", nl: "Er zijn nog geen ouderlingen toegevoegd.", en: "No presbyters have been added yet." },
    createRecordError: { ru: "Не удалось добавить запись.", nl: "De invoer kon niet worden toegevoegd.", en: "Could not add the entry." },
    homeGroupAdded: { ru: "Домашняя группа добавлена.", nl: "Huiskring toegevoegd.", en: "Home group added." },
    presbyterAdded: { ru: "Пресвитерская семья добавлена.", nl: "Ouderlingenechtpaar toegevoegd.", en: "Presbyter family added." },
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
  let activeMenuTrigger = null;
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
    const previousFocusTarget = activeMenuTrigger || activeImage;
    if (activeMenu) {
      activeMenu.hidden = true;
      activeMenu.closest(".gallery-photo")?.classList.remove("is-actions-open");
    }
    activeMenuTrigger?.setAttribute("aria-expanded", "false");
    activeImage = null;
    activeMenu = null;
    activeMenuTrigger = null;
    if (restoreFocus) previousFocusTarget?.focus();
  };

  const showMenu = (image, trigger = null) => {
    const figure = image.closest(".gallery-photo");
    const menu = figure?.querySelector(".gallery-photo-menu");
    if (!(menu instanceof HTMLElement)) return;
    closeMenu();
    activeImage = image;
    activeMenu = menu;
    activeMenuTrigger = trigger;
    trigger?.setAttribute("aria-expanded", "true");
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
    if (!(image instanceof HTMLImageElement)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      closeMenu();
      showLightbox(image);
      return;
    }
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
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
      showLightbox(image);
    }
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
    const menuTrigger = event.target instanceof Element ? event.target.closest("[data-photo-menu-trigger]") : null;
    if (menuTrigger instanceof HTMLButtonElement) {
      const image = menuTrigger.closest(".gallery-photo")?.querySelector("img");
      if (!(image instanceof HTMLImageElement)) return;
      event.preventDefault();
      showMenu(image, menuTrigger);
      return;
    }
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
    presbyter: { ru: ["пресвитерская семья", "пресвитерские семьи", "пресвитерских семей"], nl: "ouderlingenechtparen", en: ["presbyter family", "presbyter families"] },
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

const translateCache = new Map();

const translateChunk = async (text, language) => {
  const key = `${language}|${text}`;
  if (translateCache.has(key)) return translateCache.get(key);
  const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ru|${language}`);
  if (!response.ok) throw new Error("Translation failed");
  const data = await response.json();
  const translated = String(data?.responseData?.translatedText || "");
  if (data?.responseStatus !== 200 || !translated || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(translated)) throw new Error("Translation failed");
  translateCache.set(key, translated);
  return translated;
};

// MyMemory accepts up to 500 characters per request, so long text is split by sentences.
const translateText = async (text, language) => {
  const chunks = [];
  let current = "";
  for (const part of text.match(/[^.!?\n]+[.!?\n]*\s*/g) || [text]) {
    if (current && (current + part).length > 450) { chunks.push(current); current = ""; }
    current += part;
  }
  if (current) chunks.push(current);
  const results = [];
  for (const chunk of chunks.flatMap((item) => item.length > 450 ? item.match(/[\s\S]{1,450}/g) : [item])) {
    results.push(chunk.trim() ? (await translateChunk(chunk.trim(), language)) : "");
  }
  return results.join(" ").trim();
};

// Fields left empty in the Dutch/English forms are translated automatically from the Russian source.
const createRecordTranslations = async (formData, translatableFields = ["title", "tag", "description"]) => {
  const entries = await Promise.all(contentLanguages.map(async (language) => {
    const values = await Promise.all(translatableFields.map(async (field) => {
      const manual = String(formData.get(`translations.${language}.${field}`) || "").trim();
      if (manual) return [field, manual];
      const source = String(formData.get(field) || "").trim();
      if (!source) return [field, ""];
      try {
        return [field, await translateText(source, language)];
      } catch {
        return [field, ""];
      }
    }));
    return [language, Object.fromEntries(values)];
  }));
  return Object.fromEntries(entries.filter(([, fields]) => Object.values(fields).some(Boolean)));
};

const splitLegacyPresbyterName = (record) => {
  const [firstName = "", ...lastNameParts] = String(record.title || "").trim().split(/\s+/);
  return { firstName, lastName: lastNameParts.join(" ") };
};

const getPresbyterFamilyTitle = (record) => {
  if (record.husbandFirstName && record.wifeFirstName) {
    return `${record.husbandFirstName} ${record.husbandLastName || ""} & ${record.wifeFirstName} ${record.wifeLastName || ""}`.trim();
  }
  return record.title || getDynamicLabel("presbyter");
};

const recordEditorMarkup = (record, type) => {
  const isHomeGroup = type === "homeGroup";
  const isPresbyter = type === "presbyter";
  const legacyName = isPresbyter ? splitLegacyPresbyterName(record) : { firstName: "", lastName: "" };
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
    : isPresbyter
      ? `<fieldset class="presbyter-person-fields"><legend>Муж</legend>
        <label>Имя мужа<input name="husbandFirstName" value="${escapeHtml(record.husbandFirstName || legacyName.firstName)}" required /></label>
        <label>Фамилия мужа<input name="husbandLastName" value="${escapeHtml(record.husbandLastName || legacyName.lastName)}" required /></label>
        <label>Фото мужа<input name="image" type="file" accept="image/*" />${record.image ? `<img class="admin-edit-image" src="${escapeHtml(record.image)}" alt="Фото мужа" loading="lazy" />` : ""}</label>
      </fieldset>
      <fieldset class="presbyter-person-fields"><legend>Жена</legend>
        <label>Имя жены<input name="wifeFirstName" value="${escapeHtml(record.wifeFirstName || "")}" required /></label>
        <label>Фамилия жены<input name="wifeLastName" value="${escapeHtml(record.wifeLastName || "")}" required /></label>
        <label>Фото жены<input name="spouseImage" type="file" accept="image/*" />${record.spouseImage ? `<img class="admin-edit-image" src="${escapeHtml(record.spouseImage)}" alt="Фото жены" loading="lazy" />` : ""}</label>
      </fieldset>`
    : `<fieldset><legend>${getDynamicLabel("source")}</legend>
    <label>${fieldLabels.title}<input name="title" value="${escapeHtml(record.title || "")}" required /></label>
    ${type === "event" ? `<label>${getDynamicLabel("date")}<input name="date" type="date" value="${escapeHtml(record.date || "")}" /></label><label>${getDynamicLabel("time")}<input name="time" type="time" value="${escapeHtml(formatEventTime(record.time || ""))}" /></label><label class="event-dimming-option"><input name="dimImage" type="checkbox"${record.dimImage !== false ? " checked" : ""} /> ${getDynamicLabel("dimEventImage")}</label>` : ""}
    <label>${fieldLabels.tag}<input name="tag" value="${escapeHtml(record.tag || "")}" /></label>
    <label>${fieldLabels.description}<textarea name="description" rows="3">${escapeHtml(record.description || "")}</textarea></label>
  </fieldset>`;
  const translationKeys = isHomeGroup ? ["leader", "location", "description"] : isPresbyter ? [] : ["title", "tag", "description"];
  const translationLabels = isHomeGroup ? fieldLabels : { ...fieldLabels, description: getDynamicLabel("description") };
  const translationFields = isPresbyter ? "" : contentLanguages.map((language) => {
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
  return `<details class="admin-record-editor"><summary>${getDynamicLabel("editRecord")}</summary><form data-record-editor="${type}" data-record-id="${escapeHtml(record.id)}">${sourceFields}${translationFields}${isPresbyter ? "" : `<label>${getDynamicLabel("image")}<input name="image" type="file" accept="image/*" /></label><img class="admin-edit-image" src="${escapeHtml(record.image || "")}" alt="${getDynamicLabel("image")}" loading="lazy" />`}<button class="button button-dark" type="submit">${getDynamicLabel("saveRecord")}</button><p class="record-save-message" role="status"></p></form></details>`;
};

const bindRecordEditors = (container, storageKey, type, render) => {
  container.querySelectorAll("form[data-record-editor]").forEach((form) => {
    form.addEventListener("submit", async (submitEvent) => {
      submitEvent.preventDefault();
      const message = form.querySelector(".record-save-message");
      try {
        const records = type === "event" ? readEvents() : readRecords(storageKey);
        const record = records.find((item) => item.id === form.dataset.recordId);
        if (!record) throw new Error("Запись не найдена. Обновите страницу и попробуйте снова.");

        const formData = new FormData(form);
        const [uploadedImage, uploadedSpouseImage] = await Promise.all([
          prepareUploadedImage(formData.get("image")),
          type === "presbyter" ? prepareUploadedImage(formData.get("spouseImage")) : "",
        ]);
        const image = uploadedImage.dataUrl;
        const spouseImage = typeof uploadedSpouseImage === "string" ? "" : uploadedSpouseImage.dataUrl;
        const updatedRecord = {
          ...record,
          ...(type === "presbyter" ? {} : {
            description: String(formData.get("description") || "").trim(),
            translations: await createRecordTranslations(formData, type === "homeGroup" ? ["leader", "location", "description"] : undefined),
          }),
          image: image || record.image,
          ...(type === "presbyter" ? { spouseImage: spouseImage || record.spouseImage || "" } : {}),
        };
        if (type === "homeGroup") {
          updatedRecord.leader = String(formData.get("leader") || "").trim();
          updatedRecord.location = String(formData.get("location") || "").trim();
          updatedRecord.day = String(formData.get("day") || "");
        } else if (type === "presbyter") {
          updatedRecord.husbandFirstName = String(formData.get("husbandFirstName") || "").trim();
          updatedRecord.husbandLastName = String(formData.get("husbandLastName") || "").trim();
          updatedRecord.wifeFirstName = String(formData.get("wifeFirstName") || "").trim();
          updatedRecord.wifeLastName = String(formData.get("wifeLastName") || "").trim();
          updatedRecord.title = getPresbyterFamilyTitle(updatedRecord);
        } else {
          updatedRecord.title = String(formData.get("title") || "").trim();
          updatedRecord.tag = String(formData.get("tag") || "").trim();
        }
        if (type === "event") {
          updatedRecord.date = String(formData.get("date") || "");
          updatedRecord.time = String(formData.get("time") || "");
          updatedRecord.dimImage = formData.get("dimImage") === "on";
          updatedRecord.imageAspectRatio = 0.8;
        }
        if ((type === "homeGroup" && (!updatedRecord.leader || !updatedRecord.location || !updatedRecord.day || !updatedRecord.description))
          || (type === "presbyter" && (!updatedRecord.husbandFirstName || !updatedRecord.husbandLastName || !updatedRecord.wifeFirstName || !updatedRecord.wifeLastName))
          || (type !== "homeGroup" && type !== "presbyter" && !updatedRecord.title)) {
          throw new Error("Заполните все обязательные поля.");
        }

        if (type === "event") {
          const result = await requestApi(`events.php?id=${encodeURIComponent(updatedRecord.id)}`, {
            method: "PUT",
            body: JSON.stringify(updatedRecord),
          });
          sharedEvents = result.events;
        } else {
          const collection = contentCollectionByStorageKey.get(storageKey);
          if (!collection) throw new Error("Неизвестный раздел содержимого сайта.");
          const result = await requestApi(`content.php?collection=${collection}&id=${encodeURIComponent(updatedRecord.id)}`, {
            method: "PUT",
            body: JSON.stringify(updatedRecord),
          });
          if (!Array.isArray(result.items)) throw new Error("Сервер вернул некорректный список записей.");
          sharedContent[collection] = result.items;
        }
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

const presbyterFamilyCardMarkup = (record) => {
  const hasFamilyNames = record.husbandFirstName && record.husbandLastName && record.wifeFirstName && record.wifeLastName;
  const husbandImage = record.image || "";
  const wifeImage = record.spouseImage || "";
  const husbandPhoto = `<div class="presbyter-portrait${husbandImage ? "" : " presbyter-portrait-placeholder"}" ${husbandImage ? `style="background-image:url('${escapeHtml(husbandImage)}')"` : 'aria-hidden="true"'}></div>`;
  const wifePhoto = `<div class="presbyter-portrait${wifeImage ? "" : " presbyter-portrait-placeholder"}" ${wifeImage ? `style="background-image:url('${escapeHtml(wifeImage)}')"` : 'aria-hidden="true"'}></div>`;
  const people = hasFamilyNames
    ? `<div class="presbyter-portraits">${husbandPhoto}${wifePhoto}</div>
      <div class="presbyter-family-names">
        <p class="presbyter-person-name"><span class="presbyter-first-name">${escapeHtml(record.husbandFirstName)}</span><span class="presbyter-last-name">${escapeHtml(record.husbandLastName)}</span></p>
        <span class="presbyter-couple-mark" aria-hidden="true">♡</span>
        <p class="presbyter-person-name"><span class="presbyter-first-name">${escapeHtml(record.wifeFirstName)}</span><span class="presbyter-last-name">${escapeHtml(record.wifeLastName)}</span></p>
      </div>`
    : `<div class="presbyter-portraits presbyter-portraits-single">${husbandPhoto}</div>
      <p class="presbyter-person-name presbyter-person-name-legacy">${escapeHtml(record.title || getDynamicLabel("presbyter"))}</p>`;
  return `<article class="presbyter-family-card">${people}</article>`;
};

const renderDirectory = (records, list, emptyLabel, type, compact = false) => {
  if (!list) return;
  list.innerHTML = sharedContentLoadError
    ? `<p class="directory-empty">${escapeHtml(sharedContentLoadError.message)}</p>`
    : records.length
    ? records.map((record) => type === "homeGroup"
      ? homeGroupCardMarkup(record, compact)
      : type === "presbyter"
        ? presbyterFamilyCardMarkup(record)
      : leaderCardMarkup(record, compact, type)).join("")
    : `<p class="directory-empty">${getDynamicLabel(emptyLabel)}</p>`;
};

const renderAdminDirectory = (records, container, storageKey, type, render) => {
  if (!container) return;
  updateAdminRecordCount(container, records.length, type);
  container.innerHTML = sharedContentLoadError
    ? `<p class="admin-record-empty form-message-error">${escapeHtml(sharedContentLoadError.message)}</p>`
    : records.length
    ? records.map((record, index) => {
      const title = type === "homeGroup"
        ? getLocalizedHomeGroupField(record, "leader")
        : type === "presbyter" ? getPresbyterFamilyTitle(record) : getLocalizedRecordField(record, "title");
      const details = type === "homeGroup"
        ? [getLocalizedHomeGroupField(record, "location"), record.day ? getDynamicLabel(record.day) : ""].filter(Boolean).join(" · ")
        : type === "presbyter" ? getDynamicLabel("presbyter") : getLocalizedRecordField(record, "tag") || getDynamicLabel(type);
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
      button.addEventListener("click", async () => {
        const storedRecords = readRecords(storageKey);
        const currentIndex = storedRecords.findIndex((record) => record.id === button.dataset.recordId);
        const direction = button.dataset.moveHomeGroup === "up" ? -1 : 1;
        const nextIndex = currentIndex + direction;
        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= storedRecords.length) return;

        [storedRecords[currentIndex], storedRecords[nextIndex]] = [storedRecords[nextIndex], storedRecords[currentIndex]];
        try {
          await replaceSharedRecords(storageKey, storedRecords, true);
        } catch (error) {
          const message = button.closest(".admin-event")?.querySelector(".record-order-message");
          if (message) {
            message.hidden = false;
            message.textContent = `Не удалось сохранить порядок домашних групп: ${error instanceof Error ? error.message : "ошибка сервера."}`;
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
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const collection = contentCollectionByStorageKey.get(storageKey);
        if (!collection) throw new Error("Неизвестный раздел содержимого сайта.");
        const result = await requestApi(`content.php?collection=${collection}&id=${encodeURIComponent(button.dataset.deleteRecord)}`, { method: "DELETE" });
        if (!Array.isArray(result.items)) throw new Error("Сервер вернул некорректный список записей.");
        sharedContent[collection] = result.items;
        render();
      } catch (error) {
        button.disabled = false;
        const row = button.closest(".admin-event");
        const message = document.createElement("p");
        message.className = "record-save-message form-message-error";
        message.textContent = error instanceof Error ? error.message : "Не удалось удалить запись с сервера.";
        row?.append(message);
      }
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

const setupPeopleListAutoScroll = (lists) => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  lists.forEach((list) => {
    if (!list) return;

    let isHovered = false;
    let isFocused = false;
    let pauseUntil = 0;

    const pauseAfterInteraction = () => {
      pauseUntil = Date.now() + 6000;
    };

    list.addEventListener("pointerenter", () => { isHovered = true; });
    list.addEventListener("pointerleave", () => { isHovered = false; });
    list.addEventListener("focusin", () => { isFocused = true; });
    list.addEventListener("focusout", (event) => {
      if (!list.contains(event.relatedTarget)) isFocused = false;
    });
    list.addEventListener("pointerdown", pauseAfterInteraction);
    list.addEventListener("touchstart", pauseAfterInteraction, { passive: true });
    list.addEventListener("wheel", pauseAfterInteraction, { passive: true });
    list.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
        pauseAfterInteraction();
      }
    });

    window.setInterval(() => {
      const firstCard = list.firstElementChild;
      if (
        document.hidden
        || isHovered
        || isFocused
        || Date.now() < pauseUntil
        || list.children.length < 2
        || list.scrollWidth <= list.clientWidth + 1
        || !firstCard
      ) return;

      const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
      const step = firstCard.getBoundingClientRect().width + gap;
      const atEnd = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
      list.scrollTo({
        left: atEnd ? 0 : list.scrollLeft + step,
        behavior: "smooth",
      });
    }, 3000);
  });
};

const renderLeaders = () => {
  const leaders = readLeaders();
  if (leadersPageList) {
    leadersPageList.innerHTML = sharedContentLoadError
      ? `<div class="leader-empty">${escapeHtml(sharedContentLoadError.message)}</div>`
      : leaders.length ? leaders.map((leader) => leaderCardMarkup(leader)).join("") : `<div class="leader-empty">${getDynamicLabel("noLeaders")}</div>`;
  }
  if (adminLeadersList) {
    updateAdminRecordCount(adminLeadersList, leaders.length, "leader");
    adminLeadersList.innerHTML = sharedContentLoadError
      ? `<p class="admin-record-empty form-message-error">${escapeHtml(sharedContentLoadError.message)}</p>`
      : leaders.length ? leaders.map((leader) => `<article class="admin-event"><div><strong>${escapeHtml(getLocalizedRecordField(leader, "title"))}</strong><span>${escapeHtml(getLocalizedRecordField(leader, "tag") || getDynamicLabel("service"))}</span></div><button type="button" data-delete-leader="${escapeHtml(leader.id)}">${getDynamicLabel("remove")}</button>${recordEditorMarkup(leader, "leader")}</article>`).join("") : `<p class="admin-record-empty">${getDynamicLabel("noAdminRecords")}</p>`;
    bindRecordEditors(adminLeadersList, leaderStorageKey, "leader", renderLeaders);
    adminLeadersList.querySelectorAll("[data-delete-leader]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const result = await requestApi(`content.php?collection=leaders&id=${encodeURIComponent(button.dataset.deleteLeader)}`, { method: "DELETE" });
          if (!Array.isArray(result.items)) throw new Error("Сервер вернул некорректный список лидеров.");
          sharedContent.leaders = result.items;
          renderLeaders();
        } catch (error) {
          button.disabled = false;
          const row = button.closest(".admin-event");
          const message = document.createElement("p");
          message.className = "record-save-message form-message-error";
          message.textContent = error instanceof Error ? error.message : "Не удалось удалить лидера с сервера.";
          row?.append(message);
        }
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
  (a.date ? (b.date ? a.date.localeCompare(b.date) : -1) : (b.date ? 1 : 0))
    || formatEventTime(a.time).localeCompare(formatEventTime(b.time))
);

const getUpcomingEvents = () => {
  const now = new Date();
  const maxDate = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());

  return readEvents()
    .filter((event) => {
      if (!event.date) return true;
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

    if (sharedEventsLoadError) {
      eventsList.innerHTML = `<div class="event-empty">${escapeHtml(pageLanguage === "nl" ? "Evenementen konden niet van de server worden geladen. Probeer het later opnieuw." : pageLanguage === "en" ? "Events could not be loaded from the server. Please try again later." : "События не удалось загрузить с сервера. Попробуйте позже.")}</div>`;
    } else if (!events.length) {
      eventsList.innerHTML = `<div class="event-empty">${getDynamicLabel("noEvents")}</div>`;
    } else {
      events.forEach((event) => {
        const card = document.createElement("article");
        card.className = `event-card event-card-cover custom-event${event.dimImage === false ? " event-card-no-dimming" : ""}`;
        card.style.setProperty("--event-bg", `url("${String(event.image || "").replace(/["\\\n\r]/g, "")}")`);
        const date = event.date ? formatEventDate(event.date) : null;
        const description = getLocalizedRecordField(event, "description");
        const time = formatEventTime(event.time);
        card.innerHTML = `<img class="event-cover-image" src="${escapeHtml(event.image)}" alt="${escapeHtml(getLocalizedRecordField(event, "title"))}" loading="lazy" />${date ? `<span class="event-cover-date">${date.day} ${date.month}</span>` : ""}<div class="event-cover-content">${getLocalizedRecordField(event, "tag") ? `<p class="tag">${escapeHtml(getLocalizedRecordField(event, "tag"))}</p>` : ""}<h3>${escapeHtml(getLocalizedRecordField(event, "title"))}</h3>${description ? `<p class="event-description">${escapeHtml(description)}</p>` : ""}${time ? `<p class="event-meta">${escapeHtml(time)}</p>` : ""}</div>`;
        eventsList.append(card);
      });
    }
  }

  if (adminEventsList) {
    const allEvents = readEvents().sort(compareEventsByDate);
    updateAdminRecordCount(adminEventsList, allEvents.length, "event");
    adminEventsList.innerHTML = sharedEventsLoadError
      ? `<p class="admin-record-empty form-message-error">${escapeHtml(sharedEventsLoadError.message)}</p>`
      : allEvents.length
      ? allEvents.map((event) => `<article class="admin-event"><div><strong>${escapeHtml(getLocalizedRecordField(event, "title"))}</strong><span>${escapeHtml([event.date, formatEventTime(event.time)].filter(Boolean).join(" · ") || ({ ru: "Без даты", nl: "Geen datum", en: "No date" }[getCurrentLanguage()]))}</span></div><button type="button" data-delete-event="${escapeHtml(event.id)}">${getDynamicLabel("remove")}</button>${recordEditorMarkup(event, "event")}</article>`).join("")
      : `<p class="admin-record-empty">${getDynamicLabel("noAdminRecords")}</p>`;

    bindRecordEditors(adminEventsList, null, "event", renderEvents);
    adminEventsList.querySelectorAll("[data-delete-event]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const result = await requestApi(`events.php?id=${encodeURIComponent(button.dataset.deleteEvent)}`, { method: "DELETE" });
          sharedEvents = result.events;
          renderEvents();
        } catch (error) {
          console.error("Не удалось удалить событие на сервере.", error);
          button.disabled = false;
          const row = button.closest(".admin-event");
          const message = document.createElement("p");
          message.className = "record-save-message form-message-error";
          message.textContent = error instanceof Error ? error.message : "Не удалось удалить событие.";
          row?.append(message);
        }
      });
    });
  }

};

const loadSharedEvents = async () => {
  try {
    const result = await requestApi("events.php");
    if (!Array.isArray(result.events)) throw new Error("Сервер вернул некорректный список событий.");
    sharedEvents = result.events;
    sharedEventsLoadError = null;
    sharedEventsLoaded = true;
  } catch (error) {
    sharedEventsLoadError = error instanceof Error ? error : new Error("Не удалось загрузить события с сервера.");
    sharedEventsLoaded = false;
    console.error("Не удалось загрузить общие события с сервера.", sharedEventsLoadError);
  }
  renderEvents();
  return sharedEventsLoaded;
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
      const uploadedImage = await prepareUploadedImage(formData.get("image"));
      const leader = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: String(formData.get("title") || "").trim(),
        tag: String(formData.get("tag") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        translations: await createRecordTranslations(formData),
        image: uploadedImage.dataUrl || "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80",
      };
      if (await saveAdminRecord(leaderStorageKey, leader, messageElement, "Лидер добавлен на сайт.", renderLeaders)) {
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
      const isPresbyter = type === "presbyter";
      const [uploadedImage, uploadedSpouseImage] = await Promise.all([
        prepareUploadedImage(formData.get("image")),
        isPresbyter ? prepareUploadedImage(formData.get("spouseImage")) : Promise.resolve({ dataUrl: "", aspectRatio: null }),
      ]);
      const record = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        description: isPresbyter ? "" : String(formData.get("description") || "").trim(),
        translations: isPresbyter ? {} : await createRecordTranslations(formData, type === "homeGroup" ? ["leader", "location", "description"] : undefined),
        image: uploadedImage.dataUrl || (isPresbyter ? "" : "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80"),
        ...(isPresbyter ? { spouseImage: uploadedSpouseImage.dataUrl } : {}),
      };
      if (type === "homeGroup") {
        record.leader = String(formData.get("leader") || "").trim();
        record.location = String(formData.get("location") || "").trim();
        record.day = String(formData.get("day") || "");
        if (!record.leader || !record.location || !record.day || !record.description) {
          throw new Error("Заполните имя лидера, место/район, день недели и описание.");
        }
      } else {
        record.husbandFirstName = String(formData.get("husbandFirstName") || "").trim();
        record.husbandLastName = String(formData.get("husbandLastName") || "").trim();
        record.wifeFirstName = String(formData.get("wifeFirstName") || "").trim();
        record.wifeLastName = String(formData.get("wifeLastName") || "").trim();
        record.title = getPresbyterFamilyTitle(record);
        record.tag = "Пресвитерская семья";
        if (!record.husbandFirstName || !record.husbandLastName || !record.wifeFirstName || !record.wifeLastName || !uploadedImage.dataUrl || !uploadedSpouseImage.dataUrl) {
          throw new Error("Заполните имя и фамилию обоих супругов и добавьте обе фотографии.");
        }
      }
      const successMessage = type === "homeGroup" ? getDynamicLabel("homeGroupAdded") : getDynamicLabel("presbyterAdded");
      if (await saveAdminRecord(storageKey, record, message, successMessage, render)) form.reset();
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
      if (!await sharedEventsReady && !await loadSharedEvents()) {
        throw sharedEventsLoadError || new Error("Не удалось подключиться к серверу событий.");
      }
      const uploadedImage = await prepareUploadedImage(formData.get("image"));
      const event = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: String(formData.get("title") || "").trim(),
        date: String(formData.get("date") || ""),
        time: String(formData.get("time") || ""),
        tag: String(formData.get("tag") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        translations: await createRecordTranslations(formData),
        image: uploadedImage.dataUrl || "https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=900&q=80",
        imageAspectRatio: 0.8,
        dimImage: formData.get("dimImage") === "on",
      };
      const result = await requestApi("events.php", { method: "POST", body: JSON.stringify(event) });
      sharedEvents = result.events;
      renderEvents();
      messageElement.classList.remove("form-message-error");
      messageElement.textContent = "Событие опубликовано для всех посетителей.";
      eventForm.reset();
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
      await sharedGalleryReady;
      if (sharedGalleryLoadError) throw sharedGalleryLoadError;
      const uploadedImage = await prepareUploadedImage(fileInput?.files?.[0]);
      if (!uploadedImage.dataUrl) throw new Error("Выберите фотографию перед добавлением.");

      const photo = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(),
        image: uploadedImage.dataUrl,
      };
      const result = await requestApi("gallery.php", {
        method: "POST",
        body: JSON.stringify(photo),
      });
      if (!Array.isArray(result.photos)) throw new Error("Сервер вернул некорректный список фотографий.");
      sharedGalleryPhotos = result.photos;
      sharedGalleryLoadError = null;
      renderGallery();
      galleryForm.reset();
      galleryFormMessage.classList.remove("form-message-error");
      galleryFormMessage.textContent = "Фотография сохранена на сервере и теперь доступна всем посетителям.";
    } catch (error) {
      galleryFormMessage.classList.add("form-message-error");
      galleryFormMessage.textContent = error instanceof Error ? error.message : "Не удалось добавить фотографию. Проверьте файл и попробуйте снова.";
    }
  });
}

if (exportBackupButton) {
  exportBackupButton.addEventListener("click", async () => {
    exportBackupButton.disabled = true;
    if (backupMessage) {
      backupMessage.classList.remove("form-message-error");
      backupMessage.textContent = "Подготавливается резервная копия…";
    }
    try {
      await sharedEventsReady;
      if (sharedEventsLoadError) throw sharedEventsLoadError;
      await sharedContentReady;
      if (sharedContentLoadError) throw sharedContentLoadError;
      await sharedGalleryReady;
      if (sharedGalleryLoadError) throw sharedGalleryLoadError;
      await downloadBackup();
    } finally {
      exportBackupButton.disabled = false;
    }
  });
}

if (importBackupInput) {
  importBackupInput.addEventListener("change", () => {
    const file = importBackupInput.files?.[0];
    importBackupInput.value = "";
    if (!file) return;
    if (file.size > maxBackupSize) {
      if (backupMessage) backupMessage.textContent = "Файл слишком большой. Максимальный размер — 100 МБ.";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      try {
        const backup = JSON.parse(String(reader.result));
        if (backup.format !== "philadelphia-site-backup" || backup.version !== backupVersion) throw new Error("Файл создан в несовместимом формате.");
        const events = normalizeBackupItems(backup.events, "событий");
        const leaders = normalizeBackupItems(backup.leaders, "лидеров");
        const homeGroups = normalizeDirectoryBackupItems(backup.homeGroups, "домашних групп", homeGroupStorageKey);
        const presbyters = normalizeDirectoryBackupItems(backup.presbyters, "пресвитеров", presbyterStorageKey);
        const gallery = normalizeGalleryBackupItems(backup.gallery);
        const pageVisibility = normalizePageVisibility(backup.pageVisibility || sharedContent.pageVisibility);
        if (!window.confirm(`Заменить текущие данные на сервере?\n\nСобытия: ${events.length}\nЛидеры: ${leaders.length}\nДомашние группы: ${homeGroups.length}\nПресвитеры: ${presbyters.length}\nФотографии галереи: ${gallery.length}\n\nПеред заменой текущая копия будет скачана.`)) return;
        await sharedEventsReady;
        if (sharedEventsLoadError) throw sharedEventsLoadError;
        await sharedGalleryReady;
        if (sharedGalleryLoadError) throw sharedGalleryLoadError;
        await sharedContentReady;
        if (sharedContentLoadError) throw sharedContentLoadError;
        if (!await downloadBackup(true)) throw new Error("Не удалось создать резервную копию перед импортом.");
        const result = await requestApi("events.php", {
          method: "PUT",
          body: JSON.stringify({ events }),
        });
        sharedEvents = result.events;
        await replaceSharedRecords(leaderStorageKey, leaders);
        await replaceSharedRecords(homeGroupStorageKey, homeGroups);
        await replaceSharedRecords(presbyterStorageKey, presbyters);
        const visibilityResult = await requestApi("content.php?collection=pageVisibility", {
          method: "PUT",
          body: JSON.stringify({ pageVisibility }),
        });
        sharedContent.pageVisibility = normalizePageVisibility(visibilityResult.pageVisibility);
        await replaceSharedGalleryPhotos(gallery);
        for (const storageKey of contentCollectionByStorageKey.keys()) localStorage.removeItem(storageKey);
        localStorage.removeItem(galleryStorageKey);
        sharedEventsReady = loadSharedEvents();
        sharedContentReady = loadSharedContent()
          .then(() => {
            sharedContentLoadError = null;
            renderLeaders();
            renderHomeGroups();
            renderPresbyters();
          })
          .catch((error) => {
            sharedContentLoadError = error instanceof Error ? error : new Error("Не удалось загрузить общее содержимое сайта.");
            renderLeaders();
            renderHomeGroups();
            renderPresbyters();
            console.error("Не удалось загрузить общее содержимое сайта.", sharedContentLoadError);
          });
        renderGallery();
        if (backupMessage) backupMessage.textContent = "Данные успешно восстановлены.";
      } catch (error) {
        if (backupMessage) backupMessage.textContent = error instanceof Error ? error.message : "Не удалось импортировать файл.";
      }
    });
    reader.readAsText(file);
  });
}

sharedEventsReady = loadSharedEvents();
renderLeaders();
renderHomeGroups();
renderPresbyters();
setupPeopleListAutoScroll([homeGroupsPreviewList, homeGroupsList, presbytersList]);
if (galleryList) {
  sharedGalleryReady = loadSharedGallery()
    .then(() => renderGallery())
    .catch((error) => {
      sharedGalleryLoadError = error instanceof Error ? error : new Error("Не удалось загрузить общую галерею с сервера.");
      renderGallery();
      console.error("Не удалось загрузить общую галерею с сервера.", sharedGalleryLoadError);
    });
} else if (!adminGalleryList) {
  renderGallery();
}
setupGalleryPhotoActions();
