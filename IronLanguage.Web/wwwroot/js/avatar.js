// Shared exercise presentation: changing expression never changes saved appearance.
window.AdamAvatar = {
  setEmotion(container, emotion) {
    if (!container || !["Neutral", "Happy", "Thinking", "Surprised", "Sad", "Supportive"].includes(emotion)) return;
    container.querySelectorAll("img[data-avatar-url]").forEach(img => {
      const url = new URL(img.dataset.avatarUrl, window.location.origin);
      url.searchParams.set("emotion", emotion);
      img.src = url.pathname + url.search;
      img.dataset.avatarEmotion = emotion;
    });
  }
};
