(() => {
  const path = location.pathname.replace(/^\/+|\/+$/g, "");
  const page = path || "index.html";
  const trackedPages = new Set(["index.html", "about.html", "leaders.html", "gallery.html", "holiday-gallery.html"]);

  if (!trackedPages.has(page) || document.visibilityState === "prerender") return;
  if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true || window.globalPrivacyControl === true) return;

  fetch("api/analytics.php", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({ page }),
  }).then(async (response) => {
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `HTTP ${response.status}`);
    }
  }).catch((error) => {
    console.error("Не удалось записать посещение страницы.", error);
  });
})();
