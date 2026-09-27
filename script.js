const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".main-nav");
const adminContent = document.querySelector("#admin-content");
const loginScreen = document.querySelector("#login-screen");
const loginForm = document.querySelector("#login-form");
const logoutButton = document.querySelector("#logout-button");
const adminSessionKey = "philadelphia-admin-auth";
const adminPassword = "admin";

const showAdmin = () => {
  if (adminContent) adminContent.hidden = false;
  if (loginScreen) loginScreen.hidden = true;
  if (logoutButton) logoutButton.hidden = false;
};

if (adminContent && loginScreen) {
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
    sessionStorage.removeItem(adminSessionKey);
  });

  document.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", () => {
      const destination = link.getAttribute("href");
      if (destination && !destination.startsWith("#")) {
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
const leadersList = document.querySelector("#leaders-list");
const leadersPageList = document.querySelector("#leaders-page-list");
const adminLeadersList = document.querySelector("#admin-leaders-list");
const leaderForm = document.querySelector("#leader-form");
const leaderStorageKey = "philadelphia-leaders";
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
  try {
    const records = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(records)) throw new Error("Сохранённые данные повреждены. Сначала скачайте резервную копию.");
    localStorage.setItem(storageKey, JSON.stringify([record, ...records]));
  } catch (error) {
    const isStorageFull = error instanceof DOMException
      && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
    messageElement.textContent = isStorageFull
      ? "Не удалось сохранить: в браузере закончилось место. Удалите старые события или лидеров либо освободите место и попробуйте снова."
      : `Не удалось сохранить: ${error instanceof Error ? error.message : "неизвестная ошибка браузера."}`;
    messageElement.classList.add("form-message-error");
    return false;
  }

  render();
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

const createBackup = () => JSON.stringify({
  format: "philadelphia-site-backup",
  version: backupVersion,
  exportedAt: new Date().toISOString(),
  events: readEvents(),
  leaders: readLeaders(),
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

const leaderCardMarkup = (leader, compact = false) => {
  const cardClass = compact ? "leader-preview-card" : "leader-card";
  const photoClass = compact ? "leader-preview-photo" : "leader-photo";
  const infoClass = compact ? "leader-preview-info" : "leader-info";
  return `<article class="${cardClass}"><div class="${photoClass}" style="background-image:url('${leader.image}')"></div><div class="${infoClass}"><div><p>${leader.tag || "Служение"}</p><h3>${leader.title}</h3>${compact ? `<a href="leaders.html">Подробнее <span>→</span></a>` : `<small>${leader.description}</small>`}</div>${compact ? "" : "<span>↗</span>"}</div></article>`;
};

const renderLeaders = () => {
  const leaders = readLeaders();
  if (leadersList) {
    leadersList.innerHTML = leaders.length ? leaders.slice(0, 3).map((leader) => leaderCardMarkup(leader, true)).join("") : '<div class="leader-empty">Пока нет добавленных лидеров служения.</div>';
  }
  if (leadersPageList) {
    leadersPageList.innerHTML = leaders.length ? leaders.map((leader) => leaderCardMarkup(leader)).join("") : '<div class="leader-empty">Пока нет добавленных лидеров служения.</div>';
  }
  if (adminLeadersList) {
    const count = document.querySelector("#leaders-count");
    if (count) count.textContent = `${leaders.length} ${leaders.length === 1 ? "лидер" : "лидеров"}`;
    adminLeadersList.innerHTML = leaders.length ? leaders.map((leader) => `<article class="admin-event"><div><strong>${leader.title}</strong><span>${leader.tag || "Служение"}</span></div><button type="button" data-delete-leader="${leader.id}">Удалить</button></article>`).join("") : "<p>Пока нет созданных лидеров.</p>";
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
  return {
    day: parsed.toLocaleDateString("ru-RU", { day: "2-digit" }),
    month: parsed.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "").toUpperCase(),
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
      eventsList.innerHTML = '<div class="event-empty">Сейчас нет событий ближайшие 3 месяца.</div>';
    } else {
      events.forEach((event) => {
        const date = formatEventDate(event.date);
        const card = document.createElement("article");
        card.className = "event-card event-card-cover custom-event";
        card.innerHTML = `<img class="event-cover-image" src="${escapeHtml(event.image)}" alt="${escapeHtml(event.title)}" loading="lazy" /><span class="event-cover-date">${date.day} ${date.month}</span><div class="event-cover-content"><p class="tag">${escapeHtml(event.tag || "Событие")}</p><h3>${escapeHtml(event.title)}</h3><p class="event-description">${escapeHtml(event.description)}</p><p class="event-meta">${escapeHtml(formatEventTime(event.time))}</p></div>`;
        eventsList.append(card);
      });
    }
  }

  if (adminEventsList) {
    const allEvents = readEvents().sort(compareEventsByDate);
    const count = document.querySelector("#events-count");
    if (count) count.textContent = `${allEvents.length} ${allEvents.length === 1 ? "событие" : "событий"}`;
    adminEventsList.innerHTML = allEvents.length
      ? allEvents.map((event) => `<article class="admin-event"><div><strong>${event.title}</strong><span>${event.date} · ${formatEventTime(event.time)}</span></div><button type="button" data-delete-event="${event.id}">Удалить</button></article>`).join("")
      : "<p>Пока нет созданных событий.</p>";

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
        if (!window.confirm(`Заменить текущие данные?\n\nСобытия: ${events.length}\nЛидеры: ${leaders.length}\n\nПеред заменой текущая копия будет скачана.`)) return;
        downloadBackup(true);
        localStorage.setItem(eventStorageKey, JSON.stringify(events));
        localStorage.setItem(leaderStorageKey, JSON.stringify(leaders));
        renderEvents();
        renderLeaders();
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
