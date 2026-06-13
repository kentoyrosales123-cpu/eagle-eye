function toggleMenu() {
  const nav = document.getElementById("navMenu");
  nav.classList.toggle("active");
}

// Page load transition
window.addEventListener("load", () => {
  document.body.classList.add("loaded");

  const loader = document.querySelector(".page-loader");

  if (loader) {
    setTimeout(() => {
      loader.classList.add("hide");
    }, 350);
  }
});

// Smooth page navigation
document.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", function (e) {
    const href = this.getAttribute("href");

    if (!href || href.startsWith("#") || href.startsWith("http")) {
      return;
    }

    e.preventDefault();

    document.body.classList.add("page-fade-out");

    setTimeout(() => {
      window.location.href = href;
    }, 450);
  });
});

// Feature card hover effect
const cards = document.querySelectorAll(".feature-card, .system-card");

cards.forEach((card) => {
  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    card.style.background = `
      radial-gradient(circle at ${x}px ${y}px, rgba(212,175,55,0.18), transparent 35%),
      linear-gradient(145deg, rgba(47,79,47,0.45), rgba(0,0,0,0.7))
    `;
  });

  card.addEventListener("mouseleave", () => {
    card.style.background =
      "linear-gradient(145deg, rgba(47,79,47,0.45), rgba(0,0,0,0.7))";
  });
});