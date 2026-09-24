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

const getUpcomingEvents = () => {
  const now = new Date();
  const maxDate = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());

  return readEvents()
    .filter((event) => {
      if (!event.date) return false;
      const eventDate = new Date(`${event.date}T00:00:00`);
      return eventDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && eventDate <= maxDate;
    })
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`))
    .slice(0, 3);
};

const renderEvents = () => {
  const events = getUpcomingEvents();

  if (eventsList) {
    eventsList.innerHTML = "";

    if (!events.length) {
      eventsList.innerHTML = '<div class="event-empty">Сейчас нет событий ближайшие 3 месяца.</div>';
    } else {
      events.slice().reverse().forEach((event, index) => {
        const date = formatEventDate(event.date);
        const card = document.createElement("article");
        card.className = `event-card custom-event${index === events.length - 1 ? " event-featured" : ""}`;
        card.innerHTML = `<div class="event-image" style="background-image:url('${event.image}')"></div><div class="event-body"><div class="date"><strong>${date.day}</strong><span>${date.month}</span></div><div class="event-content"><p class="tag">${event.tag || "Событие"}</p><h3>${event.title}</h3><p class="event-description">${event.description}</p><p class="event-meta">${event.time || ""}</p></div></div>`;
        eventsList.append(card);
      });
    }
  }

  if (adminEventsList) {
    const allEvents = readEvents();
    const count = document.querySelector("#events-count");
    if (count) count.textContent = `${allEvents.length} ${allEvents.length === 1 ? "событие" : "событий"}`;
    adminEventsList.innerHTML = allEvents.length
      ? allEvents.map((event) => `<article class="admin-event"><div><strong>${event.title}</strong><span>${event.date} · ${event.time}</span></div><button type="button" data-delete-event="${event.id}">Удалить</button></article>`).join("")
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
  leaderForm.addEventListener("submit", (submitEvent) => {
    submitEvent.preventDefault();
    const formData = new FormData(leaderForm);
    const file = formData.get("image");
    const saveLeader = (image) => {
      const leader = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: formData.get("title"),
        tag: formData.get("tag"),
        description: formData.get("description"),
        image: image || "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80",
      };
      localStorage.setItem(leaderStorageKey, JSON.stringify([leader, ...readLeaders()]));
      leaderForm.reset();
      document.querySelector("#leader-form-message").textContent = "Лидер добавлен на сайт.";
      renderLeaders();
    };
    if (file instanceof File && file.size) {
      const reader = new FileReader();
      reader.addEventListener("load", () => saveLeader(reader.result));
      reader.readAsDataURL(file);
    } else {
      saveLeader("");
    }
  });
}

if (eventForm) {
  eventForm.addEventListener("submit", (submitEvent) => {
    submitEvent.preventDefault();
    const formData = new FormData(eventForm);
    const file = formData.get("image");
    const saveEvent = (image) => {
      const event = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: formData.get("title"),
        date: formData.get("date"),
        time: formData.get("time"),
        tag: formData.get("tag"),
        description: formData.get("description"),
        image: image || "https://images.unsplash.com/photo-1504052434569-70ad5836ab65?auto=format&fit=crop&w=900&q=80",
      };
      localStorage.setItem(eventStorageKey, JSON.stringify([event, ...readEvents()]));
      eventForm.reset();
      document.querySelector("#form-message").textContent = "Событие опубликовано на главной странице.";
      renderEvents();
    };

    if (file instanceof File && file.size) {
      const reader = new FileReader();
      reader.addEventListener("load", () => saveEvent(reader.result));
      reader.readAsDataURL(file);
    } else {
      saveEvent("");
    }
  });
}

renderEvents();
renderLeaders();
